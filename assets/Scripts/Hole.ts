import {
	_decorator,
	Component,
	Node,
	MeshRenderer,
	Material,
	Vec3,
	Enum,
	ParticleSystem,
	Prefab,
	instantiate,
	Color,
	tween,
} from "cc";
import { Snake } from "./Snake";

const { ccclass, property } = _decorator;

@ccclass("ColorMaterialMapping")
class ColorMaterialMapping {
	@property({
		tooltip: "The color name matching snake.snakeColor (e.g. green, blue)",
	})
	colorName: string = "green";
	@property({ type: Material })
	material: Material = null;
}

@ccclass("Hole")
export class Hole extends Component {
	@property({
		type: Node,
		tooltip:
			"Empty child node at the exact visual center of the hole (optional)",
	})
	holeCenter: Node = null;

	@property(MeshRenderer)
	holeRimRenderer: MeshRenderer = null;

	@property(MeshRenderer)
	nextIndicatorRenderer: MeshRenderer = null;

	@property({
		type: [ColorMaterialMapping],
		tooltip: "Materials to cycle through",
	})
	colorMappings: ColorMaterialMapping[] = [];

	// ── FIX 2: A dedicated "empty / black" material shown when no next snake exists ──
	@property({
		type: Material,
		tooltip:
			"Material shown on the next-indicator when no candidates remain (should be black/dark)",
	})
	emptyIndicatorMaterial: Material = null;

	@property({ tooltip: "How close the snake head must be to enter the hole" })
	detectionRadius: number = 1.5;

	@property({
		type: Prefab,
		tooltip:
			"Particle effect prefab to spawn when a snake enters this hole",
	})
	entryParticlePrefab: Prefab = null;

	@property({
		tooltip:
			"How long (seconds) to keep the particle effect alive before destroying it",
	})
	particlePlayTime: number = 2.0;

	@property({
		tooltip: "Y offset above the hole to spawn the particle effect",
	})
	particleYOffset: number = 0.5;

	@property
	randomizeNextColor: boolean = true;

	@property({
		tooltip: "How often (seconds) to re-evaluate the best snake color",
	})
	evaluationInterval: number = 0.2;

	@property({
		tooltip:
			"If true, this hole acts as a visual preview for the main hole and does not accept snakes.",
	})
	isNextPreview: boolean = false;

	@property({
		tooltip:
			"For multi-hole levels: unique identifier to pair a preview hole with its main hole. Main hole and its preview should have the same ID.",
	})
	holeSetId: number = 0;

	private _evalTimer: number = 0;
	private _currentIndex: number = 0;
	public _nextIndex: number = -1; // -1 = no next candidate (show empty/black)
	public _currentColorName: string = ""; // direct color tracking (works without colorMappings)
	public _nextColorName: string = "";

