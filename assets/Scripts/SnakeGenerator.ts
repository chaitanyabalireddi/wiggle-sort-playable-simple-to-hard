import { _decorator, Component, Node, Prefab, instantiate, Vec3 } from 'cc';
import { Snake } from './Snake';
const { ccclass, property } = _decorator;

@ccclass('SnakeGenerator')
export class SnakeGenerator extends Component {
    @property(Prefab)
    snakePrefab: Prefab = null;

    @property
    snakeCount: number = 8;

    /** Only used by GRID pattern: columns/rows. */
    @property
    gridSize: number = 3;

    /**
     * Base distance between snake spawn origins.
     * For GRID/CIRCLE/SPIRAL this prevents snakes from starting on top of
     * each other.  Good starting value: ~6–8 for segment spacing ~0.45.
     */
    @property
    spacing: number = 6;

    @property
    patternType: PatternType = PatternType.RANDOM;

    // ── lifecycle ──────────────────────────────────────────────────────────

    start() {
        // GameManager calls this too; guard against double-generation
    }

    // ── public ─────────────────────────────────────────────────────────────

    generateSnakes() {
        switch (this.patternType) {
            case PatternType.GRID:    this.generateGridPattern();    break;
            case PatternType.CIRCLE:  this.generateCirclePattern();  break;
            case PatternType.SPIRAL:  this.generateSpiralPattern();  break;
            case PatternType.RANDOM:  this.generateRandomPattern();  break;
        }
    }

    // ── patterns ───────────────────────────────────────────────────────────

    private generateGridPattern() {
        let spawned = 0;
        outer:
        for (let x = 0; x < this.gridSize; x++) {
            for (let z = 0; z < this.gridSize; z++) {
                if (spawned >= this.snakeCount) break outer;
                const posX = (x - (this.gridSize - 1) / 2) * this.spacing;
                const posZ = (z - (this.gridSize - 1) / 2) * this.spacing;
                this.spawnSnake(posX, 0, posZ);
                spawned++;
            }
        }
    }

    private generateCirclePattern() {
        const radius = this.spacing * (this.snakeCount / (2 * Math.PI));
        for (let i = 0; i < this.snakeCount; i++) {
            const angle = (i / this.snakeCount) * Math.PI * 2;
            this.spawnSnake(
                Math.cos(angle) * radius,
                0,
                Math.sin(angle) * radius
            );
        }
    }

    private generateSpiralPattern() {
        for (let i = 0; i < this.snakeCount; i++) {
            const t = i / Math.max(this.snakeCount - 1, 1);
            const angle = t * Math.PI * 4;                    // 2 full turns
            const radius = t * this.spacing * this.snakeCount * 0.25;
            this.spawnSnake(
                Math.cos(angle) * radius,
                0,
                Math.sin(angle) * radius
            );
        }
    }

    private generateRandomPattern() {
        const range = this.spacing * Math.sqrt(this.snakeCount) * 0.8;
        for (let i = 0; i < this.snakeCount; i++) {
            this.spawnSnake(
                (Math.random() - 0.5) * range * 2,
                0,
                (Math.random() - 0.5) * range * 2
            );
        }
    }

    // ── factory ────────────────────────────────────────────────────────────

    private spawnSnake(x: number, y: number, z: number) {
        if (!this.snakePrefab) {
            console.warn('SnakeGenerator: snakePrefab is not assigned!');
            return;
        }

        const snakeNode = instantiate(this.snakePrefab);
        snakeNode.setParent(this.node);
        snakeNode.setPosition(x, y, z);

        const snake = snakeNode.getComponent(Snake);
        if (!snake) {
            console.warn('SnakeGenerator: snakePrefab has no Snake component!');
            return;
        }

        // ── Randomise per-snake properties ──────────────────────────────

        // Segment count: short worms (5) to long snakes (16)
        snake.segmentCount = 5 + Math.floor(Math.random() * 12);

        // Spacing: roughly matches the visual size of a segment
        snake.segmentSpacing = 0.38 + Math.random() * 0.15;

        // Speed: slow puzzle-game feel
        // snake.moveSpeed = 0.8 + Math.random() * 1.4;

        // // Wiggle width (world units)
        // snake.wiggleAmount = 0.8 + Math.random() * 1.2;

        // // Wiggle frequency (cycles/s)
        // snake.wiggleSpeed = 0.8 + Math.random() * 1.5;

        // Colour from the reference image palette
        const COLORS = [
            'green', 'blue', 'purple', 'yellow', 'orange',
            'pink',  'brown', 'grey',  'red',    'cyan'
        ];
        snake.setSnakeColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
    }
}

// ── enum ───────────────────────────────────────────────────────────────────

export enum PatternType {
    GRID   = 0,
    CIRCLE = 1,
    SPIRAL = 2,
    RANDOM = 3,
}