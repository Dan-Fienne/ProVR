function residueWindowIds(model, residueId, windowSize = 5) {
    const residue = model.residues.get(residueId);
    if (!residue) return [];
    const chain = model.chains.get(residue.chainId);
    if (!chain) return [residueId];

    const ids = chain.residueIds || [];
    const index = ids.indexOf(residueId);
    if (index < 0) return [residueId];

    const count = Math.max(1, Number(windowSize) || 1);
    const half = Math.floor(count / 2);
    let start = Math.max(0, index - half);
    let end = Math.min(ids.length, start + count);
    start = Math.max(0, end - count);
    return ids.slice(start, end);
}

function collectAtomIdsFromResidues(model, residueIds) {
    const atomIds = [];
    for (const residueId of residueIds) {
        const residue = model.residues.get(residueId);
        if (residue?.atomIds?.length) atomIds.push(...residue.atomIds);
    }
    return atomIds;
}

export class EditTargetResolver {
    constructor({getMode = () => 'atom', getResidueWindow = () => 5} = {}) {
        this.getMode = getMode;
        this.getResidueWindow = getResidueWindow;
    }

    resolve(hit, {mode = null, residueWindow = null} = {}) {
        if (!hit?.model || !hit.atomId) return null;
        const model = hit.model;
        const actualMode = mode || this.getMode();
        const actualWindow = residueWindow ?? this.getResidueWindow();

        if (actualMode === 'atom') {
            return {
                proteinId: model.id,
                kind: 'atom',
                atomIds: [hit.atomId],
                residueIds: [hit.residueId].filter(Boolean),
                chainIds: [hit.chainId].filter(Boolean),
                label: `${hit.atomName || hit.atomId} / ${hit.residueName || ''}${hit.residueLabel || ''}`,
                hit,
            };
        }

        if (actualMode === 'residue') {
            const residue = model.residues.get(hit.residueId);
            if (!residue) return null;
            return {
                proteinId: model.id,
                kind: 'residue',
                atomIds: [...residue.atomIds],
                residueIds: [residue.id],
                chainIds: [residue.chainId],
                label: `${residue.name}${residue.label} chain ${residue.chainId}`,
                hit,
            };
        }

        if (actualMode === 'range' || actualMode === 'residueRange') {
            const residueIds = residueWindowIds(model, hit.residueId, actualWindow);
            const atomIds = collectAtomIdsFromResidues(model, residueIds);
            const residue = model.residues.get(hit.residueId);
            return {
                proteinId: model.id,
                kind: 'residueRange',
                atomIds,
                residueIds,
                chainIds: residue?.chainId ? [residue.chainId] : [],
                label: `${residueIds.length} residues around ${residue?.name || ''}${residue?.label || ''}`,
                hit,
            };
        }
        return null;
    }
}
