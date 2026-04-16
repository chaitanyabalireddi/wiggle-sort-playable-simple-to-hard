import {
	_decorator,
	Component,
	Node,
	Vec3,
	instantiate,
	Prefab,
	Quat,
	math,
	input,
	Input,
	EventMouse,
	EventTouch,
	geometry,
	Camera,
	MeshRenderer,
	Color,
	ParticleSystem,
	game,
	BoxCollider,
	PhysicsSystem,
} from "cc";
import { SnakePath } from "./SnakePath";

const { ccclass, property } = _decorator;

@ccclass("Snake")
export class Snake extends Component {
	@property(Prefab) headPrefab: Prefab = null;
	@property(Prefab) segmentPrefab: Prefab = null;
	@property segmentCount: number = 8;
	@property segmentSpacing: number = 0.45;
	@property headAttachOffset: number = 0.35;
	@property({ type: Node }) headTipNode: Node = null;
	@property moveSpeed: number = 5.0;
	@property wiggleAmount: number = 0.3;
	@property wiggleSpeed: number = 2.0;
	@property snakeColor: string = "green";
	@property({ type: Node }) existingHead: Node = null;
	@property({ type: [Node] }) existingSegments: Node[] = [];

	@property({
		type: Node,
		tooltip:
			"Empty node placed in the scene to define which direction this snake flies when tapped",
	})
	directionTarget: Node = null;

	@property({
		tooltip:
			"Minimum world-unit gap to detect collision with another snake",
	})
	collisionRadius: number = 0.6;

	@property({
		tooltip: "Distance from origin before snake is considered off-screen",
	})
	offScreenDistance: number = 20.0;

	@property({
		type: [Node],
		tooltip:
			"Snake nodes that must move out first before this snake can move. Assign the Snake root nodes here.",
	})
	blockedBy: Node[] = [];

	@property({
		type: SnakePath,
		tooltip:
			"Path this snake follows when tapped. Leave empty for straight-line movement.",
	})
	snakePath: SnakePath = null;

	// ── Internal state ────────────────────────────────────────────────────────
	private headNode: Node = null;
	private bodySegments: Node[] = [];

	private _done: boolean = false;
	private _isMoving: boolean = false;
	private _moveDir: Vec3 = new Vec3(0, 0, 1);

	// Saved original pose for bounce-back
	private _originPose: Vec3[] = [];
	private _originRotations: Quat[] = [];

	// Bounce-back lerp state
	private _isBouncing: boolean = false;
	private _bounceProgress: number = 0;
	private _bouncePose: Vec3[] = [];
	private _bounceRotations: Quat[] = [];

	// Head-trail history: segments follow the path the head has taken
	private readonly HISTORY_SIZE = 1024;
	private headHistory: Vec3[] = [];
	private headDistHist: number[] = [];
	private headHistIdx: number = 0;
	private totalDist: number = 0;
	private segmentLags: number[] = [];

	private time: number = 0;
	private phaseOffset: number = 0;
	private lastTravelDir: Vec3 = new Vec3(0, 0, 1);

	private lastClickTime: number = 0;
	private readonly CLICK_DEBOUNCE_MS = 300;

	// Blocked-wiggle shake state
	private _isShaking: boolean = false;
	private _shakeTimer: number = 0;
	private _shakeDuration: number = 0.4;
	private _shakeIntensity: number = 0.15;
	private _shakeFrequency: number = 30;
	private _shakeOriginPositions: { node: Node; pos: Vec3 }[] = [];

	// Path movement state
	private _pathDistance: number = 0;
	private _pathDirection: number = 1;
	private _pathTraveled: number = 0; // total distance traveled on path
	private _seekingHole: boolean = false;
	private _seekHolePos: Vec3 = new Vec3();
	private _seekHoleNode: Node = null;
	private _pathEntryDistance: number = -1; // Fixed entry point on path (set when movement starts)

	// Path waiting state
	private _waitingForPathClear: boolean = false;

	@property({
		tooltip: "How close the head must be to a hole to start seeking it",
	})
	holeSeekRadius: number = 5.0;

	@property({
		tooltip:
			"Distance to keep from other snakes when waiting for path to clear",
	})
	pathClearanceRadius: number = 4.0;

	@property({
		tooltip: "Minimum gap required before resuming movement after waiting",
	})
	minGapToResume: number = 3.0;

	// Hole entry animation state
	private _isEnteringHole: boolean = false;
	private _enterHolePos: Vec3 = new Vec3();
	private _enterHoleProgress: number = 0;
	private _enterHoleDuration: number = 0.3;
	private _enterHoleCallback: (() => void) | null = null;
	private _enterHolePose: Vec3[] = [];
	private _seekHoleStartDist: number = 0;
	private _seekHoleLastArcY: number = 0;
	// ─────────────────────────────────────────────────────────────────────────
	// Legacy compat — _isJoining / _hasFinishedJoining kept so external
	// references (GameManager, TutorialHand) don't break, but the queue no
	// longer waits on them.
	private _isJoining: boolean = false;
	private _hasFinishedJoining: boolean = false;
	get isJoining(): boolean {
		return this._isJoining;
	}
	hasFinishedJoining(): boolean {
		return this._hasFinishedJoining;
	}

	// ─────────────────────────────────────────────────────────────────────────
	start() {
		this.phaseOffset = Math.random() * Math.PI * 2;
		this.createSnake();
		this.seedHistoryFromPose();
		this.computeHeadDirection();
		const box = this.headNode.addComponent(BoxCollider);
		const size = new Vec3(3, 3, 3);
		box.size = size;
		// Auto-discover path from parent level node if not manually assigned
		if (!this.snakePath) {
			this.snakePath = this.findPathInParents();
		}
		if (this.snakePath) {
			const headPos = this.headNode
				? this.headNode.getWorldPosition()
				: this.node.getWorldPosition();
			this._pathDistance = this.snakePath.getClosestDistance(headPos);
		}
	}

	private findPathInParents(): SnakePath | null {
		let n: Node = this.node;
		while (n) {
			if (n.parent) {
				for (const child of n.parent.children) {
					const sp = child.getComponent(SnakePath);
					if (sp) return sp;
				}
			}
			const sp = n.getComponent(SnakePath);
			if (sp) return sp;
			n = n.parent;
		}
		return null;
	}

