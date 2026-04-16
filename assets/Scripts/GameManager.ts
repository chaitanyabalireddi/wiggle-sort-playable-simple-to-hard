import {
	_decorator,
	Component,
	Node,
	input,
	Input,
	EventMouse,
	EventTouch,
	AudioSource,
	AudioClip,
	Camera,
	Prefab,
	instantiate,
	Label,
	tween,
	Vec3,
	Color,
} from "cc";
import { Snake } from "./Snake";
import { ConfettiManager } from "./ConfettiManager";
import { FailedScreen } from "./failedscreen";
import { CTAScreen } from "./CTAScreen";
import { TutorialHand } from "./TutorialHand";
import { Hole } from "./Hole";
import { ALAnalytics } from "./metrics";
const { ccclass, property } = _decorator;

@ccclass("GameManager")
export class GameManager extends Component {
	@property({
		type: FailedScreen,
		tooltip: "FailedScreen component reference",
	})
	failedScreen: FailedScreen = null;

	@property({ type: CTAScreen, tooltip: "CTAScreen component reference" })
	ctaScreen: CTAScreen = null;

	@property({
		type: TutorialHand,
		tooltip: "TutorialHand component reference",
	})
	tutorialHand: TutorialHand = null;

	@property({ tooltip: "Seconds after first click before showing CTA" })
	gameTimerDuration: number = 40;

	@property({
		tooltip: "Seconds of player idle before re-showing tutorial hand",
	})
	tutorialIdleDuration: number = 5;

	@property({
		type: AudioSource,
		tooltip: "Single AudioSource used to play gameplay SFX.",
	})
	sfxAudioSource: AudioSource = null;

	@property({
		type: AudioClip,
		tooltip: "Sound played when a snake is tapped.",
	})
	tapSfx: AudioClip = null;

	@property({
		type: AudioClip,
		tooltip: "Sound played when a wrong snake is clicked.",
	})
	wrongTapSfx: AudioClip = null;

	@property({
		type: AudioClip,
		tooltip: "Sound played when a snake enters the hole.",
	})
	enterHoleSfx: AudioClip = null;

	@property({
		type: [Node],
		tooltip:
			"Level root nodes. Each should contain Snake children. Levels are played in order.",
	})
	levelNodes: Node[] = [];

	@property({
		type: [Number],
		tooltip:
			"Camera ortho height per level. Index must match levelNodes. Leave empty to keep default.",
	})
	levelOrthoHeights: number[] = [];

	@property([Color])
	levelColors: Color[] = [];

	@property({
		type: Prefab,
		tooltip: "Particle effect spawned when a level is cleared",
	})
	levelClearParticlePrefab: Prefab = null;

	@property({
		type: Label,
		tooltip: "UI Label to display current level number",
	})
	levelLabel: Label = null;

	@property({
		type: AudioClip,
		tooltip: "Sound played when a level is cleared",
	})
	levelClearSfx: AudioClip = null;

	@property({
		type: ConfettiManager,
		tooltip: "Reference to the code-based confetti manager",
	})
	confettiManager: ConfettiManager = null;

	private _timerActive: boolean = false;
	private _timeRemaining: number = 0;
	private _gameOver: boolean = false;
	private _gameStarted: boolean = false;
	private _initialSnakeCount: number = 0;
	private _idleTimer: number = 0;
	private _challengeStartedTracked: boolean = false;
	private _pass25Tracked: boolean = false;
	private _pass50Tracked: boolean = false;
	private _pass75Tracked: boolean = false;
	private _endcardTracked: boolean = false;

	private _currentLevel: number = 0;
	private _totalSnakesDone: number = 0;
	private _levelSnakesDone: number = 0;

	@property({
		tooltip:
			"On the last level, show CTA after this many snakes enter the hole (0 = wait for all)",
	})
	lastLevelCtaAfterSnakes: number = 2;

	onLoad() {
		ALAnalytics.loading();
	}

