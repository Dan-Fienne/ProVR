export const PickTargetKind = Object.freeze({
    ATOM: 'atom',
    BOND: 'bond',
    RESIDUE: 'residue',
    RESIDUE_RANGE: 'residueRange',
    CHAIN: 'chain',
    COMPONENT: 'component',
    SURFACE_PATCH: 'surfacePatch',
});

function uniq(values) {
    return [...new Set((values || []).filter((v) => v != null))];
}

export function makePickTarget({
                                   proteinId,
                                   representationId = null,
                                   kind,
                                   atomIds = [],
                                   residueIds = [],
                                   chainIds = [],
                                   componentId = null,
                                   metadata = {},
                               } = {}) {
    return {
        proteinId,
        representationId,
        kind,
        atomIds: uniq(atomIds),
        residueIds: uniq(residueIds),
        chainIds: uniq(chainIds),
        componentId,
        metadata: {...metadata},
    };
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
        atomIds: [...residue.atomIds],
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
            elements: [atomA.element, atomB.element],
            residueNames: uniq([residueA?.name, residueB?.name]),
            ...metadata,
        },
    });
}