	onEnable() {
		input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
		input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
	}

	onDisable() {
		input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
		input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
	}

	onDestroy() {
		input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
		input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
	}

	private onMouseDown(e: EventMouse) {
		this.checkClick(e.getLocationX(), e.getLocationY());
	}
	private onTouchStart(e: EventTouch) {
		const t = e.getTouches()[0];
		this.checkClick(t.getLocationX(), t.getLocationY());
	}

	private checkClick(sx: number, sy: number) {
		if (!this.node.activeInHierarchy) return;
		if (this._done || this._isBouncing || this._isEnteringHole) return;
		const cam = this.findMainCamera();
		if (!cam) return;
		const ray = cam.screenPointToRay(sx, sy);
		if (PhysicsSystem.instance.raycastClosest(ray)) {
			if (
				PhysicsSystem.instance.raycastClosestResult.collider.node
					.parent === this.node
			)
				this.onSnakeClicked();
			return;
		}
		// for (const seg of this.bodySegments) {
		// 	if (this.checkRayIntersection(ray, seg)) {
		// 		this.onSnakeClicked();
		// 		return;
		// 	}
		// }
	}

	private findMainCamera(): Camera | null {
		const n =
			this.node.scene?.getChildByName("Camera") ||
			this.node.scene?.getChildByName("Main Camera");
		return n ? n.getComponent(Camera) : null;
	}

	// private checkRayIntersection(
	// 	ray: geometry.Ray,
	// 	target: Node | null,
	// ): boolean {
	// 	if (!target?.active) return false;
	// 	const wp = target.getWorldPosition();
	// 	const tp = new Vec3();
	// 	Vec3.subtract(tp, wp, ray.o);
	// 	const t = Vec3.dot(tp, ray.d);
	// 	if (t < 0) return false;
	// 	const cl = new Vec3();
	// 	Vec3.scaleAndAdd(cl, ray.o, ray.d, t);
	// 	const dv = new Vec3();
	// 	Vec3.subtract(dv, cl, wp);
	// 	return Vec3.dot(dv, dv) < 0.2;
	// }

	// ── Color ─────────────────────────────────────────────────────────────────
	private getSnakeColor(): Color {
		switch (this.snakeColor.toLowerCase()) {
			case "red":
				return new Color(230, 50, 60, 255);
			case "blue":
				return new Color(70, 140, 220, 255);
			case "green":
				return new Color(80, 200, 60, 255);
			case "yellow":
				return new Color(240, 210, 30, 255);
			case "purple":
				return new Color(140, 80, 210, 255);
			case "orange":
				return new Color(255, 140, 30, 255);
			case "pink":
				return new Color(240, 80, 160, 255);
			case "cyan":
				return new Color(60, 210, 210, 255);
			case "brown":
				return new Color(160, 90, 40, 255);
			case "grey":
			case "gray":
				return new Color(150, 150, 160, 255);
			default:
				return new Color(80, 200, 60, 255);
		}
	}

	private applyColor(node: Node | null, color: Color) {
		if (!node) return;
		const r = node.getComponent(MeshRenderer);
		if (r?.material) r.material.setProperty("mainColor", color);
	}

	// ── Construction ──────────────────────────────────────────────────────────
	private createSnake() {
		if (this.existingHead) {
			this.headNode = this.existingHead;
		} else if (this.headPrefab) {
			this.headNode = instantiate(this.headPrefab);
			this.headNode.setParent(this.node);
			this.headNode.setPosition(Vec3.ZERO);
		} else {
			this.headNode =
				this.node.getChildByPath("Head") ||
				this.node.children.find((c) =>
					c.name.toLowerCase().includes("head"),
				);
		}

		if (this.existingSegments.length > 0) {
			this.bodySegments = [...this.existingSegments];
		} else if (this.node.children.length <= 1) {
			for (let i = 0; i < this.segmentCount; i++) {
				if (this.segmentPrefab) {
					const seg = instantiate(this.segmentPrefab);
					seg.setParent(this.node);
					seg.setPosition(Vec3.ZERO);
					this.bodySegments.push(seg);
				}
			}
		} else {
			this.bodySegments = this.node.children.filter(
				(c) => c !== this.headNode,
			);
		}
	}

	// ── Compute head facing direction from its current rotation ──────────────
	private computeHeadDirection() {
		if (!this.headNode) return;

		const headPos = this.headNode.getWorldPosition();

		if (this.directionTarget) {
			const targetPos = this.directionTarget.getWorldPosition();
			const dir = new Vec3();
			Vec3.subtract(dir, targetPos, headPos);
			dir.y = 0;
			if (dir.lengthSqr() > 0.0001) {
				Vec3.normalize(dir, dir);
				this._moveDir.set(dir);
				this.lastTravelDir.set(dir);
				return;
			}
		}

		const rot = this.headNode.getWorldRotation();
		const fwd = new Vec3(0, 0, 1);
		Vec3.transformQuat(fwd, fwd, rot);
		fwd.y = 0;
		if (fwd.lengthSqr() > 0.0001) {
			Vec3.normalize(fwd, fwd);
		} else {
			fwd.set(0, 0, 1);
		}
		this._moveDir.set(fwd);
		this.lastTravelDir.set(fwd);
	}

	// ── Helper: get all snake nodes ───────────────────────────────────────────
	public getAllNodes(): Node[] {
		const nodes: Node[] = [];
		if (this.headNode) nodes.push(this.headNode);
		for (const seg of this.bodySegments) if (seg) nodes.push(seg);
		return nodes;
	}