	start() {
		// Auto-detect renderers if not manually assigned
		if (!this.holeRimRenderer) {
			this.holeRimRenderer =
				this.node.getComponent(MeshRenderer) ??
				this.node.getComponentInChildren(MeshRenderer);
		}

		// Get colors used by other main holes for initialization
		const getOtherMainHoleColors = (): string[] => {
			const colors: string[] = [];
			const levelRoot = this.findLevelRoot();
			if (levelRoot) {
				const allHoles = levelRoot.getComponentsInChildren("Hole") as any[];
				for (const h of allHoles) {
					if (h.node !== this.node && !h.isNextPreview && h._currentColorName) {
						colors.push(h._currentColorName);
					}
				}
			}
			return colors;
		};

		if (this.colorMappings.length >= 2) {
			// Start with the first colorMapping as the initial color
			// Stagger by holeSetId so holes with lower IDs initialize first
			const initDelay = this.isNextPreview ? 0.05 : this.holeSetId * 0.1;
			this.scheduleOnce(() => {
				const otherColors = getOtherMainHoleColors();
				console.log(`[Hole ${this.node.name}] initDelay=${initDelay}, otherColors=[${otherColors.join(",")}], holeSetId=${this.holeSetId}`);
				// Find a color not used by other main holes
				let startIndex = 0;
				for (let i = 0; i < this.colorMappings.length; i++) {
					const col = this.colorMappings[i]?.colorName?.toLowerCase().trim() ?? "";
					if (otherColors.indexOf(col) === -1) {
						startIndex = i;
						break;
					}
				}
				this._currentIndex = startIndex;
				this._currentColorName =
					this.colorMappings[startIndex]?.colorName?.toLowerCase().trim() ??
					"";
				this._nextIndex = this.getBestCandidateIndex();
				console.log(`[Hole ${this.node.name}] initialized with color=${this._currentColorName}, next=${this._nextColorName}`);
				this.updateMaterials();
			}, initDelay);
		} else {
			// No colorMappings — auto-detect from first snake in scene
			// Stagger by holeSetId so holes with lower IDs initialize first
			const initDelay = this.isNextPreview ? 0.05 : this.holeSetId * 0.1;
			this.scheduleOnce(() => {
				const snakes = this.node.scene.getComponentsInChildren(Snake);
				const active = snakes.filter(
					(s: Snake) =>
						s.node.activeInHierarchy &&
						!s.isDone() &&
						!s.isEnteringHole(),
				);
				const otherColors = getOtherMainHoleColors();
				if (active.length > 0) {
					// Find first snake with color not used by other holes
					const availableSnake = active.find((s) => {
						const col = s.snakeColor.toLowerCase().trim();
						return otherColors.indexOf(col) === -1;
					}) || active[0];
					this._currentColorName = availableSnake.snakeColor
						.toLowerCase()
						.trim();
					this.applyColorToRenderer(
						this.holeRimRenderer,
						this._currentColorName,
					);
					if (active.length > 1) {
						// Find a different color for the next indicator
						const different = active.find(
							(s) =>
								s.snakeColor.toLowerCase().trim() !==
								this._currentColorName,
						);
						if (different) {
							this._nextColorName = different.snakeColor
								.toLowerCase()
								.trim();
							this.applyColorToRenderer(
								this.nextIndicatorRenderer,
								this._nextColorName,
							);
						} else {
							this._nextColorName = "";
							this.applyColorToRenderer(
								this.nextIndicatorRenderer,
								"",
							);
						}
					}
				}
			}, initDelay);
		}
	}

	private colorNameToColor(name: string): Color {
		switch (name.toLowerCase().trim()) {
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
				return new Color(40, 40, 40, 255);
		}
	}

	private applyColorToRenderer(
		renderer: MeshRenderer | null,
		colorName: string,
	) {
		if (!renderer) return;
		const color = this.colorNameToColor(colorName);
		if (renderer.material) {
			renderer.material.setProperty("mainColor", color);
		}
	}

	updateMaterials() {
		const currentColorName =
			this.colorMappings[this._currentIndex]?.colorName ?? "";

		// Apply material if available, AND always set mainColor directly
		if (this.holeRimRenderer) {
			if (this.colorMappings[this._currentIndex]?.material) {
				this.holeRimRenderer.setMaterial(
					this.colorMappings[this._currentIndex].material,
					0,
				);
			}
			this.applyColorToRenderer(this.holeRimRenderer, currentColorName);
		}

		if (this.nextIndicatorRenderer) {
			if (this._nextIndex === -1) {
				if (this.emptyIndicatorMaterial) {
					this.nextIndicatorRenderer.setMaterial(
						this.emptyIndicatorMaterial,
						0,
					);
				}
				this.applyColorToRenderer(this.nextIndicatorRenderer, "");
			} else {
				const nextColorName =
					this.colorMappings[this._nextIndex]?.colorName ?? "";
				if (this.colorMappings[this._nextIndex]?.material) {
					this.nextIndicatorRenderer.setMaterial(
						this.colorMappings[this._nextIndex].material,
						0,
					);
				}
				this.applyColorToRenderer(
					this.nextIndicatorRenderer,
					nextColorName,
				);
			}
		}
	}

