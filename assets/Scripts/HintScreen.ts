import { _decorator, Component, Node, Vec3, tween, Tween, input, Input, EventMouse, EventTouch } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('HintScreen')
export class HintScreen extends Component {

    @property({ type: Node, tooltip: 'Text node to pulse and hide on first click' })
    hintText: Node = null;

    @property({ type: Node, tooltip: 'Button node shown alongside the hint' })
    hintButton: Node = null;

    @property({ tooltip: 'Scale multiplier at the peak of the pulse (e.g. 1.15)' })
    pulseScale: number = 1.15;

    @property({ tooltip: 'Duration (seconds) for one half of the pulse cycle' })
    pulseDuration: number = 0.5;

    private _tween: Tween<Node> = null;

    start() {
        if (this.hintText) this._startPulse();

        input.on(Input.EventType.MOUSE_DOWN,  this.onFirstClick, this);
        input.on(Input.EventType.TOUCH_START, this.onFirstClick, this);
    }

    onDestroy() {
        this._stopPulse();
        input.off(Input.EventType.MOUSE_DOWN,  this.onFirstClick, this);
        input.off(Input.EventType.TOUCH_START, this.onFirstClick, this);
    }

    private _startPulse() {
        const big   = new Vec3(this.pulseScale, this.pulseScale, this.pulseScale);
        const small = new Vec3(1.0, 1.0, 1.0);

        this.hintText.setScale(small);

        this._tween = tween(this.hintText)
            .to(this.pulseDuration, { scale: big   }, { easing: 'sineInOut' })
            .to(this.pulseDuration, { scale: small }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }

    private _stopPulse() {
        if (this._tween) {
            this._tween.stop();
            this._tween = null;
        }
    }

    private onFirstClick() {
        input.off(Input.EventType.MOUSE_DOWN,  this.onFirstClick, this);
        input.off(Input.EventType.TOUCH_START, this.onFirstClick, this);

        this._stopPulse();

        if (this.hintText)   this.hintText.active   = false;
    }
}
