import {collectResidueAtomIds, first} from '../targeting/VRTargetDescriptor.js';

export function solveAtomConstraint({model, target, previousPositions, delta, radius = 5.0} = {}) {
    const centerAtom = first(target?.atomIds);
    const center = centerAtom ? previousPositions.get(centerAtom) : null;
    if (!center) return previousPositions;

    const out = new Map();
    for (const [atomId, p] of previousPositions.entries()) {
        const d = distance(p, center);
        const w = Math.max(0, 1 - d / radius);
        const smooth = w * w * (3 - 2 * w);
        out.set(atomId, [p[0] + delta.x * smooth, p[1] + delta.y * smooth, p[2] + delta.z * smooth]);
    }
    return out;
}

export function localResidueWindowAtomIds(model, residueId, windowRadius = 3) {
    const residue = model.residues.get(residueId);
    if (!residue) return [];
    const chain = model.chains.get(residue.chainId);
    const ids = [...(chain?.residueIds || [])];
    const index = ids.indexOf(residueId);
    if (index < 0) return residue.atomIds || [];
    const windowIds = ids.slice(Math.max(0, index - windowRadius), Math.min(ids.length, index + windowRadius + 1));
    return collectResidueAtomIds(model, windowIds);
}

export function solveResidueLocal({model, centerResidueId, previousPositions, delta, windowRadius = 3} = {}) {
    const centerResidue = model.residues.get(centerResidueId);
    const chain = model.chains.get(centerResidue?.chainId);
    if (!centerResidue || !chain) return previousPositions;

    const residueIds = [...chain.residueIds];
    const centerIndex = residueIds.indexOf(centerResidueId);
    const atomWeight = new Map();

    for (let i = Math.max(0, centerIndex - windowRadius); i <= Math.min(residueIds.length - 1, centerIndex + windowRadius); i++) {
        const seqDist = Math.abs(i - centerIndex);
        const w = Math.max(0, 1 - seqDist / (windowRadius + 0.001));
        const smooth = w * w * (3 - 2 * w);
        const residue = model.residues.get(residueIds[i]);
        for (const atomId of residue?.atomIds || []) atomWeight.set(atomId, smooth);
    }

    const out = new Map();
    for (const [atomId, p] of previousPositions.entries()) {
        const w = atomWeight.get(atomId) ?? 0;
        out.set(atomId, [p[0] + delta.x * w, p[1] + delta.y * w, p[2] + delta.z * w]);
    }
    return out;
}

export function solveLoopRange({previousPositions, orderedAtomIds = [], delta} = {}) {
    const out = new Map();
    const n = Math.max(orderedAtomIds.length - 1, 1);
    orderedAtomIds.forEach((atomId, i) => {
        const p = previousPositions.get(atomId);
        if (!p) return;
        const t = i / n;
        const w = Math.sin(Math.PI * t); // anchors near 0, center max.
        out.set(atomId, [p[0] + delta.x * w, p[1] + delta.y * w, p[2] + delta.z * w]);
    });
    return out;
}

function distance(a,b){const dx=a[0]-b[0],dy=a[1]-b[1],dz=a[2]-b[2];return Math.sqrt(dx*dx+dy*dy+dz*dz);}