	advanceColor() {
		// Collect active snakes first
		const snakes = this.node.scene.getComponentsInChildren(Snake);
		const active = this._getActiveSnakes(snakes);

		// Get colors used by other MAIN holes (not previews)
		const otherHoles: any[] = [];
		const levelRoot = this.findLevelRoot();
		if (levelRoot) {
			const allHoles = levelRoot.getComponentsInChildren("Hole") as any[];
			for (const h of allHoles)
				if (h.node !== this.node && !h.isNextPreview) otherHoles.push(h);
		}
		const otherHoleColors = otherHoles.map(h => h.getCurrentColorName()).filter(c => c !== "");

		if (this.colorMappings.length >= 2) {
			const currentCol = this.getCurrentColorName();

			// ALWAYS try to pick a DIFFERENT color first (no consecutive repeats)
			let easiestIdx = this.getEasiestSnakeIndex();

			if (easiestIdx !== -1) {
				// Check if this color is used by another main hole - if so, must pick different
				let proposedColor = this.colorMappings[easiestIdx]?.colorName?.toLowerCase().trim() ?? "";
				if (otherHoleColors.indexOf(proposedColor) !== -1) {
					// Find any color not used by other holes
					const availableColors = this.colorMappings.filter((m, idx) => {
						const col = m.colorName.toLowerCase().trim();
						return col !== currentCol && otherHoleColors.indexOf(col) === -1;
					});
					if (availableColors.length > 0) {
						// Pick first available color that has an active snake
						for (const mapping of availableColors) {
							const col = mapping.colorName.toLowerCase().trim();
							const hasSnake = active.some(s => s.snakeColor.toLowerCase().trim() === col);
							if (hasSnake) {
								easiestIdx = this.colorMappings.findIndex(m => m.colorName.toLowerCase().trim() === col);
								break;
							}
						}
					}
				}
				this._currentIndex = easiestIdx;
			} else if (this._nextIndex !== -1) {
				// Fallback to next index - but check it's not used by other hole
				let nextCol = this.colorMappings[this._nextIndex]?.colorName?.toLowerCase().trim() ?? "";
				if (otherHoleColors.indexOf(nextCol) !== -1) {
					// Find any available color
					for (let i = 0; i < this.colorMappings.length; i++) {
						if (i === this._currentIndex) continue;
						const col = this.colorMappings[i]?.colorName?.toLowerCase().trim();
						if (col && otherHoleColors.indexOf(col) === -1) {
							this._currentIndex = i;
							break;
						}
					}
				} else {
					this._currentIndex = this._nextIndex;
				}
			}
			// If neither found a different color, _currentIndex stays the same (only same-color snakes left)

			this._currentColorName =
				this.colorMappings[this._currentIndex]?.colorName
					?.toLowerCase()
					.trim() ?? "";

			// FINAL CHECK: Ensure we're not using a color from another main hole
			if (otherHoleColors.indexOf(this._currentColorName) !== -1 && active.length > 0) {
				// Force pick a different color
				const differentSnake = active.find((s) => {
					const col = s.snakeColor.toLowerCase().trim();
					return col !== this._currentColorName && otherHoleColors.indexOf(col) === -1;
				});
				if (differentSnake) {
					const snakeCol = differentSnake.snakeColor.toLowerCase().trim();
					const idx = this.colorMappings.findIndex(
						(m) => m.colorName.toLowerCase().trim() === snakeCol,
					);
					if (idx !== -1) {
						this._currentIndex = idx;
						this._currentColorName = snakeCol;
					}
				}
			}

			if (active.length > 0) {
				const hasMatch = active.some(
					(s) =>
						s.snakeColor.toLowerCase().trim() ===
						this._currentColorName,
				);
				if (!hasMatch) {
					// Current color has no snake — pick any active snake that's not used by other holes
					const anySnake = active.find((s) => {
						const col = s.snakeColor.toLowerCase().trim();
						return otherHoleColors.indexOf(col) === -1;
					}) || active[0];
					const snakeCol = anySnake.snakeColor.toLowerCase().trim();
					const idx = this.colorMappings.findIndex(
						(m) => m.colorName.toLowerCase().trim() === snakeCol,
					);
					if (idx !== -1) {
						this._currentIndex = idx;
						this._currentColorName = snakeCol;
					}
				}
			}

			// Re-evaluate best next candidate after advancing
			this._nextIndex = this.getBestCandidateIndex();
			this._nextColorName =
				this._nextIndex !== -1
					? (this.colorMappings[this._nextIndex]?.colorName
							?.toLowerCase()
							.trim() ?? "")
					: "";

			this.updateMaterials();
		} else {
			// No colorMappings — pick next color from remaining snakes
			const snakes = this.node.scene.getComponentsInChildren(Snake);
			const active = this._getActiveSnakes(snakes);

			if (active.length > 0) {
				const otherHoles: any[] = [];
				const levelRoot = this.findLevelRoot();
				if (levelRoot) {
					const allHoles = levelRoot.getComponentsInChildren(
						"Hole",
					) as any[];
					for (const h of allHoles)
						if (h.node !== this.node && !h.isNextPreview) otherHoles.push(h);
				}

				const otherColors = otherHoles.map((h) =>
					h.getCurrentColorName(),
				);

				// Find the EASIEST snake that's NOT used by other holes
				const easiestIdx = this.getEasiestSnakeIndex();
				let bestMatch: Snake | undefined;
				if (easiestIdx !== -1) {
					const easiestColor = this.colorMappings[
						easiestIdx
					]?.colorName
						?.toLowerCase()
						.trim();
					bestMatch = active.find(
						(s) =>
							s.snakeColor.toLowerCase().trim() === easiestColor,
					);
				}
				// If no easiest match found or it's used by other holes, try to find any unused
				if (!bestMatch) {
					bestMatch = active.find(
						(s) =>
							otherColors.indexOf(
								s.snakeColor.toLowerCase().trim(),
							) === -1,
					);
				}
				if (!bestMatch) bestMatch = active[0];

				const newColor = bestMatch.snakeColor.toLowerCase().trim();
				// Prevent consecutive same color
				if (newColor === this._currentColorName && active.length > 1) {
					const different = active.find(
						(s) =>
							s.snakeColor.toLowerCase().trim() !==
							this._currentColorName,
					);
					if (different) {
						this._currentColorName = different.snakeColor
							.toLowerCase()
							.trim();
					} else {
						this._currentColorName = newColor;
					}
				} else {
					this._currentColorName = newColor;
				}
				this.applyColorToRenderer(
					this.holeRimRenderer,
					this._currentColorName,
				);

				// Find next EASIEST color (different from current and other holes if possible)
				// Temporarily set current to exclude it from easiest calculation
				const oldCurrentIndex = this._currentIndex;
				this._currentIndex = -1; // Exclude current color
				const nextEasiestIdx = this.getBestCandidateIndex();
				this._currentIndex = oldCurrentIndex;

				let nextMatch: Snake | undefined;
				if (nextEasiestIdx !== -1) {
					const nextEasiestColor = this.colorMappings[
						nextEasiestIdx
					]?.colorName
						?.toLowerCase()
						.trim();
					nextMatch = active.find(
						(s) =>
							s.snakeColor.toLowerCase().trim() ===
							nextEasiestColor,
					);
				}
				if (!nextMatch)
					nextMatch = active.find(
						(s) =>
							s.snakeColor.toLowerCase().trim() !==
							this._currentColorName,
					);

				if (nextMatch) {
					this._nextColorName = nextMatch.snakeColor
						.toLowerCase()
						.trim();
					this.applyColorToRenderer(
						this.nextIndicatorRenderer,
						this._nextColorName,
					);
				} else {
					this._nextColorName = "";
					this.applyColorToRenderer(this.nextIndicatorRenderer, "");
				}
			} else {
				this._currentColorName = "";
				this._nextColorName = "";
				this.applyColorToRenderer(this.holeRimRenderer, "");
				this.applyColorToRenderer(this.nextIndicatorRenderer, "");
			}
		}
	}