	start() {
		this._timeRemaining = this.gameTimerDuration;

		input.on(Input.EventType.MOUSE_DOWN, this.onFirstInput, this);
		input.on(Input.EventType.TOUCH_START, this.onFirstInput, this);
		input.on(Input.EventType.MOUSE_DOWN, this.onAnyInput, this);
		input.on(Input.EventType.TOUCH_START, this.onAnyInput, this);

		// Listen for snake-done events (snake left the screen)
		this.node.scene.on("snake-done", this._onSnakeDone, this);

		// Listen for SFX events
		this.node.scene.on("sfx-snake-tap", this._onSnakeTap, this);
		this.node.scene.on("sfx-wrong-tap", this._onWrongTap, this);
		this.node.scene.on(
			"sfx-snake-enter-hole",
			this._onSnakeEnterHole,
			this,
		);

		this.scheduleOnce(() => {
			// Count all snakes across all levels
			this._initialSnakeCount = 0;
			for (const lvl of this.levelNodes) {
				if (!lvl) continue;
				const snakes = lvl.getComponentsInChildren(Snake);
				this._initialSnakeCount += snakes.length;
			}
			if (this._initialSnakeCount === 0) {
				// Fallback: count all snakes in scene
				const all = this.node.scene.getComponentsInChildren(Snake);
				this._initialSnakeCount = all.length;
			}
			this._gameStarted = this._initialSnakeCount > 0;
			ALAnalytics.loaded();
			ALAnalytics.displayed();
			if (this._gameStarted && !this._challengeStartedTracked) {
				ALAnalytics.challengeStarted();
				this._challengeStartedTracked = true;
			}

			// Activate only the first level, hide others
			this._activateLevel(0);
			this._showTutorialTarget();
		}, 0);
	}

	onDestroy() {
		input.off(Input.EventType.MOUSE_DOWN, this.onFirstInput, this);
		input.off(Input.EventType.TOUCH_START, this.onFirstInput, this);
		input.off(Input.EventType.MOUSE_DOWN, this.onAnyInput, this);
		input.off(Input.EventType.TOUCH_START, this.onAnyInput, this);
		this.node.scene.off("snake-done", this._onSnakeDone, this);
		this.node.scene.off("sfx-snake-tap", this._onSnakeTap, this);
		this.node.scene.off("sfx-wrong-tap", this._onWrongTap, this);
		this.node.scene.off(
			"sfx-snake-enter-hole",
			this._onSnakeEnterHole,
			this,
		);
	}

	private _playSfx(clip: AudioClip | null) {
		if (!clip) return;
		const source = this.sfxAudioSource ?? this.getComponent(AudioSource);
		source?.playOneShot(clip, 1.0);
	}

	private _onSnakeTap() {
		this._playSfx(this.tapSfx);
	}

	private _onWrongTap() {
		this._playSfx(this.wrongTapSfx);
	}

	private _onSnakeEnterHole() {
		this._playSfx(this.enterHoleSfx);
	}

	private onFirstInput() {
		if (this._timerActive || this._gameOver) return;
		this._timerActive = true;
		if (this._gameStarted && !this._challengeStartedTracked) {
			ALAnalytics.challengeStarted();
			this._challengeStartedTracked = true;
		}
		input.off(Input.EventType.MOUSE_DOWN, this.onFirstInput, this);
		input.off(Input.EventType.TOUCH_START, this.onFirstInput, this);
	}

	private onAnyInput() {
		this._idleTimer = 0;
		if (this.tutorialHand) this.tutorialHand.hide();
	}

	// ── Level management ──────────────────────────────────────────────────────
	private _activateLevel(index: number) {
		this._currentLevel = index;
		for (let i = 0; i < this.levelNodes.length; i++) {
			if (this.levelNodes[i]) {
				this.levelNodes[i].active = i === index;
			}
		}

		// Apply per-level camera ortho height
		if (
			index < this.levelOrthoHeights.length &&
			this.levelOrthoHeights[index] > 0
		) {
			const cam = this._findMainCamera();
			if (cam) {
				cam.clearColor = this.levelColors[index];
				cam.orthoHeight = this.levelOrthoHeights[index];
			}
		}

		// Update level label if it exists
		if (this.levelLabel) {
			this.levelLabel.string = `LEVEL ${index + 1}`;

			// Subtle pop animation for the label
			const originalScale = this.levelLabel.node.scale.clone();
			tween(this.levelLabel.node)
				.to(0.1, {
					scale: new Vec3(
						originalScale.x * 1.2,
						originalScale.y * 1.2,
						originalScale.z * 1.2,
					),
				})
				.to(0.1, { scale: originalScale })
				.start();
		}
	}

	private _findMainCamera(): Camera | null {
		const n =
			this.node.scene?.getChildByName("Camera") ??
			this.node.scene?.getChildByName("Main Camera");
		return n ? n.getComponent(Camera) : null;
	}

	private _onSnakeDone() {
		if (this._gameOver) return;
		this._totalSnakesDone++;
		this._levelSnakesDone++;
		this._trackProgressMilestones();

		// On the last level, show CTA early after N snakes
		const isLastLevel = this._currentLevel >= this.levelNodes.length - 1;
		if (
			isLastLevel &&
			this.lastLevelCtaAfterSnakes > 0 &&
			this._levelSnakesDone >= this.lastLevelCtaAfterSnakes
		) {
			this._triggerWin();
			return;
		}

		// Defer check to next frame so destroy() has actually removed the node
		this.scheduleOnce(() => {
			this._checkLevelCleared();
		}, 0);
	}

