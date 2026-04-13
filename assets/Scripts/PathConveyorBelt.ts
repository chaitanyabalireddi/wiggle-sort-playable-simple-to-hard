import { _decorator, Component, MeshRenderer, Material, Vec4, CCFloat } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('PathConveyorBelt')
export class PathConveyorBelt extends Component {

    /** Speed at which the texture scrolls (units per second). Increase for faster belt. */
    @property({ type: CCFloat, tooltip: 'Scroll speed for the conveyor belt effect' })
    scrollSpeed: number = 0.3;

    private _material: Material | null = null;
    private _tilingOffset: Vec4 = new Vec4();

    start() {
        // Try to get the MeshRenderer on this node or its children
        const renderer = this.getComponent(MeshRenderer) ?? this.getComponentInChildren(MeshRenderer);
        if (!renderer) {
            console.warn('[PathConveyorBelt] No MeshRenderer found on this node or its children.');
            return;
        }

        // Use a shared-material clone so we don't affect all other objects using the same material
        this._material = renderer.getMaterial(0);
        if (!this._material) {
            console.warn('[PathConveyorBelt] No material found on MeshRenderer.');
            return;
        }

        // Read the current tilingOffset so we preserve x, y, w
        const current = this._material.getProperty('tilingOffset') as Vec4;
        if (current) {
            this._tilingOffset.set(current.x, current.y, current.z, current.w);
        }
    }

    update(dt: number) {
        if (!this._material) return;

        // Continuously decrease z → scrolls texture in one direction (conveyor belt)
        this._tilingOffset.z -= this.scrollSpeed * dt;

        this._material.setProperty('tilingOffset', this._tilingOffset);
    }
}