	// Get the EASIEST snake to enter the hole (closest, not blocked, not locked)
	// Returns the color index of the easiest snake
	private getEasiestSnakeIndex(): number {
		const snakes = this.node.scene.getComponentsInChildren(Snake);
		const holePos = this.node.getWorldPosition();

		// Find all other holes in the current level to avoid color duplication
		const otherHoles: any[] = [];
		const levelRoot = this.findLevelRoot();
		if (levelRoot) {
			const allHoles = levelRoot.getComponentsInChildren("Hole") as any[];
			for (const h of allHoles) {
				if (h.node !== this.node && !h.isNextPreview)
					otherHoles.push(h);
			}
		}

		type Candidate = {
			colorIndex: number;
			color: string;
			easeScore: number;
			dist: number;
		};
		const candidates: Candidate[] = [];

		for (const snake of snakes) {
			if (!snake.node.activeInHierarchy) continue;
			if (snake.isEnteringHole()) continue;
			if (snake.isEntryFinished()) continue;
			if (snake.hasFailed()) continue;
			if (snake.isLocked()) continue;

			const headNode = snake.getHeadNode();
			if (!headNode) continue;

			const snakeCol = snake.snakeColor.toLowerCase().trim();
			const mappingIdx = this.colorMappings.findIndex(
				(m) => m.colorName.toLowerCase().trim() === snakeCol,
			);
			if (mappingIdx === -1) continue;

			// ── Don't repeat the same color consecutively ─────────────────────
			// Skip if same as current color (unless it's the only option left)
			if (mappingIdx === this._currentIndex) continue;
			// ───────────────────────────────────────────────────────────────────

			const dist = Vec3.distance(headNode.getWorldPosition(), holePos);

			// EASE SCORE: lower = easier (like golf score)
			// Start with distance (closer is easier)
			let easeScore = dist;

			// Big penalty if blocked (harder to reach)
			if (snake.isFrontBlocked()) easeScore += 100;

			// Bonus if already moving (easier - already in motion toward hole)
			if (snake.isMovingNow()) easeScore -= 20;

			// Bonus if seeking hole (very easy - already heading here)
			if (snake.isSeekingHole()) easeScore -= 30;

			// Large penalty if another hole is already handling this color
			for (const otherHole of otherHoles) {
				if (otherHole.getCurrentColorName() === snakeCol) {
					easeScore += 500;
				}
			}

			candidates.push({
				colorIndex: mappingIdx,
				color: snakeCol,
				easeScore,
				dist,
			});
		}

		if (candidates.length === 0) {
			// Fallback: no other colors available, must use same color
			// Re-run without the current color filter
			for (const snake of snakes) {
				if (!snake.node.activeInHierarchy) continue;
				if (snake.isEnteringHole()) continue;
				if (snake.isEntryFinished()) continue;
				if (snake.hasFailed()) continue;
				if (snake.isLocked()) continue;

				const headNode = snake.getHeadNode();
				if (!headNode) continue;

				const snakeCol = snake.snakeColor.toLowerCase().trim();
				const mappingIdx = this.colorMappings.findIndex(
					(m) => m.colorName.toLowerCase().trim() === snakeCol,
				);
				if (mappingIdx === -1) continue;

				const dist = Vec3.distance(
					headNode.getWorldPosition(),
					holePos,
				);
				let easeScore = dist;
				if (snake.isFrontBlocked()) easeScore += 100;
				if (snake.isMovingNow()) easeScore -= 20;
				if (snake.isSeekingHole()) easeScore -= 30;

				for (const otherHole of otherHoles) {
					if (otherHole.getCurrentColorName() === snakeCol) {
						easeScore += 500;
					}
				}

				candidates.push({
					colorIndex: mappingIdx,
					color: snakeCol,
					easeScore,
					dist,
				});
			}
		}

		if (candidates.length === 0) return -1;

		// Sort by ease score (lowest = easiest)
		candidates.sort((a, b) => a.easeScore - b.easeScore);

		// Return the easiest snake's color index
		return candidates[0].colorIndex;
	}