	// ── History trail (seeded from the current editor pose) ──────────────────
	private seedHistoryFromPose() {
		const posePoints: Vec3[] = [];
		if (this.headNode)
			posePoints.push(this.headNode.getWorldPosition().clone());
		for (const seg of this.bodySegments) {
			if (seg) posePoints.push(seg.getWorldPosition().clone());
		}
		if (posePoints.length === 0) return;

		const poseDist: number[] = [0];
		for (let i = 1; i < posePoints.length; i++) {
			poseDist.push(
				poseDist[i - 1] +
					Vec3.distance(posePoints[i - 1], posePoints[i]),
			);
		}
		const totalPoseLen = poseDist[poseDist.length - 1] || 1;

		for (let i = 0; i < this.HISTORY_SIZE; i++) {
			const frac = i / (this.HISTORY_SIZE - 1);
			const targetLen = (1 - frac) * totalPoseLen;
			const pt = this.samplePoseChain(posePoints, poseDist, targetLen);
			this.headHistory[i] = pt;
			this.headDistHist[i] = frac * totalPoseLen;
		}
		this.headHistIdx = this.HISTORY_SIZE - 1;
		this.totalDist = totalPoseLen;

		this.segmentLags = [];
		for (let i = 0; i < this.bodySegments.length; i++) {
			if (i + 1 < poseDist.length) {
				this.segmentLags.push(poseDist[i + 1]);
			} else {
				this.segmentLags.push(this.segmentSpacing * (i + 1));
			}
		}
	}

	private samplePoseChain(
		points: Vec3[],
		dists: number[],
		targetDist: number,
	): Vec3 {
		if (targetDist <= 0) return points[0].clone();
		for (let i = 1; i < points.length; i++) {
			if (dists[i] >= targetDist) {
				const segLen = dists[i] - dists[i - 1];
				const t =
					segLen > 0.0001 ? (targetDist - dists[i - 1]) / segLen : 0;
				const out = new Vec3();
				Vec3.lerp(out, points[i - 1], points[i], t);
				return out;
			}
		}
		return points[points.length - 1].clone();
	}

	private sampleHistory(targetDist: number): Vec3 {
		const oldest = (this.headHistIdx + 1) % this.HISTORY_SIZE;
		if (targetDist <= this.headDistHist[oldest])
			return this.headHistory[oldest].clone();

		let idx = this.headHistIdx;
		for (let s = 0; s < this.HISTORY_SIZE - 1; s++) {
			const prev = (idx - 1 + this.HISTORY_SIZE) % this.HISTORY_SIZE;
			if (this.headDistHist[prev] <= targetDist) {
				const d0 = this.headDistHist[prev],
					d1 = this.headDistHist[idx];
				const t = d1 - d0 > 0.0001 ? (targetDist - d0) / (d1 - d0) : 0;
				const out = new Vec3();
				Vec3.lerp(
					out,
					this.headHistory[prev],
					this.headHistory[idx],
					t,
				);
				return out;
			}
			idx = prev;
		}
		return this.headHistory[oldest].clone();
	}

	private faceMovementDirection(node: Node, from: Vec3, to: Vec3) {
		if (!node) return;
		const dir = new Vec3();
		Vec3.subtract(dir, to, from);
		dir.y = 0;
		if (dir.lengthSqr() < 0.000001) return;
		Vec3.normalize(dir, dir);
		const angle = Math.atan2(dir.x, dir.z);
		const q = new Quat();
		Quat.fromEuler(q, 0, math.toDegree(angle), 0);
		node.setWorldRotation(q);
	}

	// ── Click handler ─────────────────────────────────────────────────────────
	private onSnakeClicked() {
		const now = Date.now();

		// Debug logging to identify the issue
		console.log(
			`[Snake Click] ${this.snakeColor} - State: done=${this._done}, enteringHole=${this._isEnteringHole}, isMoving=${this._isMoving}, seekingHole=${this._seekingHole}, isBouncing=${this._isBouncing}, isShaking=${this._isShaking}`,
		);

		// First, check if the snake is already destroyed or done
		if (this._done || this._isEnteringHole) {
			console.log(
				`[Snake Click] ${this.snakeColor} - Rejected: done or entering hole`,
			);
			return;
		}

		// Debounce check - but reduce the debounce time for better responsiveness
		if (now - this.lastClickTime < this.CLICK_DEBOUNCE_MS) {
			console.log(
				`[Snake Click] ${this.snakeColor} - Rejected: debounce`,
			);
			return;
		}

		// Check if the snake is in a "busy" state that prevents movement
		// But allow clicking if it's just idle (not moving)
		if (this._isMoving || this._seekingHole) {
			console.log(
				`[Snake Click] ${this.snakeColor} - Already moving or seeking hole, ignoring`,
			);
			return;
		}

		if (this._isBouncing || this._isShaking) {
			console.log(
				`[Snake Click] ${this.snakeColor} - Bouncing or shaking, ignoring`,
			);
			return;
		}

		// Check if blocked by other snakes that haven't left yet
		const blockers = this.getActiveBlockers();
		if (blockers.length > 0) {
			console.log(
				`[Snake Click] ${this.snakeColor} - Blocked by ${blockers.length} snakes`,
			);
			this.startBlockedShake();
			for (const blocker of blockers) {
				blocker.startBlockedShake();
			}
			this._emitSceneEvent("sfx-wrong-tap");
			return;
		}

		// All checks passed - process the click
		console.log(
			`[Snake Click] ${this.snakeColor} - ACCEPTED, starting movement`,
		);
		this.lastClickTime = now;
		this._emitSceneEvent("sfx-snake-tap");
		this.saveOriginPose();
		this.node.emit("snake-clicked", { snake: this });

		// Start moving immediately — no freeze/queue needed
		this.beginMoving();
	}

	public getActiveBlockers(): Snake[] {
		const result: Snake[] = [];
		const myNodes = this.getAllNodes();
		for (const blockerNode of this.blockedBy) {
			if (!blockerNode || !blockerNode.isValid || !blockerNode.active)
				continue;
			const snake = blockerNode.getComponent(Snake);
			if (!snake || snake._done) continue;
			if (this.isOverlapping(myNodes, snake.getAllNodes())) {
				result.push(snake);
			}
		}
		return result;
	}

	private isOverlapping(nodesA: Node[], nodesB: Node[]): boolean {
		for (const a of nodesA) {
			if (!a?.active) continue;
			const pa = a.getWorldPosition();
			for (const b of nodesB) {
				if (!b?.active) continue;
				const pb = b.getWorldPosition();
				const dx = pa.x - pb.x;
				const dz = pa.z - pb.z;
				if (
					dx * dx + dz * dz <
					this.collisionRadius * this.collisionRadius
				) {
					return true;
				}
			}
		}
		return false;
	}

