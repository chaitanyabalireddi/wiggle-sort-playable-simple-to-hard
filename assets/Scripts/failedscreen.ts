import { _decorator, Component, Node, director, Animation, UIOpacity, Tween } from 'cc';
import { ALAnalytics } from './metrics';
const { ccclass, property } = _decorator;

@ccclass('FailedScreen')
export class FailedScreen extends Component {

    @property(Node) failedCanvas: Node = null;
    @property(Node) retryButton: Node  = null;

  public showFailed() {
    if (!this.failedCanvas) {
        console.error('[FailedScreen] failedCanvas is NULL — not assigned in editor!');
        return;
    }

    // Force activate entire chain
    let node = this.failedCanvas;
    while (node) {
        if (!node.active) {
            console.warn('[FailedScreen] Activating inactive node:', node.name);
            node.active = true;
        }
        node = node.parent;
    }

    this.failedCanvas.active = true;

    Tween.stopAllByTarget(this.failedCanvas);
    for (const anim of this.failedCanvas.getComponentsInChildren(Animation)) anim.stop();

    const rootOp = this.failedCanvas.getComponent(UIOpacity);
    if (rootOp) rootOp.opacity = 255;

    for (const op of this.failedCanvas.getComponentsInChildren(UIOpacity)) op.opacity = 255;
}
    public hideFailed() {
        if (this.failedCanvas) this.failedCanvas.active = false;
    }

    // Wire this to your Retry button's click event in the editor
    onRetryClicked() {
        ALAnalytics.challengeRetry();
        if (this.failedCanvas) this.failedCanvas.active = false;
        director.loadScene(director.getScene()!.name);
    }

    // Wire this to your Quit button if you have one
    onQuitClicked() {
        director.loadScene('MainMenu');
    }
}