	// ── FIX 2: returns -1 when no valid candidate exists (single snake left or none) ──
	// This is for NEXT indicator - pick easiest that's DIFFERENT from current
	private getBestCandidateIndex(): number {
		const snakes = this.node.scene.getComponentsInChildren(Snake);
		const holePos = this.node.getWorldPosition();

		// Find all other holes in the current level to avoid color duplication
		const otherHoles: any[] = [];
		const levelRoot = this.findLevelRoot();
		if (levelRoot) {
			const allHoles = levelRoot.getComponentsInChildren("Hole") as any[];
			for (const h of allHoles) {
				if (h.node !== this.node && !h.isNextPreview)
					otherHoles.push(h);
			}
		}

		// Collect colors to avoid (current and next from other holes)
		const otherHoleCurrentColors = otherHoles.map(h => h.getCurrentColorName());
		const otherHoleNextColors = otherHoles.map(h => h._nextColorName).filter(c => c !== "");

		type Candidate = {
			colorIndex: number;
			color: string;
			easeScore: number;
			dist: number;
		};
		const candidates: Candidate[] = [];

		for (const snake of snakes) {
			if (!snake.node.activeInHierarchy) continue;
			if (snake.isEnteringHole()) continue;
			if (snake.isEntryFinished()) continue;
			if (snake.hasFailed()) continue;
			if (snake.isLocked()) continue;

			const headNode = snake.getHeadNode();
			if (!headNode) continue;

			const snakeCol = snake.snakeColor.toLowerCase().trim();
			const mappingIdx = this.colorMappings.findIndex(
				(m) => m.colorName.toLowerCase().trim() === snakeCol,
			);
			if (mappingIdx === -1) continue;

			// ── FIX 3: Ensure next color is NOT the same as current color ──────
			if (mappingIdx === this._currentIndex) continue;
			// ───────────────────────────────────────────────────────────────────

			// ── FIX: Next color must NOT be used by other main holes ────────────
			// Check both current AND next colors of other holes
			if (otherHoleCurrentColors.indexOf(snakeCol) !== -1) continue;
			if (otherHoleNextColors.indexOf(snakeCol) !== -1) continue;
			// ───────────────────────────────────────────────────────────────────

			const dist = Vec3.distance(headNode.getWorldPosition(), holePos);

			// EASE SCORE: lower = easier
			let easeScore = dist;
			if (snake.isFrontBlocked()) easeScore += 100;
			if (snake.isMovingNow()) easeScore -= 20;
			if (snake.isSeekingHole()) easeScore -= 30;

			candidates.push({
				colorIndex: mappingIdx,
				color: snakeCol,
				easeScore,
				dist,
			});
		}

		// ── FIX 2: no candidates at all → return -1 (show black) ──────────────
		if (candidates.length === 0) {
			// Fallback: find any DIFFERENT snake color that still exists
			const currentCol = this.getCurrentColorName();
			for (const snake of snakes) {
				if (!snake.node.activeInHierarchy) continue;
				if (snake.hasFailed()) continue;
				if (snake.isEnteringHole()) continue;
				if (snake.isEntryFinished()) continue;
				const snakeCol = snake.snakeColor.toLowerCase().trim();

				// Skip if it's the current color
				if (snakeCol === currentCol) continue;

				// Skip if used by other holes (current or next)
				if (otherHoleCurrentColors.indexOf(snakeCol) !== -1) continue;
				if (otherHoleNextColors.indexOf(snakeCol) !== -1) continue;

				const hasMapping = this.colorMappings.some(
					(m) => m.colorName.toLowerCase().trim() === snakeCol,
				);
				if (hasMapping)
					return this.colorMappings.findIndex(
						(m) => m.colorName.toLowerCase().trim() === snakeCol,
					);
			}
			return -1;
		}

		// Sort by ease score (lowest = easiest)
		candidates.sort((a, b) => a.easeScore - b.easeScore);

		return candidates[0].colorIndex;
	}