	public startBlockedShake() {
		if (this._isShaking || this._isMoving || this._isBouncing) return;
		this._isShaking = true;
		this._shakeTimer = 0;
		this._shakeOriginPositions = [];
		const nodes = this.getAllNodes();
		for (const n of nodes) {
			this._shakeOriginPositions.push({
				node: n,
				pos: n.getWorldPosition().clone(),
			});
		}
	}

	private _emitSceneEvent(eventName: string): void {
		let n: Node = this.node;
		while (n.parent) {
			n = n.parent;
			n.emit(eventName, { snake: this });
		}
	}

	private saveOriginPose() {
		this._originPose = [];
		this._originRotations = [];
		if (this.headNode) {
			this._originPose.push(this.headNode.getWorldPosition().clone());
			this._originRotations.push(
				this.headNode.getWorldRotation().clone(),
			);
		}
		for (const seg of this.bodySegments) {
			if (seg) {
				this._originPose.push(seg.getWorldPosition().clone());
				this._originRotations.push(seg.getWorldRotation().clone());
			}
		}
	}

	public beginMoving() {
		if (this.snakePath) {
			const headPos = this.headNode.getWorldPosition();
			this._pathDistance = this.snakePath.getClosestDistance(headPos);
			this._pathEntryDistance = this._pathDistance;
			this._pathDirection = 1;
		}
		this._pathTraveled = 0;
		this._isMoving = true;
		this._isJoining = true;
		this._hasFinishedJoining = false;
	}

