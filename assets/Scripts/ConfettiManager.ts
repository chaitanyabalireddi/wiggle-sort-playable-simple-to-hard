import { _decorator, Component, Node, Vec3, Color, Graphics, UITransform, tween, randomRange, Layers } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ConfettiManager')
export class ConfettiManager extends Component {

    @property({ tooltip: 'How many confetti pieces to spawn' })
    pieceCount: number = 50;

    @property({ tooltip: 'Colors to use for confetti' })
    colors: Color[] = [
        new Color(255, 50, 50),   // Soft Red
        new Color(50, 255, 50),   // Soft Green
        new Color(50, 100, 255),  // Soft Blue
        new Color(255, 230, 50),  // Gold/Yellow
        new Color(255, 50, 255),  // Pink
        new Color(50, 255, 255)   // Cyan
    ];

    /**
     * Spawns a burst of confetti from the center of the screen
     */
    public spawnBurst() {
        for (let i = 0; i < this.pieceCount; i++) {
            this._spawnPiece();
        }
    }

    private _spawnPiece() {
        const piece = new Node('ConfettiPiece');
        piece.layer = Layers.Enum.UI_2D;
        piece.setParent(this.node);

        // Use Graphics component for guaranteed visibility without needing a sprite frame
        const g = piece.addComponent(Graphics);
        const w = randomRange(15, 30);
        const h = randomRange(10, 20);
        
        const color = this.colors[Math.floor(Math.random() * this.colors.length)];
        g.fillColor = color;
        g.rect(-w/2, -h/2, w, h);
        g.fill();

        // Random start position (with a tiny bit of random spread)
        piece.setPosition(randomRange(-20, 20), randomRange(-20, 20), 0);

        // Random trajectory
        const angle = (Math.random() * 120 + 30) * (Math.PI / 180); // Mostly upwards (30 to 150 degrees)
        const power = randomRange(400, 900);
        
        const peakPos = new Vec3(
            Math.cos(angle) * power * 0.5,
            Math.sin(angle) * power,
            0
        );

        const endPos = new Vec3(
            peakPos.x * 1.5 + randomRange(-100, 100),
            peakPos.y - randomRange(600, 1000), // Fall down
            0
        );

        const duration = randomRange(2.0, 3.5);
        const rotationEnd = randomRange(720, 1440);

        // Animate: Up then down
        tween(piece)
            .to(duration * 0.4, { position: peakPos, angle: rotationEnd * 0.4 }, { easing: 'circOut' })
            .to(duration * 0.6, { position: endPos, angle: rotationEnd, scale: new Vec3(0.2, 0.2, 0.2) }, { easing: 'sineIn' })
            .call(() => {
                piece.destroy();
            })
            .start();
    }
}