	/** @deprecated Use getBestCandidateIndex internally; kept for external callers. */
	private getBestCandidateColor(): string {
		const idx = this.getBestCandidateIndex();
		if (idx === -1) return "";
		return this.colorMappings[idx]?.colorName?.toLowerCase().trim() ?? "";
	}

	getCenterWorldPosition(): Vec3 {
		return this.holeCenter
			? this.holeCenter.getWorldPosition()
			: this.node.getWorldPosition();
	}

	getCurrentColorName(): string {
		if (this._currentColorName) return this._currentColorName;
		const mapping = this.colorMappings[this._currentIndex];
		return mapping ? mapping.colorName.toLowerCase().trim() : "";
	}

	private _getActiveSnakes(allSnakes: Snake[]): Snake[] {
		return allSnakes.filter(
			(s) =>
				s.node.activeInHierarchy &&
				!s.hasFailed() &&
				!s.isEnteringHole() &&
				!s.isEntryFinished(),
		);
	}

	private _forceCurrentColorToSnake(snake: Snake): void {
		const snakeCol = snake.snakeColor.toLowerCase().trim();
		if (!snakeCol) return;

		// If this would be the same color as current, try to find a different active snake first
		const currentCol = this.getCurrentColorName();
		if (snakeCol === currentCol) {
			const allSnakes = this.node.scene.getComponentsInChildren(Snake);
			const active = this._getActiveSnakes(allSnakes);
			const different = active.find(
				(s) => s.snakeColor.toLowerCase().trim() !== currentCol,
			);
			if (different) {
				this._forceCurrentColorToSnakeInternal(different);
				return;
			}
		}

		this._forceCurrentColorToSnakeInternal(snake);
	}

