import { _decorator, Component, Node, Vec3, input, Input, EventMouse, EventTouch } from 'cc';
import { Snake } from './Snake';
const { ccclass, property } = _decorator;

@ccclass('TutorialHand')
export class TutorialHand extends Component {

    @property({ type: Node, tooltip: 'Hand idle image node (child)' })
    handIdle: Node = null;

    @property({ type: Node, tooltip: 'Hand clicked image node (child)' })
    handClicked: Node = null;

    @property({ tooltip: 'Seconds each state is shown before toggling' })
    toggleInterval: number = 0.5;

    @property({ tooltip: 'World-space Y offset above the snake head' })
    offsetY: number = 1.2;

    private _targetSnake: Snake | null = null;
    private _toggleTimer: number = 0;
    private _showingIdle: boolean = true;

    start() {
        this.node.active = false;
        this._applyToggle();
    }

    onDestroy() {}

    // ── Public API ────────────────────────────────────────────────────────────

    attachTo(snake: Snake) {
        this._targetSnake = snake;
        this._showingIdle = true;
        this._toggleTimer = 0;
        this._applyToggle();
        this.node.active = true;
    }

    hide() {
        this.node.active = false;
        this._targetSnake = null;
    }

    isVisible(): boolean {
        return this.node.active;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private _applyToggle() {
        if (this.handIdle)    this.handIdle.active    =  this._showingIdle;
        if (this.handClicked) this.handClicked.active = !this._showingIdle;
    }

    update(deltaTime: number) {
        if (!this.node.active) return;

        // Follow the snake head in world space
        if (this._targetSnake && this._targetSnake.isValid) {
            const head = this._targetSnake.getHeadNode();
            if (head) {
                const wp = head.getWorldPosition();
                this.node.setWorldPosition(wp.x, wp.y + this.offsetY, wp.z);
            }
        }

        // Alternate idle ↔ clicked
        this._toggleTimer += deltaTime;
        if (this._toggleTimer >= this.toggleInterval) {
            this._toggleTimer = 0;
            this._showingIdle = !this._showingIdle;
            this._applyToggle();
        }
    }
}
