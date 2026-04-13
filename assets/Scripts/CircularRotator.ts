import { _decorator, Component, Node, Vec3, Quat, math } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('CircularRotator')
export class CircularRotator extends Component {

    @property({ type: Node, tooltip: 'The center point to rotate around (leave empty to use this node\'s parent or world origin)' })
    centerNode: Node | null = null;

    @property({ tooltip: 'Radius of the circular path' })
    radius: number = 2.0;

    @property({ tooltip: 'Rotation speed in degrees per second' })
    rotationSpeed: number = 90.0;

    @property({ tooltip: 'Axis to rotate around (Y-axis by default for horizontal circle)' })
    rotationAxis: Vec3 = new Vec3(0, 1, 0);

    @property({ tooltip: 'Start angle in degrees (0 = right, 90 = front, 180 = left, 270 = back)' })
    startAngle: number = 0;

    @property({ tooltip: 'Rotate clockwise when viewed from above' })
    clockwise: boolean = true;

    @property({ tooltip: 'Should the mesh face the direction of movement' })
    faceForward: boolean = true;

    @property({ tooltip: 'Should the mesh face the center point' })
    faceCenter: boolean = false;

    private _currentAngle: number = 0;
    private _centerPosition: Vec3 = new Vec3();
    private _normalizedAxis: Vec3 = new Vec3();

    onLoad() {
        this._currentAngle = this.startAngle * (Math.PI / 180);
        Vec3.normalize(this._normalizedAxis, this.rotationAxis);
    }

    start() {
        this.updateCenterPosition();
        this.updatePosition();
    }

    update(deltaTime: number) {
        this.updateCenterPosition();

        // Update angle based on speed and direction
        const angleDelta = this.rotationSpeed * deltaTime * (Math.PI / 180);
        this._currentAngle += this.clockwise ? -angleDelta : angleDelta;

        this.updatePosition();
    }

    private updateCenterPosition() {
        if (this.centerNode && this.centerNode.isValid) {
            this._centerPosition = this.centerNode.getWorldPosition();
        } else {
            this._centerPosition.set(0, 0, 0);
        }
    }

    private updatePosition() {
        // Calculate position on circle
        const x = Math.cos(this._currentAngle) * this.radius;
        const z = Math.sin(this._currentAngle) * this.radius;

        // Apply rotation axis (default is Y-axis, so x/z plane)
        const newPosition = new Vec3(
            this._centerPosition.x + x,
            this._centerPosition.y,
            this._centerPosition.z + z
        );

        this.node.setWorldPosition(newPosition);

        // Handle rotation
        if (this.faceCenter) {
            // Look at center
            const direction = new Vec3();
            Vec3.subtract(direction, this._centerPosition, newPosition);
            direction.y = 0; // Keep level
            if (Vec3.lengthSqr(direction) > 0.0001) {
                Vec3.normalize(direction, direction);
                const angle = Math.atan2(direction.x, direction.z);
                const q = new Quat();
                Quat.fromEuler(q, 0, math.toDegree(angle), 0);
                this.node.setWorldRotation(q);
            }
        } else if (this.faceForward) {
            // Face direction of movement (tangent to circle)
            const tangentAngle = this._currentAngle + (this.clockwise ? -Math.PI / 2 : Math.PI / 2);
            const dx = Math.cos(tangentAngle);
            const dz = Math.sin(tangentAngle);
            const angle = Math.atan2(dx, dz);
            const q = new Quat();
            Quat.fromEuler(q, 0, math.toDegree(angle), 0);
            this.node.setWorldRotation(q);
        }
    }

    // Public method to set rotation phase (0-1 where 0 is start, 1 is full circle)
    public setPhase(phase: number) {
        this._currentAngle = (this.startAngle + phase * 360) * (Math.PI / 180);
        this.updatePosition();
    }

    // Public method to get current phase (0-1)
    public getPhase(): number {
        return (this._currentAngle * (180 / Math.PI) - this.startAngle) / 360;
    }
}