	private _forceCurrentColorToSnakeInternal(snake: Snake): void {
		const snakeCol = snake.snakeColor.toLowerCase().trim();
		if (!snakeCol) return;

		if (this.colorMappings.length >= 2) {
			const idx = this.colorMappings.findIndex(
				(m) => m.colorName.toLowerCase().trim() === snakeCol,
			);
			if (idx !== -1) {
				if (
					this._currentIndex === idx &&
					this._nextIndex === -1 &&
					this._currentColorName === snakeCol
				)
					return;
				this._currentIndex = idx;
				this._currentColorName = snakeCol;
				this._nextIndex = this.getBestCandidateIndex();
				this.updateMaterials();
			} else {
				// Color not in mappings — set directly
				this._currentColorName = snakeCol;
				this.applyColorToRenderer(this.holeRimRenderer, snakeCol);
			}
		} else {
			// No colorMappings — set directly
			if (this._currentColorName === snakeCol) return;
			this._currentColorName = snakeCol;
			this.applyColorToRenderer(this.holeRimRenderer, snakeCol);

			// Pick a different next color from remaining snakes
			const remaining = this.node.scene
				.getComponentsInChildren(Snake)
				.filter(
					(s) =>
						s.node.activeInHierarchy &&
						!s.isDone() &&
						!s.isEnteringHole() &&
						s !== snake,
				);

			const different = remaining.find(
				(s) => s.snakeColor.toLowerCase().trim() !== snakeCol,
			);

			if (different) {
				this._nextColorName = different.snakeColor.toLowerCase().trim();
				this.applyColorToRenderer(
					this.nextIndicatorRenderer,
					this._nextColorName,
				);
			} else {
				this._nextColorName = "";
				this.applyColorToRenderer(this.nextIndicatorRenderer, "");
			}
		}
	}

	private _emitSceneEvent(eventName: string, snake: Snake): void {
		let n: Node = this.node;
		while (n.parent) {
			n = n.parent;
			n.emit(eventName, { snake, hole: this });
		}
	}

	private _handlePreviewLogic(): void {
		const levelRoot = this.findLevelRoot();
		if (!levelRoot) return;

		const allHoles = levelRoot.getComponentsInChildren("Hole") as any[];
		// Find main hole with EXACT matching holeSetId
		const mainHole = allHoles.find(
			(h) =>
				h.node !== this.node &&
				!h.isNextPreview &&
				h.holeSetId === this.holeSetId,
		);

		if (mainHole) {
			const nextIdx = mainHole._nextIndex;
			const nextCol = mainHole._nextColorName;
			console.log(`[Hole ${this.node.name}] preview syncing to main hole ${mainHole.node.name}, nextColor=${nextCol}`);

			if (
				this._currentIndex !== nextIdx ||
				this._currentColorName !== nextCol
			) {
				this._currentIndex = nextIdx;
				this._currentColorName = nextCol;
				this._nextIndex = -1; // Previews don't have their own "next"
				this.updateMaterials();
			}
		} else {
			console.warn(`[Hole ${this.node.name}] preview could not find main hole with holeSetId=${this.holeSetId}`);
		}
	}