	update(deltaTime: number) {
		if (this._done) return;
		this.time += deltaTime;
		if (!this.headNode) return;

		// ── Blocked wiggle animation ─────────────────────────────────────────
		if (this._isShaking) {
			this._shakeTimer += deltaTime;
			if (this._shakeTimer >= this._shakeDuration) {
				for (const entry of this._shakeOriginPositions) {
					if (entry.node?.isValid)
						entry.node.setWorldPosition(entry.pos);
				}
				this._isShaking = false;
				this._shakeOriginPositions = [];
			} else {
				const progress = this._shakeTimer / this._shakeDuration;
				const fadeOut = 1 - progress;
				const perp = new Vec3(-this._moveDir.z, 0, this._moveDir.x);
				const count = this._shakeOriginPositions.length;
				for (let i = 0; i < count; i++) {
					const entry = this._shakeOriginPositions[i];
					if (!entry.node?.isValid) continue;
					const segPhase = (i / Math.max(1, count - 1)) * Math.PI * 2;
					const amplitude = this._shakeIntensity * fadeOut;
					const tailScale = 1.0 + (i / Math.max(1, count - 1)) * 0.5;
					const offset =
						Math.sin(
							this._shakeTimer * this._shakeFrequency - segPhase,
						) *
						amplitude *
						tailScale;
					const p = entry.pos.clone();
					p.x += perp.x * offset;
					p.z += perp.z * offset;
					entry.node.setWorldPosition(p);
				}
			}
			return;
		}

		// ── Hole entry animation ─────────────────────────────────────────────
		if (this._isEnteringHole) {
			const step = this.moveSpeed * deltaTime;
			this.node.getChildByName("Head").getChildByName("Eyelid").active =
				false;
			this.node
				.getChildByName("Head")
				.getChildByName("Eyelid-001").active = false;
			// Get current head position
			const headCurrentPos = this.headNode.getWorldPosition();
			const toHole = new Vec3();
			Vec3.subtract(toHole, this._enterHolePos, headCurrentPos);

			// Calculate target position (hole position at y = -1)
			const targetPos = this._enterHolePos.clone();
			targetPos.y = -1;

			// Move head towards target position (including Y axis)
			const toTarget = new Vec3();
			Vec3.subtract(toTarget, targetPos, headCurrentPos);
			const distToTarget = toTarget.length();

			let newHeadPos: Vec3;
			if (distToTarget > 0.01) {
				Vec3.normalize(toTarget, toTarget);
				newHeadPos = new Vec3();
				Vec3.scaleAndAdd(
					newHeadPos,
					headCurrentPos,
					toTarget,
					Math.min(step, distToTarget),
				);
			} else {
				// Already at target, continue in last direction
				const continueDir = this.lastTravelDir.clone();
				newHeadPos = new Vec3();
				Vec3.scaleAndAdd(newHeadPos, headCurrentPos, continueDir, step);
			}

			// Record head position in history (includes Y coordinate)
			const actualStep = Vec3.distance(headCurrentPos, newHeadPos);
			this.totalDist += actualStep;
			this.headHistIdx = (this.headHistIdx + 1) % this.HISTORY_SIZE;
			this.headHistory[this.headHistIdx] = newHeadPos.clone();
			this.headDistHist[this.headHistIdx] = this.totalDist;

			// Update head position
			this.headNode.setWorldPosition(newHeadPos);

			// Update head rotation based on movement direction (including vertical?)
			const moveDelta = new Vec3();
			Vec3.subtract(moveDelta, newHeadPos, headCurrentPos);
			if (moveDelta.lengthSqr() > 0.000001) {
				// For rotation, ignore Y axis to keep snake upright
				const horizDir = new Vec3(moveDelta.x, 0, moveDelta.z);
				if (horizDir.lengthSqr() > 0.000001) {
					Vec3.normalize(horizDir, horizDir);
					this.lastTravelDir.set(horizDir);
					const angle = Math.atan2(horizDir.x, horizDir.z);
					const q = new Quat();
					Quat.fromEuler(q, 0, math.toDegree(angle) + 85, 0);
					this.headNode.setWorldRotation(q);
				}
			}

			// ── Each body segment follows the head's trail (including Y movement) ──
			for (let i = 0; i < this.bodySegments.length; i++) {
				const seg = this.bodySegments[i];
				if (!seg?.active) continue;

				const prevSegPos = seg.getWorldPosition();
				const lagDist = this.totalDist - this.segmentLags[i];
				const segPos = this.sampleHistory(lagDist); // This now includes Y coordinate from history
				seg.setWorldPosition(segPos);
				this.faceMovementDirection(seg, prevSegPos, segPos);
			}

			// Check if head has reached the target position
			const headAtTarget = Vec3.distance(newHeadPos, targetPos) < 0.2;
			const allSegmentsAtTarget = this.bodySegments.every((seg, idx) => {
				if (!seg?.active) return true;
				const lagDist = this.totalDist - this.segmentLags[idx];
				const segPos = this.sampleHistory(lagDist);
				return Vec3.distance(segPos, targetPos) < 0.3;
			});

			this._enterHoleProgress += deltaTime / this._enterHoleDuration;

			// Complete when head reaches target and all segments have followed
			if (
				(headAtTarget && allSegmentsAtTarget) ||
				this._enterHoleProgress >= 3.0
			) {
				// Ensure final position is exactly at target
				this.headNode.setWorldPosition(targetPos);

				// Set all segments to final position
				for (let i = 0; i < this.bodySegments.length; i++) {
					const seg = this.bodySegments[i];
					if (!seg?.active) continue;
					const lagDist = this.totalDist - this.segmentLags[i];
					const finalPos = this.sampleHistory(lagDist);
					seg.setWorldPosition(finalPos);
				}

				if (this._enterHoleCallback) this._enterHoleCallback();
				this._done = true;
				this.node.emit("snake-done", { snake: this });
				this._emitSceneEvent("snake-done");
				this.node.destroy();
			}
			return;
		}

		// ── Bounce-back ──────────────────────────────────────────────────────
		if (this._isBouncing) {
			this._bounceProgress += deltaTime * 3.0;
			const t = this.easeInOut(Math.min(1, this._bounceProgress));

			const nodes: Node[] = [];
			if (this.headNode) nodes.push(this.headNode);
			for (const seg of this.bodySegments) if (seg) nodes.push(seg);

			for (let i = 0; i < nodes.length; i++) {
				if (
					i < this._bouncePose.length &&
					i < this._originPose.length
				) {
					const p = new Vec3();
					Vec3.lerp(p, this._bouncePose[i], this._originPose[i], t);
					nodes[i].setWorldPosition(p);
				}
				if (
					i < this._bounceRotations.length &&
					i < this._originRotations.length
				) {
					const r = new Quat();
					Quat.slerp(
						r,
						this._bounceRotations[i],
						this._originRotations[i],
						t,
					);
					nodes[i].setWorldRotation(r);
				}
			}

			if (this._bounceProgress >= 1.0) {
				this._isBouncing = false;
				for (
					let i = 0;
					i < nodes.length && i < this._originPose.length;
					i++
				) {
					nodes[i].setWorldPosition(this._originPose[i]);
					if (i < this._originRotations.length)
						nodes[i].setWorldRotation(this._originRotations[i]);
				}
				this.seedHistoryFromPose();
			}
			return;
		}

		if (!this._isMoving) return;

		const prevHeadPos = this.headNode.getWorldPosition();
		const step = this.moveSpeed * deltaTime;
		let newHeadPos: Vec3;

		if (this._seekingHole) {
			// ── Seeking hole ─────────────────────────────────────────────────
			const toHole = new Vec3();
			Vec3.subtract(toHole, this._seekHolePos, prevHeadPos);
			toHole.y = 0;
			const distToHole = toHole.length();
			if (distToHole < step) {
				// console.log("here - reached hole", distToHole, step);
				// Snap head exactly to hole XZ, but keep the current arc Y
				// so there's no pop — the entry animation will take it down from here
				newHeadPos = this._seekHolePos.clone();
				newHeadPos.y = prevHeadPos.y; // don't snap Y, let entry anim handle it

				// Write final seeking position into history before switching states
				const actualStep = Vec3.distance(prevHeadPos, newHeadPos);
				this.totalDist += actualStep;
				this.headHistIdx = (this.headHistIdx + 1) % this.HISTORY_SIZE;
				this.headHistory[this.headHistIdx] = newHeadPos.clone();
				this.headDistHist[this.headHistIdx] = this.totalDist;
				this.headNode.setWorldPosition(newHeadPos);

				// Update body segments one last time at seeking state
				for (let i = 0; i < this.bodySegments.length; i++) {
					const seg = this.bodySegments[i];
					if (!seg?.active) continue;
					const prevSegPos = seg.getWorldPosition();
					const lagDist = this.totalDist - this.segmentLags[i];
					const segPos = this.sampleHistory(lagDist);
					seg.setWorldPosition(segPos);
					this.faceMovementDirection(seg, prevSegPos, segPos);
				}

				// Reset arc state and transition
				this._seekHoleLastArcY = 0;
				this._seekingHole = false;
				// this._isMoving = false;
				this._isEnteringHole = true;
				this._enterHolePos.set(this._seekHolePos);
				this._enterHoleProgress = 0;

				const holeNode = this._seekHoleNode;
				const hole = holeNode?.getComponent?.("Hole") as any;
				if (hole?.entryParticlePrefab) {
					const fx = instantiate(hole.entryParticlePrefab);
					const spawnPos = this._enterHolePos.clone();
					spawnPos.y += hole.particleYOffset ?? 0.5;
					fx.setWorldPosition(spawnPos);
					fx.setParent(this.node.scene);
					const ps =
						fx.getComponent(ParticleSystem) ??
						fx.getComponentInChildren(ParticleSystem);
					if (ps) {
						ps.loop = true;
						ps.stop();
						ps.play();
					}
					const particlePlayTime = hole.particlePlayTime ?? 2.0;
					setTimeout(() => {
						if (!fx?.isValid) return;
						const ps2 =
							fx.getComponent(ParticleSystem) ??
							fx.getComponentInChildren(ParticleSystem);
						ps2?.stop();
						setTimeout(() => {
							if (fx?.isValid) fx.destroy();
						}, 1000);
					}, particlePlayTime * 1000);
				}

				this._enterHoleCallback = () => {
					if (hole?.advanceColor) hole.advanceColor();
				};
				this._emitSceneEvent("sfx-snake-enter-hole");

				// Return early — history/position already written above
				return;
			} else {
				// Move horizontally toward the hole
				Vec3.normalize(toHole, toHole);
				newHeadPos = new Vec3();
				Vec3.scaleAndAdd(newHeadPos, prevHeadPos, toHole, step);

				// ── Upward then downward arc: sine curve peaking at +0.5y at midpoint ──
				const progress =
					this._seekHoleStartDist > 0
						? 1 - distToHole / this._seekHoleStartDist // 0 at start → 1 at hole
						: 0;
				const arcY = Math.sin(progress * Math.PI) * 2; // peaks at progress=0.5
				newHeadPos.y = prevHeadPos.y + (arcY - this._seekHoleLastArcY);
				this._seekHoleLastArcY = arcY;
			}
		} else if (this.snakePath) {
			// ── Path-based movement ──────────────────────────────────────────
			const pathLen = this.snakePath.getPathLength();
			const currentTarget = this.snakePath.getPointAtDistance(
				this._pathDistance,
			);
			const toTarget = new Vec3();
			Vec3.subtract(toTarget, currentTarget, prevHeadPos);
			toTarget.y = 0;
			const distToPath = toTarget.length();

			if (distToPath > 0.1) {
				// Phase 1: walking toward the path entry point.
				Vec3.normalize(toTarget, toTarget);
				const candidatePos = new Vec3();
				Vec3.scaleAndAdd(
					candidatePos,
					prevHeadPos,
					toTarget,
					Math.min(step, distToPath),
				);

				const hitIdleSnake =
					this.checkCollisionWithOthers(candidatePos);
				if (hitIdleSnake && !hitIdleSnake._isMoving) {
					// Hit an idle snake — bounce back to original position
					this._isMoving = false;
					this._seekingHole = false;
					this._isJoining = false;
					this._hasFinishedJoining = false;
					this.startBounceBack();
					return;
				} else if (
					this.isBlockedByOnPathSnake(candidatePos) ||
					hitIdleSnake
				) {
					newHeadPos = prevHeadPos.clone(); // wait for moving snake to clear
				} else {
					newHeadPos = candidatePos;
				}
			} else {
				// Phase 2: on the path — advance along it.
				const bodyLength =
					this.bodySegments.length * this.segmentSpacing + 1.0;
				if (this._isJoining && this._pathTraveled >= bodyLength) {
					this._isJoining = false;
					this._hasFinishedJoining = true;
				}

				if (this.mustYieldToHigherPrioritySnake(prevHeadPos)) {
					newHeadPos = prevHeadPos.clone();
					this._waitingForPathClear = true;
				} else {
					this._waitingForPathClear = false;
					this._pathDistance += this._pathDirection * step;
					this._pathTraveled += step;
					if (pathLen > 0) {
						this._pathDistance =
							((this._pathDistance % pathLen) + pathLen) %
							pathLen;
					}
					newHeadPos = this.snakePath.getPointAtDistance(
						this._pathDistance,
					);

					if (this._pathTraveled >= pathLen * 0.33) {
						this._checkForNearbyHole(newHeadPos);
					}
				}
			}
		} else {
			// ── Straight-line movement (fallback) ────────────────────────────
			newHeadPos = new Vec3();
			Vec3.scaleAndAdd(newHeadPos, prevHeadPos, this._moveDir, step);

			const hitSnake = this.checkCollisionWithOthers(newHeadPos);
			if (hitSnake) {
				newHeadPos = prevHeadPos.clone();
			}
		}

		// ── Off-screen check (only for non-path movement) ────────────────────
		if (!this.snakePath && this.isAllOffScreen()) {
			this._isMoving = false;
			if (this._isJoining) {
				this._isJoining = false;
				this._hasFinishedJoining = true;
			}
			this._done = true;
			this.node.emit("snake-done", { snake: this });
			this._emitSceneEvent("snake-done");
			this.node.destroy();
			return;
		}

		// ── Record head position in history ring buffer ───────────────────────
		const actualStep = Vec3.distance(prevHeadPos, newHeadPos);
		this.totalDist += actualStep;
		this.headHistIdx = (this.headHistIdx + 1) % this.HISTORY_SIZE;
		this.headHistory[this.headHistIdx] = newHeadPos.clone();
		this.headDistHist[this.headHistIdx] = this.totalDist;

		this.headNode.setWorldPosition(newHeadPos);
		const moveDelta = new Vec3();
		Vec3.subtract(moveDelta, newHeadPos, prevHeadPos);
		moveDelta.y = 0;
		if (moveDelta.lengthSqr() > 0.000001) {
			Vec3.normalize(moveDelta, moveDelta);
			this.lastTravelDir.set(moveDelta);
			const angle = Math.atan2(moveDelta.x, moveDelta.z);
			const q = new Quat();
			Quat.fromEuler(q, 0, math.toDegree(angle) + 85, 0);
			this.headNode.setWorldRotation(q);
		}

		// ── Each body segment follows the head's trail with a lag ─────────────
		for (let i = 0; i < this.bodySegments.length; i++) {
			const seg = this.bodySegments[i];
			if (!seg?.active) continue;

			const prevSegPos = seg.getWorldPosition();
			const lagDist = this.totalDist - this.segmentLags[i];
			const segPos = this.sampleHistory(lagDist);
			seg.setWorldPosition(segPos);
			this.faceMovementDirection(seg, prevSegPos, segPos);
		}
	}

