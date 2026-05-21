export function first(arr) {
    return Array.isArray(arr) && arr.length ? arr[0] : null;
}

export function describeTarget(target, model = null) {
    if (!target) return {label: 'No target', subtitle: ''};
    const residueIds = target.residueIds || [];
    const chainIds = target.chainIds || [];
    const atomIds = target.atomIds || [];

    if (residueIds.length === 1) {
        const r = model?.residues?.get?.(residueIds[0]);
        const name = r?.name || r?.resName || 'RES';
        const chain = r?.chainId || first(chainIds) || '?';
        const seq = r?.seqNum ?? r?.resSeq ?? residueIds[0];
        return {label: `${name} ${chain}:${seq}`, subtitle: `${atomIds.length} atoms`};
    }

    if (residueIds.length > 1) {
        const a = model?.residues?.get?.(residueIds[0]);
        const b = model?.residues?.get?.(residueIds[residueIds.length - 1]);
        const chain = a?.chainId || first(chainIds) || '?';
        const sa = a?.seqNum ?? a?.resSeq ?? residueIds[0];
        const sb = b?.seqNum ?? b?.resSeq ?? residueIds[residueIds.length - 1];
        return {label: `Range ${chain}:${sa}-${sb}`, subtitle: `${residueIds.length} residues · ${atomIds.length} atoms`};
    }

    if (chainIds.length) return {label: `Chain ${chainIds.join(',')}`, subtitle: `${atomIds.length} atoms`};
    if (atomIds.length === 1) return {label: `Atom ${atomIds[0]}`, subtitle: target.kind || 'atom'};
    return {label: target.kind || 'Target', subtitle: `${atomIds.length} atoms`};
}

export function collectChainAtomIds(model, chainId) {
    const chain = model?.chains?.get?.(chainId);
    const out = [];
    for (const residueId of chain?.residueIds || []) {
        const residue = model.residues.get(residueId);
        if (residue?.atomIds) out.push(...residue.atomIds);
    }
    return out;
}

export function collectResidueAtomIds(model, residueIds = []) {
    const out = [];
    for (const residueId of residueIds) {
        const residue = model?.residues?.get?.(residueId);
        if (residue?.atomIds) out.push(...residue.atomIds);
    }
    return out;
}

export function buildRangeTarget(model, startTarget, endTarget) {
    const a = first(startTarget?.residueIds);
    const b = first(endTarget?.residueIds);
    if (!a || !b || !model) return null;
    const ra = model.residues.get(a);
    const rb = model.residues.get(b);
    if (!ra || !rb || ra.chainId !== rb.chainId) return null;
    const chain = model.chains.get(ra.chainId);
    const ids = [...(chain?.residueIds || [])];
    const ia = ids.indexOf(a), ib = ids.indexOf(b);
    if (ia < 0 || ib < 0) return null;
    const residueIds = ids.slice(Math.min(ia, ib), Math.max(ia, ib) + 1);
    const atomIds = collectResidueAtomIds(model, residueIds);
    const target = {proteinId: model.id, kind: 'residueRange', residueIds, atomIds, chainIds: [ra.chainId]};
    const d = describeTarget(target, model);
    target.label = d.label;
    return target;
}

export function resolveTargetAtomIds({target, model, tool, selectedTarget = null} = {}) {
    if (!model) return [];
    if (tool === 'transform_protein_coordinates') return [...model.atoms.keys()];
    if (tool === 'transform_selected_rigid' && selectedTarget?.atomIds?.length) return [...selectedTarget.atomIds];

    if (tool === 'transform_chain') {
        const chainId = first(target?.chainIds) || model.residues.get(first(target?.residueIds))?.chainId;
        return collectChainAtomIds(model, chainId);
    }

    if (target?.atomIds?.length) return [...target.atomIds];
    if (target?.residueIds?.length) return collectResidueAtomIds(model, target.residueIds);
    return [];
}