	private findLevelRoot(): Node | null {
		let n: Node = this.node;
		while (n) {
			// Check if this node has level-like characteristics or is near the root
			if (n.name.toLowerCase().indexOf("level") !== -1) return n;
			if (n.parent && n.parent.name.toLowerCase().indexOf("scene") !== -1)
				return n;
			if (!n.parent) return n;
			n = n.parent;
		}
		return this.node.scene as any;
	}

	update(dt: number) {
		if (this.isNextPreview) {
			this._handlePreviewLogic();
			return;
		}

		const snakes = this.node.scene.getComponentsInChildren(Snake);
		const activeSnakes = this._getActiveSnakes(snakes);

		// ── Color is LOCKED until a snake enters — only update next indicator ──

		// Clear next indicator when only 0-1 snakes remain
		if (activeSnakes.length <= 1) {
			if (this._nextColorName !== "" || this._nextIndex !== -1) {
				this._nextColorName = "";
				this._nextIndex = -1;
				this.applyColorToRenderer(this.nextIndicatorRenderer, "");
				this.updateMaterials();
			}
		}

		// Periodic next-indicator re-evaluation (does NOT change current color)
		if (activeSnakes.length > 1) {
			this._evalTimer += dt;
			if (this._evalTimer >= this.evaluationInterval) {
				this._evalTimer = 0;
				const bestIdx = this.getBestCandidateIndex();
				if (bestIdx !== this._nextIndex) {
					this._nextIndex = bestIdx;
					this._nextColorName =
						this._nextIndex !== -1
							? (this.colorMappings[this._nextIndex]?.colorName
									?.toLowerCase()
									.trim() ?? "")
							: "";
					this.updateMaterials();
				}
			}
		}

		// ── Hole detection logic ─────────────────────────────────────────────
		const holePos = this.node.getWorldPosition();
		let targetColor = this.getCurrentColorName();

		// If no color is set yet, auto-assign from the first active snake
		if (targetColor === "" && activeSnakes.length > 0) {
			this._forceCurrentColorToSnake(activeSnakes[0]);
			targetColor = this.getCurrentColorName();
		}

		if (!targetColor) return;

		for (const snake of snakes) {
			if (snake.isEnteringHole()) continue;
			if (snake.isSeekingHole()) continue;
			if (snake.isDone()) continue;
			if (!snake.isMovingNow()) continue;

			const headNode = snake.getHeadNode();
			if (!headNode) continue;

			const diff = new Vec3();
			Vec3.subtract(diff, holePos, headNode.getWorldPosition());
			diff.y = 0;
			const dist = diff.length();
			if (dist >= this.detectionRadius) continue;

			const snakeCol = snake.snakeColor.toLowerCase().trim();
			if (!snakeCol) continue;

			const isMatch =
				snakeCol === targetColor ||
				targetColor.indexOf(snakeCol) !== -1 ||
				snakeCol.indexOf(targetColor) !== -1;

			if (!isMatch) continue;
			this._emitSceneEvent("sfx-snake-enter-hole", snake);

			if (this.entryParticlePrefab) {
				const fx = instantiate(this.entryParticlePrefab);
				const spawnPos = holePos.clone();
				spawnPos.y += this.particleYOffset;
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
				this.scheduleOnce(() => {
					if (!fx?.isValid) return;
					const ps2 =
						fx.getComponent(ParticleSystem) ??
						fx.getComponentInChildren(ParticleSystem);
					ps2?.stop();
					this.scheduleOnce(() => {
						if (fx?.isValid) {
							tween(fx)
								.to(
									0.1,
									{ scale: Vec3.ZERO },
									{ easing: "sineIn" },
								)
								.call(() => {
									fx.destroy();
								})
								.start();
						}
					}, 1.0);
				}, this.particlePlayTime);
			}

			snake.enterHole(holePos, () => {
				this.advanceColor();
			});
		}
	}
}