	// ── Collision detection with other snakes ─────────────────────────────────
	private checkCollisionWithOthers(headPos: Vec3): Snake | null {
		const allSnakes = this.node.scene.getComponentsInChildren(Snake);
		for (const other of allSnakes) {
			if (other === this) continue;
			if (other._done || !other.node.activeInHierarchy) continue;

			const otherNodes: Node[] = [];
			if (other.headNode?.active) otherNodes.push(other.headNode);
			for (const seg of other.bodySegments)
				if (seg?.active) otherNodes.push(seg);

			for (const child of otherNodes) {
				const diff = new Vec3();
				Vec3.subtract(diff, child.getWorldPosition(), headPos);
				diff.y = 0;
				if (diff.length() < this.collisionRadius) {
					return other;
				}
			}
		}
		return null;
	}

	// ── Helper: check if a snake has actually joined the path (not just approaching)
	private isOnPath(): boolean {
		if (!this.snakePath) return false;
		if (this._pathTraveled <= 0) return false;
		if (!this.headNode) return false;
		const headPos = this.headNode.getWorldPosition();
		const pathPoint = this.snakePath.getPointAtDistance(this._pathDistance);
		const diff = new Vec3();
		Vec3.subtract(diff, headPos, pathPoint);
		diff.y = 0;
		return diff.length() < this.collisionRadius;
	}

