export function snapshotAtomPositions(model, atomIds) {
    const out = new Map();
    for (const atomId of atomIds || []) {
        const p = model.getAtomPosition(atomId);
        if (p) out.set(atomId, [p[0], p[1], p[2]]);
    }
    return out;
}

export function clonePositionMap(map) {
    return new Map([...map.entries()].map(([atomId, p]) => [atomId, [...p]]));
}

export function translateSnapshot(snapshot, translation) {
    const t = translation || [0, 0, 0];
    const out = new Map();
    for (const [atomId, p] of snapshot.entries()) {
        out.set(atomId, [p[0] + t[0], p[1] + t[1], p[2] + t[2]]);
    }
    return out;
}

export function applyPositionMap(model, positions) {
    let changed = 0;
    for (const [atomId, p] of positions.entries()) {
        if (model.setAtomPosition(atomId, p[0], p[1], p[2])) changed += 1;
    }
    return changed;
}

export function positionMapToObject(map) {
    const out = {};
    for (const [atomId, p] of map.entries()) out[atomId] = [...p];
    return out;
}

export function maxDisplacement(a, b) {
    let max = 0;
    for (const [atomId, pa] of a.entries()) {
        const pb = b.get(atomId);
        if (!pb) continue;
        const dx = pa[0] - pb[0];
        const dy = pa[1] - pb[1];
        const dz = pa[2] - pb[2];
        max = Math.max(max, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    return max;
}
