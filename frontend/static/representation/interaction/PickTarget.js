export const PickTargetKind = Object.freeze({
    ATOM: 'atom',
    BOND: 'bond',
    RESIDUE: 'residue',
    RESIDUE_RANGE: 'residueRange',
    CHAIN: 'chain',
    COMPONENT: 'component',
    SURFACE_PATCH: 'surfacePatch',
});

function unique(values = []) {
    return [...new Set(values.filter((v) => v !== undefined && v !== null))];
}

export function makePickTarget({
                                   proteinId,
                                   kind,
                                   atomIds = [],
                                   residueIds = [],
                                   chainIds = [],
                                   componentId = null,
                                   metadata = {},
                               } = {}) {
    if (!proteinId) throw new Error('[PickTarget] proteinId is required');
    if (!kind) throw new Error('[PickTarget] kind is required');
    return Object.freeze({
        proteinId,
        kind,
        atomIds: unique(atomIds),
        residueIds: unique(residueIds),
        chainIds: unique(chainIds),
        componentId,
        metadata: {...metadata},
    });
}

export function targetFromAtom(model, atomId, metadata = {}) {
    const atom = model.getAtom(atomId);
    if (!atom) return null;
    const residue = model.residues.get(atom.residueId);
    return makePickTarget({
        proteinId: model.id,
        kind: PickTargetKind.ATOM,
        atomIds: [atomId],
        residueIds: [atom.residueId],
        chainIds: residue ? [residue.chainId] : [],
        metadata,
    });
}

export function targetFromBond(model, atomAId, atomBId, metadata = {}) {
    const atomA = model.getAtom(atomAId);
    const atomB = model.getAtom(atomBId);
    if (!atomA || !atomB) return null;
    const residueIds = unique([atomA.residueId, atomB.residueId]);
    const chainIds = unique(residueIds.map((rid) => model.residues.get(rid)?.chainId));
    return makePickTarget({
        proteinId: model.id,
        kind: PickTargetKind.BOND,
        atomIds: [atomAId, atomBId],
        residueIds,
        chainIds,
        metadata,
    });
}

export function targetFromResidue(model, residueId, metadata = {}) {
    const residue = model.residues.get(residueId);
    if (!residue) return null;
    return makePickTarget({
        proteinId: model.id,
        kind: PickTargetKind.RESIDUE,
        atomIds: residue.atomIds || [],
        residueIds: [residueId],
        chainIds: [residue.chainId],
        metadata,
    });
}

export function targetFromResidueRange(model, residueIds = [], metadata = {}) {
    const atoms = [];
    const chains = [];
    const keptResidues = [];
    for (const rid of residueIds) {
        const residue = model.residues.get(rid);
        if (!residue) continue;
        keptResidues.push(rid);
        chains.push(residue.chainId);
        atoms.push(...(residue.atomIds || []));
    }
    return makePickTarget({
        proteinId: model.id,
        kind: PickTargetKind.RESIDUE_RANGE,
        atomIds: atoms,
        residueIds: keptResidues,
        chainIds: chains,
        metadata,
    });
}

export function targetFromChain(model, chainId, metadata = {}) {
    const chain = model.chains.get(chainId);
    if (!chain) return null;
    const atoms = [];
    for (const rid of chain.residueIds || []) {
        const residue = model.residues.get(rid);
        if (residue) atoms.push(...(residue.atomIds || []));
    }
    return makePickTarget({
        proteinId: model.id,
        kind: PickTargetKind.CHAIN,
        atomIds: atoms,
        residueIds: chain.residueIds || [],
        chainIds: [chainId],
        metadata,
    });
}

export function collectAtomIdsForTarget(model, target) {
    if (!target) return [];
    if (target.atomIds?.length) return [...target.atomIds];

    const atomIds = [];
    for (const rid of target.residueIds || []) {
        const residue = model.residues.get(rid);
        if (residue) atomIds.push(...(residue.atomIds || []));
    }
    for (const cid of target.chainIds || []) {
        const chain = model.chains.get(cid);
        if (!chain) continue;
        for (const rid of chain.residueIds || []) {
            const residue = model.residues.get(rid);
            if (residue) atomIds.push(...(residue.atomIds || []));
        }
    }
    return unique(atomIds);
}