	// ── Helper: check if ALL segments of a snake have cleared the entry area ──
	private hasFullyEnteredPath(): boolean {
		if (!this.snakePath) return false;
		if (!this.isOnPath()) return false;
		if (this._pathEntryDistance < 0) return true; // No entry point set, assume fully entered

		const pathLen = this.snakePath.getPathLength();
		const entryPoint = this.snakePath.getPointAtDistance(
			this._pathEntryDistance,
		);

		// Check all nodes (head + segments) are clear of entry area
		for (const node of this.getAllNodes()) {
			if (!node?.active) continue;
			const nodePos = node.getWorldPosition();

			// Find closest point on path to this node
			const closestDist = this.snakePath.getClosestDistance(nodePos);
			const distFromEntry = Math.abs(
				closestDist - this._pathEntryDistance,
			);
			const minPathDist =
				pathLen > 0
					? Math.min(distFromEntry, pathLen - distFromEntry)
					: distFromEntry;

			// Also check direct world distance to entry point
			const diff = new Vec3();
			Vec3.subtract(diff, nodePos, entryPoint);
			diff.y = 0;
			const worldDist = diff.length();

			// Node is still near entry if it's close in world space OR hasn't moved far along path
			// Need to travel at least body length + clearance to be "fully entered"
			const bodyLength = this.bodySegments.length * this.segmentSpacing;
			const clearanceNeeded = bodyLength + this.collisionRadius * 2;

			if (minPathDist < clearanceNeeded && worldDist < clearanceNeeded) {
				return false; // This segment is still near the entry point
			}
		}
		return true;
	}

	// ── Phase 1: stop if an on-path snake segment is within touching distance ──
	private isBlockedByOnPathSnake(candidatePos: Vec3): boolean {
		const allSnakes = this.node.scene.getComponentsInChildren(Snake);
		for (const other of allSnakes) {
			if (other === this) continue;
			if (other._done || !other.node.activeInHierarchy) continue;
			if (!other._isMoving || other._isEnteringHole) continue;
			if (other.snakePath !== this.snakePath) continue;
			if (!other.isOnPath()) continue; // other also still approaching — don't block each other

			for (const n of other.getAllNodes()) {
				if (!n?.active) continue;
				const diff = new Vec3();
				Vec3.subtract(diff, n.getWorldPosition(), candidatePos);
				diff.y = 0;
				if (diff.length() < this.collisionRadius) return true;
			}
		}
		return false;
	}

	// ── Phase 2: yield only to snakes with higher priority ─
	// Priority: 1) Snakes already on path beat those still approaching
	//          2) Higher pathTraveled wins (been on path longer)
	//          3) If other snake hasn't fully entered yet, wait for it to clear
	private mustYieldToHigherPrioritySnake(myHeadPos: Vec3): boolean {
		const allSnakes = this.node.scene.getComponentsInChildren(Snake);
		for (const other of allSnakes) {
			if (other === this) continue;
			if (other._done || !other.node.activeInHierarchy) continue;
			if (!other._isMoving || other._isEnteringHole) continue;
			if (other.snakePath !== this.snakePath) continue;

			const otherOnPath = other.isOnPath();
			const thisOnPath = this.isOnPath();

			// If I'm not on path yet but other is, I yield
			if (!thisOnPath && otherOnPath) {
				// Check if other is actually close enough to collide
				for (const n of other.getAllNodes()) {
					if (!n?.active) continue;
					const diff = new Vec3();
					Vec3.subtract(diff, n.getWorldPosition(), myHeadPos);
					diff.y = 0;
					if (diff.length() < this.collisionRadius) return true;
				}
				continue;
			}

			// If both on path, use pathTraveled to determine priority
			if (thisOnPath && otherOnPath) {
				// FIRST: Check for immediate collision regardless of priority
				let willCollide = false;
				for (const n of other.getAllNodes()) {
					if (!n?.active) continue;
					const diff = new Vec3();
					Vec3.subtract(diff, n.getWorldPosition(), myHeadPos);
					diff.y = 0;
					if (diff.length() < this.collisionRadius) {
						willCollide = true;
						break;
					}
				}
				if (!willCollide) continue; // No collision possible, proceed

				// SECOND: If other hasn't fully entered, always wait for them to clear
				// regardless of who has priority - prevents collision at entry point
				if (!other.hasFullyEnteredPath()) {
					return true; // Wait for other to fully enter and clear
				}

				// THIRD: Determine who has priority based on pathTraveled
				// Higher pathTraveled = on path longer = has priority
				if (this._pathTraveled > other._pathTraveled) {
					// I have priority, and other has fully entered - check if safe to pass
					// Check if I'm approaching from behind with enough gap
					const bodyLength =
						this.bodySegments.length * this.segmentSpacing;
					const minGap = bodyLength + this.collisionRadius * 2;

					// Check distance along path
					const pathLen = this.snakePath.getPathLength();
					const distAlongPath = Math.abs(
						this._pathDistance - other._pathDistance,
					);
					const minPathGap =
						pathLen > 0
							? Math.min(distAlongPath, pathLen - distAlongPath)
							: distAlongPath;

					if (minPathGap > minGap) {
						continue; // Safe gap, I can proceed
					}
					return true; // Too close, wait
				}

				// I don't have priority - check edge case for circular paths
				if (
					other._pathTraveled > this._pathTraveled &&
					this._pathEntryDistance >= 0
				) {
					const otherDistFromMyEntry = Math.abs(
						other._pathDistance - this._pathEntryDistance,
					);
					const pathLen = this.snakePath.getPathLength();
					const minDist =
						pathLen > 0
							? Math.min(
									otherDistFromMyEntry,
									pathLen - otherDistFromMyEntry,
								)
							: otherDistFromMyEntry;
					// If other is very close to my entry point, they should yield to let me in
					if (minDist < this.collisionRadius * 2) continue;
				}

				// Other has priority and we're colliding - I must yield
				return true;
			}
		}
		return false;
	}

	private isAllOffScreen(): boolean {
		const nodes = this.getAllNodes();
		for (const n of nodes) {
			if (!n?.active) continue;
			const p = n.getWorldPosition();
			const d = Math.max(Math.abs(p.x), Math.abs(p.z));
			if (d <= this.offScreenDistance) return false;
		}
		return true;
	}

