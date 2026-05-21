import * as THREE from '../../libs/three.module.js';

export function snapshotPositions(model, atomIds) {
    const map = new Map();
    for (const atomId of atomIds) {
        const p = model.getAtomPosition(atomId);
        if (p) map.set(atomId, [...p]);
    }
    return map;
}

export function translatePositions(previous, delta) {
    const out = new Map();
    for (const [atomId, p] of previous.entries()) out.set(atomId, [p[0] + delta.x, p[1] + delta.y, p[2] + delta.z]);
    return out;
}

export function maxDisplacement(prev, next) {
    let max = 0;
    for (const [atomId, p] of prev.entries()) {
        const q = next.get(atomId);
        if (!q) continue;
        const dx = q[0]-p[0], dy = q[1]-p[1], dz = q[2]-p[2];
        max = Math.max(max, Math.sqrt(dx*dx+dy*dy+dz*dz));
    }
    return max;
}

export function intersectControllerPlane({controller, rig, plane, out = new THREE.Vector3()}) {
    return rig.controllerRay(controller).intersectPlane(plane, out) ? out.clone() : null;
}

export function worldToProteinLocal(proteinStageGroup, worldPoint) {
    return proteinStageGroup.worldToLocal(worldPoint.clone());
}
