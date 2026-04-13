import { _decorator, Component, Node, Animation, UIOpacity, Tween } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CTAScreen')
export class CTAScreen extends Component {

    @property(Node)
    ctaCanvas: Node = null;

    show() {
        if (!this.ctaCanvas) return;
        // Activate ancestors first
        let ancestor = this.ctaCanvas.parent;
        while (ancestor && ancestor.parent) {
            if (!ancestor.active) ancestor.active = true;
            ancestor = ancestor.parent;
        }
        // Activate the canvas node itself before querying children
        Tween.stopAllByTarget(this.ctaCanvas);
        this.ctaCanvas.active = true;
        // Now children are reachable
        for (const anim of this.ctaCanvas.getComponentsInChildren(Animation)) anim.stop();
        const rootOp = this.ctaCanvas.getComponent(UIOpacity);
        if (rootOp) rootOp.opacity = 255;
        for (const op of this.ctaCanvas.getComponentsInChildren(UIOpacity)) op.opacity = 255;
    }

    hide() {
        if (this.ctaCanvas) this.ctaCanvas.active = false;
    }
}
