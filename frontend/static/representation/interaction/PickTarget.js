export const PickTargetKind = Object.freeze({
    ATOM: 'atom',
    BOND: 'bond',
    RESIDUE: 'residue',
    RESIDUE_RANGE: 'residueRange',
    CHAIN: 'chain',
    COMPONENT: 'component',
    SURFACE_PATCH: 'surfacePatch',
    SURFACE_LAYER: 'surfaceLayer',
    SANDBOX_FRAGMENT: 'sandboxFragment',
});

function uniq(values) {
    return [...new Set((values || []).filter((v) => v !== null && v !== undefined))];
}

export function makePickTarget({
                                   proteinId,
                                   representationId = null,
                                   kind,
                                   atomIds = [],
                                   residueIds = [],
                                   chainIds = [],
                                   componentId = null,
                                   surfaceLayerId = null,
                                   sandboxFragmentId = null,
                                   metadata = {},
                               } = {}) {
    if (!proteinId) throw new Error('[PickTarget] proteinId is required');
    if (!kind) throw new Error('[PickTarget] kind is required');

    return Object.freeze({
        proteinId,
        representationId,
        kind,
        atomIds: uniq(atomIds),
        residueIds: uniq(residueIds),
        chainIds: uniq(chainIds),
        componentId,
        surfaceLayerId,
        sandboxFragmentId,
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
        metadata: {
            atomName: atom.name,
            element: atom.element,
            residueName: residue?.name || '',
            residueLabel: residue?.label || '',
            ...metadata,
        },
    });
}

export function targetFromResidue(model, residueId, metadata = {}) {
    const residue = model.residues.get(residueId);
    if (!residue) return null;
    return makePickTarget({
        proteinId: model.id,
        kind: PickTargetKind.RESIDUE,
        atomIds: [...(residue.atomIds || [])],
        residueIds: [residueId],
        chainIds: [residue.chainId],
        metadata: {
            residueName: residue.name,
            residueLabel: residue.label,
            residueKind: residue.kind,
            ...metadata,
        },
    });
}

export function targetFromResidueRange(model, residueIds = [], metadata = {}) {
    const residues = residueIds.map((id) => model.residues.get(id)).filter(Boolean);
    const atomIds = [];
    const chainIds = [];
    for (const residue of residues) {
        atomIds.push(...(residue.atomIds || []));
        chainIds.push(residue.chainId);
    }
    return makePickTarget({
        proteinId: model.id,
        kind: PickTargetKind.RESIDUE_RANGE,
        atomIds,
        residueIds: residues.map((r) => r.id),
        chainIds,
        metadata,
    });
}

export function targetFromChain(model, chainId, metadata = {}) {
    const chain = model.chains.get(chainId);
    if (!chain) return null;
    const residueIds = [...(chain.residueIds || [])];
    const atomIds = [];
    for (const residueId of residueIds) {
        const residue = model.residues.get(residueId);
        if (residue?.atomIds?.length) atomIds.push(...residue.atomIds);
    }
    return makePickTarget({
        proteinId: model.id,
        kind: PickTargetKind.CHAIN,
        atomIds,
        residueIds,
        chainIds: [chainId],
        metadata: {chainId, ...metadata},
    });
}

export function targetFromBond(model, atomAId, atomBId, metadata = {}) {
    const atomA = model.getAtom(atomAId);
    const atomB = model.getAtom(atomBId);
    if (!atomA || !atomB) return null;

    const residueA = model.residues.get(atomA.residueId);
    const residueB = model.residues.get(atomB.residueId);

    return makePickTarget({
        proteinId: model.id,
        kind: PickTargetKind.BOND,
        atomIds: [atomAId, atomBId],
        residueIds: uniq([atomA.residueId, atomB.residueId]),
        chainIds: uniq([residueA?.chainId, residueB?.chainId]),
        metadata: {
            atomNames: [atomA.name, atomB.name],
            residueNames: [residueA?.name, residueB?.name].filter(Boolean),
            ...metadata,
        },
    });
}

export function targetFromSurfaceLayer(model, layer, metadata = {}) {
    return makePickTarget({
        proteinId: model.id,
        representationId: metadata.representationId || null,
        kind: PickTargetKind.SURFACE_LAYER,
        atomIds: layer.atomIds || [],
        residueIds: layer.residueIds || [],
        chainIds: layer.chainIds || [],
        surfaceLayerId: layer.id || layer.layerId || null,
        metadata: {
            layerName: layer.name || layer.label || '',
            ...metadata,
        },
    });
}
