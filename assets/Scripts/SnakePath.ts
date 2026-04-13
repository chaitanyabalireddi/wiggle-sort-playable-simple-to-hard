import { _decorator, Component, Vec3, Enum, CCBoolean, CCFloat } from 'cc';
const { ccclass, property } = _decorator;

export enum PathType {
    CLOSED_LOOP,
    PING_PONG,
    ONE_WAY
}

interface ArcEntry { dist: number; seg: number; t: number; }

@ccclass('SnakePath')
export class SnakePath extends Component {

    @property({ type: Enum(PathType) })
    pathType: PathType = PathType.CLOSED_LOOP;

    @property({ type: CCBoolean })
    showGizmos: boolean = true;

    @property({ type: CCFloat, tooltip: 'Spline samples per segment for arc-length table. Higher = smoother but slower start.' })
    samplesPerSegment: number = 30;

    private waypoints: Vec3[] = [];
    private pathLength: number = 0;
    private segmentLengths: number[] = [];
    private _arcTable: ArcEntry[] = [];

    start() {
        this.extractWaypoints();
        this.buildArcLengthTable();
    }

    private extractWaypoints() {
        this.waypoints = [];
        for (const child of this.node.children) {
            this.waypoints.push(child.getWorldPosition().clone());
        }
    }

    // ── Catmull-Rom spline ────────────────────────────────────────────────
    private catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
        const t2 = t * t;
        const t3 = t2 * t;
        return new Vec3(
            0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
            0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
            0.5 * ((2*p1.z) + (-p0.z+p2.z)*t + (2*p0.z-5*p1.z+4*p2.z-p3.z)*t2 + (-p0.z+3*p1.z-3*p2.z+p3.z)*t3)
        );
    }

    private getControlPoints(segIdx: number): [Vec3, Vec3, Vec3, Vec3] {
        const n = this.waypoints.length;
        if (this.pathType === PathType.CLOSED_LOOP) {
            return [
                this.waypoints[(segIdx - 1 + n) % n],
                this.waypoints[segIdx % n],
                this.waypoints[(segIdx + 1) % n],
                this.waypoints[(segIdx + 2) % n],
            ];
        }
        return [
            this.waypoints[Math.max(0, segIdx - 1)],
            this.waypoints[segIdx],
            this.waypoints[Math.min(n - 1, segIdx + 1)],
            this.waypoints[Math.min(n - 1, segIdx + 2)],
        ];
    }

    // ── Arc-length table (uniform speed along the spline) ────────────────
    private buildArcLengthTable() {
        this._arcTable = [];
        this.pathLength = 0;
        this.segmentLengths = [];

        const n = this.waypoints.length;
        if (n < 2) return;

        const numSegs = this.pathType === PathType.CLOSED_LOOP ? n : n - 1;

        for (let seg = 0; seg < numSegs; seg++) {
            const [p0, p1, p2, p3] = this.getControlPoints(seg);
            let prev = this.catmullRom(p0, p1, p2, p3, 0);
            let segLen = 0;

            for (let s = 1; s <= this.samplesPerSegment; s++) {
                const t = s / this.samplesPerSegment;
                const curr = this.catmullRom(p0, p1, p2, p3, t);
                segLen += Vec3.distance(prev, curr);
                this._arcTable.push({ dist: this.pathLength + segLen, seg, t });
                prev = curr;
            }

            this.segmentLengths.push(segLen);
            this.pathLength += segLen;
        }
    }

    // ── Arc-table lookup (binary search) ─────────────────────────────────
    private lookupArc(adjustedDist: number): Vec3 {
        const table = this._arcTable;
        if (table.length === 0) return this.waypoints[0].clone();

        if (adjustedDist <= table[0].dist) {
            const e = table[0];
            const [p0, p1, p2, p3] = this.getControlPoints(e.seg);
            const tFrac = table[0].dist > 0 ? e.t * (adjustedDist / table[0].dist) : 0;
            return this.catmullRom(p0, p1, p2, p3, tFrac);
        }
        if (adjustedDist >= table[table.length - 1].dist) {
            const e = table[table.length - 1];
            const [p0, p1, p2, p3] = this.getControlPoints(e.seg);
            return this.catmullRom(p0, p1, p2, p3, e.t);
        }

        let lo = 0, hi = table.length - 1;
        while (lo < hi - 1) {
            const mid = (lo + hi) >> 1;
            if (table[mid].dist < adjustedDist) lo = mid; else hi = mid;
        }

        const a = table[lo], b = table[hi];
        const span = b.dist - a.dist;
        const blend = span > 0.00001 ? (adjustedDist - a.dist) / span : 0;

        if (a.seg === b.seg) {
            const tInterp = a.t + (b.t - a.t) * blend;
            const [p0, p1, p2, p3] = this.getControlPoints(a.seg);
            return this.catmullRom(p0, p1, p2, p3, tInterp);
        }

        // Straddles segment boundary
        const [p0, p1, p2, p3] = this.getControlPoints(b.seg);
        return this.catmullRom(p0, p1, p2, p3, b.t * blend);
    }

    // ── Public API (unchanged interface) ─────────────────────────────────

    getPointAtDistance(distance: number): Vec3 {
        if (this.waypoints.length === 0) return Vec3.ZERO.clone();
        if (this.waypoints.length === 1) return this.waypoints[0].clone();

        let d = distance;
        if (this.pathType === PathType.CLOSED_LOOP) {
            d = ((d % this.pathLength) + this.pathLength) % this.pathLength;
        } else if (this.pathType === PathType.PING_PONG) {
            const dbl = this.pathLength * 2;
            d = ((d % dbl) + dbl) % dbl;
            if (d > this.pathLength) d = dbl - d;
        }
        d = Math.max(0, Math.min(d, this.pathLength));

        return this.lookupArc(d);
    }

    getTangentAtDistance(distance: number): Vec3 {
        const sampleDist = 0.05;
        const p1 = this.getPointAtDistance(distance - sampleDist);
        const p2 = this.getPointAtDistance(distance + sampleDist);
        const tangent = new Vec3();
        Vec3.subtract(tangent, p2, p1);
        if (tangent.lengthSqr() > 0.0001) Vec3.normalize(tangent, tangent);
        else tangent.set(0, 0, 1);
        return tangent;
    }

    getPathLength(): number { return this.pathLength; }

    getWaypointCount(): number { return this.waypoints.length; }

    addWaypoint(position: Vec3) {
        this.waypoints.push(position.clone());
        this.buildArcLengthTable();
    }

    getClosestDistance(worldPos: Vec3): number {
        if (this._arcTable.length === 0) return 0;
        let closestDist = 0;
        let minDistSq = Infinity;
        for (const entry of this._arcTable) {
            const [p0, p1, p2, p3] = this.getControlPoints(entry.seg);
            const pt = this.catmullRom(p0, p1, p2, p3, entry.t);
            const dv = new Vec3();
            Vec3.subtract(dv, worldPos, pt);
            const dsq = Vec3.dot(dv, dv);
            if (dsq < minDistSq) {
                minDistSq = dsq;
                closestDist = entry.dist;
            }
        }
        return closestDist;
    }

    clearWaypoints() {
        this.waypoints = [];
        this.pathLength = 0;
        this.segmentLengths = [];
        this._arcTable = [];
    }
}