	private _checkLevelCleared() {
		if (this._gameOver) return;
		const currentLevelNode = this.levelNodes[this._currentLevel];
		if (currentLevelNode) {
			const remaining = currentLevelNode
				.getComponentsInChildren(Snake)
				.filter((s: Snake) => !s.isDone());
			if (remaining.length === 0) {
				this._onLevelCleared();
			}
		} else {
			const allRemaining = this.node.scene
				.getComponentsInChildren(Snake)
				.filter((s: Snake) => !s.isDone());
			if (allRemaining.length === 0) {
				this._onLevelCleared();
			}
		}
	}

	private _onLevelCleared() {
		const nextLevel = this._currentLevel + 1;
		if (nextLevel < this.levelNodes.length) {
			// Advance to next level after a short delay

			// ── SPAWN CONFETTI ──
			if (this.levelClearParticlePrefab) {
				const fx = instantiate(this.levelClearParticlePrefab);
				fx.setParent(this.node.scene);
				// Center it on screen (assuming 2D/Canvas overlay) or standard 3D center
				fx.setWorldPosition(new Vec3(0, 0, 0));

				// Auto-destroy after 3 seconds
				this.scheduleOnce(() => {
					if (fx.isValid) fx.destroy();
				}, 3.0);
			}

			if (this.confettiManager) {
				this.confettiManager.spawnBurst();
			}

			if (this.levelClearSfx) {
				this._playSfx(this.levelClearSfx);
			}

			this.scheduleOnce(() => {
				this._levelSnakesDone = 0;
				this._activateLevel(nextLevel);
				this._showTutorialTarget();
			}, 1.2); // Slightly longer delay to let confetti shine
		} else {
			// All levels complete → win
			this._triggerWin();
		}
	}

	// ── Tutorial ──────────────────────────────────────────────────────────────
	private _showTutorialTarget() {
		if (!this.tutorialHand || this._gameOver) return;

		const snakes = this._getActiveSnakes();
		const alive = snakes.filter((s) => !s.isDone() && !s.isEnteringHole());
		if (alive.length === 0) return;

		// Separate into truly moveable (can move right now, not blocked) and all alive
		const moveable = alive.filter(
			(s) => s.canMoveNow() && s.getActiveBlockers().length === 0,
		);

		// DEBUG: log non-moveable snakes
		for (const s of alive) {
			if (moveable.indexOf(s) === -1) {
				const canMove = s.canMoveNow();
				const blockerCount = s.getActiveBlockers().length;
				console.log(
					`[Tutorial] NOT moveable: ${s.node.name}, color=${s.snakeColor}, canMove=${canMove}, blockers=${blockerCount}`,
				);
			}
		}

		// Find the hole in the current level
		const currentLevelNode = this.levelNodes[this._currentLevel];
		let hole: Hole | null = null;
		if (currentLevelNode) {
			hole = currentLevelNode.getComponentInChildren(Hole);
		}

		const holePos = hole ? hole.getCenterWorldPosition() : null;
		const currentColor = hole ? hole.getCurrentColorName() : "";
		const nextColor = hole ? hole._nextColorName || "" : "";

		// Helper: pick the closest unblocked snake from a list
		const pickClosest = (list: Snake[]): Snake | null => {
			if (list.length === 0) return null;
			if (!holePos) return list[0];
			let best = list[0];
			let bestDist = Infinity;
			for (const s of list) {
				const head = s.getHeadNode();
				if (!head) continue;
				const d = Vec3.distance(head.getWorldPosition(), holePos);
				if (d < bestDist) {
					bestDist = d;
					best = s;
				}
			}
			return best;
		};

		// TIER 1: Moveable+unblocked snake matching hole's CURRENT color
		console.log(
			`[Tutorial] TIER 1: currentColor='${currentColor}', moveable count=${moveable.length}`,
		);
		for (const s of moveable) {
			console.log(
				`[Tutorial]  moveable snake: name=${s.node.name}, color=${s.snakeColor}, blockers=${s.getActiveBlockers().length}`,
			);
		}
		if (currentColor && moveable.length > 0) {
			const matching = moveable.filter(
				(s) => s.snakeColor.toLowerCase().trim() === currentColor,
			);
			console.log(
				`[Tutorial]  matching '${currentColor}' count=${matching.length}`,
			);
			for (const s of matching) {
				console.log(`[Tutorial]    matching snake: ${s.node.name}`);
			}
			const best = pickClosest(matching);
			if (best) {
				console.log(`[Tutorial]  -> selected: ${best.node.name}`);
				this.tutorialHand.attachTo(best);
				return;
			}
		}

		// TIER 2: Current-color snake is blocked — trace the blocker chain
		// to find the first moveable, unblocked snake that needs to be tapped first
		if (currentColor) {
			const getFirstMoveableInChain = (snake: Snake): Snake | null => {
				if (!snake.canMoveNow()) return null;
				const blockers = snake.getActiveBlockers();
				if (blockers.length === 0) return snake; // Unblocked and moveable
				// Find a blocker that's itself moveable and unblocked
				for (const blocker of blockers) {
					const first = getFirstMoveableInChain(blocker);
					if (first) return first;
				}
				return null;
			};

			const blockedMatch = alive.filter(
				(s) =>
					s.snakeColor.toLowerCase().trim() === currentColor &&
					s.canMoveNow(),
			);
			for (const blocked of blockedMatch) {
				const first = getFirstMoveableInChain(blocked);
				if (first && first !== blocked) {
					this.tutorialHand.attachTo(first);
					return;
				}
			}
		}

		// TIER 3: Moveable+unblocked snake matching hole's NEXT color
		if (nextColor && moveable.length > 0) {
			const matching = moveable.filter(
				(s) => s.snakeColor.toLowerCase().trim() === nextColor,
			);
			const best = pickClosest(matching);
			if (best) {
				this.tutorialHand.attachTo(best);
				return;
			}
		}
	}

