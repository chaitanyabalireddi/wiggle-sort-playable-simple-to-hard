import { _decorator, Component, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('RotateY')
export class RotateY extends Component {

    @property({ tooltip: 'Rotation speed in degrees per second' })
    speed: number = 90;

    @property({ tooltip: 'Rotate clockwise' })
    clockwise: boolean = true;

    update(deltaTime: number) {
        const rotation = this.speed * deltaTime * (this.clockwise ? -1 : 1);
        const current = this.node.eulerAngles;
        this.node.setRotationFromEuler(0, current.y + rotation, 0);
    }
}