	private startBounceBack() {
		this._isBouncing = true;
		this._bounceProgress = 0;
		this._bouncePose = [];
		this._bounceRotations = [];
		const nodes: Node[] = [];
		if (this.headNode) nodes.push(this.headNode);
		for (const seg of this.bodySegments) if (seg) nodes.push(seg);
		for (const n of nodes) {
			this._bouncePose.push(n.getWorldPosition().clone());
			this._bounceRotations.push(n.getWorldRotation().clone());
		}
	}

	private easeInOut(t: number): number {
		return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
	}

	// ── Public API ────────────────────────────────────────────────────────────
	setSnakeColor(color: string) {
		this.snakeColor = color;
		const c = this.getSnakeColor();
		this.applyColor(this.headNode, c);
		for (const seg of this.bodySegments) this.applyColor(seg, c);
	}

	isDone(): boolean {
		return this._done;
	}
	isMovingNow(): boolean {
		return this._isMoving || this._isBouncing;
	}
	canMoveNow(): boolean {
		return !this._done && !this._isMoving && !this._isBouncing;
	}
	getHeadNode(): Node | null {
		return this.headNode;
	}
	isSeekingHole(): boolean {
		return this._seekingHole;
	}

	hasFailed(): boolean {
		return false;
	}
	isEnteringHole(): boolean {
		return this._isEnteringHole;
	}
	isEntryFinished(): boolean {
		return this._done;
	}
	isLocked(): boolean {
		return false;
	}
	isFrontBlocked(): boolean {
		return false;
	}
	enterHole(holeWorldPos: Vec3, onComplete?: () => void) {
		if (this._isEnteringHole || this._done) return;
		if (!this._isMoving && !this._seekingHole) return;
		this._isEnteringHole = true;
		this._isMoving = false;
		this._seekingHole = false;
		if (this._isJoining) {
			this._isJoining = false;
			this._hasFinishedJoining = true;
		}
		this._enterHolePos.set(holeWorldPos);
		this._enterHoleProgress = 0;
		this._enterHoleCallback = onComplete || null;
		this._enterHolePose = [];
		const nodes = this.getAllNodes();
		for (const n of nodes) {
			this._enterHolePose.push(n.getWorldPosition().clone());
		}
	}

	private _checkForNearbyHole(headPos: Vec3) {
		if (this._seekingHole || this._isEnteringHole || this._done) return;
		const myColor = this.snakeColor.toLowerCase().trim();
		if (!myColor) return;

		const scene = this.node.scene;
		const allNodes = scene.children;
		const holeNodes: Node[] = [];
		const collectHoles = (parent: Node) => {
			for (const child of parent.children) {
				if (!child.activeInHierarchy) continue;
				if (child.getComponent("Hole")) holeNodes.push(child);
				collectHoles(child);
			}
		};
		for (const root of allNodes) collectHoles(root);

		let bestDist = this.holeSeekRadius;
		let bestHoleNode: Node = null;
		let bestHolePos: Vec3 = null;

		for (const holeNode of holeNodes) {
			const hole = holeNode.getComponent("Hole") as any;
			if (!hole) continue;
			const holeColor: string = hole.getCurrentColorName?.() ?? "";
			if (!holeColor) continue;

			const isMatch =
				myColor !== "" &&
				holeColor !== "" &&
				(myColor === holeColor ||
					holeColor.includes(myColor) ||
					myColor.includes(holeColor));
			if (!isMatch) continue;

			const centerPos: Vec3 =
				hole.getCenterWorldPosition?.() ?? holeNode.getWorldPosition();
			const diff = new Vec3();
			Vec3.subtract(diff, centerPos, headPos);
			diff.y = 0;
			const dist = diff.length();
			if (dist < bestDist) {
				bestDist = dist;
				bestHoleNode = holeNode;
				bestHolePos = centerPos.clone();
			}
		}

		if (bestHoleNode) {
			// IMPORTANT: Set the hole position FIRST
			this._seekHolePos.set(bestHolePos);
			// THEN calculate the distance using the correct position
			this._seekHoleStartDist = Vec3.distance(
				this.headNode.getWorldPosition(),
				this._seekHolePos,
			);
			this._seekHoleLastArcY = 0;
			this._seekingHole = true;
			this._seekHoleNode = bestHoleNode;
			this.moveSpeed *= 2;

			console.log(
				`[Hole Seek] Started seeking hole at distance: ${this._seekHoleStartDist}`,
			);
		}
	}

	private _triggerHoleEntry(holeNode: Node) {
		if (!holeNode?.isValid) return;
		const hole = holeNode.getComponent("Hole") as any;
		const holePos: Vec3 =
			hole?.getCenterWorldPosition?.() ?? holeNode.getWorldPosition();

		if (hole?.entryParticlePrefab) {
			const fx = instantiate(hole.entryParticlePrefab);
			const spawnPos = holePos.clone();
			spawnPos.y += hole.particleYOffset ?? 0.5;
			fx.setWorldPosition(spawnPos);
			fx.setParent(this.node.scene);
		}

		this._emitSceneEvent("sfx-snake-enter-hole");

		this.enterHole(holePos, () => {
			if (hole?.advanceColor) {
				hole.advanceColor();
			}
			if (
				hole &&
				(!hole.colorMappings || hole.colorMappings.length < 2)
			) {
				const remaining = this.node.scene
					.getComponentsInChildren(Snake)
					.filter(
						(s: Snake) =>
							s.node.activeInHierarchy &&
							!s.isDone() &&
							!s.isEnteringHole(),
					);
				if (remaining.length > 0 && hole.applyColorToRenderer) {
					hole._currentColorName = remaining[0].snakeColor
						.toLowerCase()
						.trim();
					hole.applyColorToRenderer(
						hole.holeRimRenderer,
						hole._currentColorName,
					);
					if (remaining.length > 1) {
						hole._nextColorName = remaining[1].snakeColor
							.toLowerCase()
							.trim();
						hole.applyColorToRenderer(
							hole.nextIndicatorRenderer,
							hole._nextColorName,
						);
					}
				}
			}
		});
	}
}