	private _getActiveSnakes(): Snake[] {
		const currentLevelNode = this.levelNodes[this._currentLevel];
		if (currentLevelNode) {
			return currentLevelNode.getComponentsInChildren(Snake);
		}
		return this.node.scene.getComponentsInChildren(Snake);
	}

	// ── End conditions ────────────────────────────────────────────────────────
	private _findFailedScreen(node: Node | null): FailedScreen | null {
		if (!node) return null;
		const direct = node.getComponent(FailedScreen);
		if (direct) return direct;
		for (const child of node.children) {
			const found = this._findFailedScreen(child);
			if (found) return found;
		}
		return null;
	}

	private _findCtaScreen(node: Node | null): CTAScreen | null {
		if (!node) return null;
		const direct = node.getComponent(CTAScreen);
		if (direct) return direct;
		for (const child of node.children) {
			const found = this._findCtaScreen(child);
			if (found) return found;
		}
		return null;
	}

	private _resolveUiRefs() {
		if (!this.failedScreen) {
			const foundFailed = this._findFailedScreen(this.node.scene);
			if (foundFailed) this.failedScreen = foundFailed;
		}
		if (!this.ctaScreen) {
			const foundCta = this._findCtaScreen(this.node.scene);
			if (foundCta) this.ctaScreen = foundCta;
		}
	}

	private _forceActivateNodeChain(target: Node | null) {
		let node = target;
		while (node) {
			if (!node.active) node.active = true;
			node = node.parent;
		}
	}

	private _triggerWin() {
		if (this._gameOver) return;
		this._gameOver = true;
		this._timerActive = false;
		ALAnalytics.challengeSolved();
		if (this.tutorialHand) this.tutorialHand.hide();
		this.showCTA();
	}

	private showCTA() {
		this._resolveUiRefs();
		if (this.ctaScreen) {
			this._forceActivateNodeChain(
				this.ctaScreen.ctaCanvas ?? this.ctaScreen.node,
			);
			this.ctaScreen.show();
		}
		if (!this._endcardTracked) {
			ALAnalytics.endcardShown();
			this._endcardTracked = true;
		}
	}

	private _trackProgressMilestones() {
		if (this._initialSnakeCount <= 0) return;
		const solvedRatio = this._totalSnakesDone / this._initialSnakeCount;

		if (!this._pass25Tracked && solvedRatio >= 0.25) {
			ALAnalytics.challengePass25();
			this._pass25Tracked = true;
		}
		if (!this._pass50Tracked && solvedRatio >= 0.5) {
			ALAnalytics.challengePass50();
			this._pass50Tracked = true;
		}
		if (!this._pass75Tracked && solvedRatio >= 0.75) {
			ALAnalytics.challengePass75();
			this._pass75Tracked = true;
		}
	}

	// ── Update ────────────────────────────────────────────────────────────────
	update(deltaTime: number) {
		if (this._gameOver) return;

		// ── Tutorial idle timer ───────────────────────────────────────────
		if (this.tutorialHand && !this.tutorialHand.isVisible()) {
			this._idleTimer += deltaTime;
			if (this._idleTimer >= this.tutorialIdleDuration) {
				this._idleTimer = 0;
				this._showTutorialTarget();
			}
		}

		// ── Countdown timer ───────────────────────────────────────────────
		if (this._timerActive) {
			this._timeRemaining -= deltaTime;
			if (this._timeRemaining <= 0) {
				this._timeRemaining = 0;
				this._timerActive = false;
				this._triggerWin();
			}
		}
	}
}
