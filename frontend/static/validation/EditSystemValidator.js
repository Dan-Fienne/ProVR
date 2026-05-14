function clonePosition(p) {
    return p ? [Number(p[0]), Number(p[1]), Number(p[2])] : null;
}

function distance(a, b) {
    if (!a || !b) return null;
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function snapshotAtoms(model, atomIds) {
    const rows = [];
    for (const atomId of atomIds) {
        const atom = model.getAtom(atomId);
        if (!atom) continue;
        const residue = model.residues.get(atom.residueId);
        rows.push({
            atomId,
            atomName: atom.name,
            element: atom.element,
            residueId: atom.residueId,
            residueName: residue?.name || '',
            chainId: residue?.chainId || '',
            position: clonePosition(model.getAtomPosition(atomId)),
        });
    }
    return rows;
}

export function validateEditSystem({
                                       model,
                                       beforeAtoms = null,
                                       afterAtoms = null,
                                       beforePDB = null,
                                       afterPDB = null,
                                       commandManager = null,
                                       lineRep = null,
                                   } = {}) {
    const issues = [];

    if (!model) issues.push('model is missing');
    if (model && model.atoms.size === 0) issues.push('model has no atoms');

    let movedAtoms = [];
    if (beforeAtoms && afterAtoms) {
        const beforeById = new Map(beforeAtoms.map((row) => [row.atomId, row]));
        movedAtoms = afterAtoms.map((after) => {
            const before = beforeById.get(after.atomId);
            return {
                atomId: after.atomId,
                before: before?.position || null,
                after: after.position,
                delta: distance(before?.position, after.position),
            };
        }).filter((row) => row.delta != null && row.delta > 1e-6);
        if (movedAtoms.length === 0) issues.push('no atom coordinate differences detected');
    }

    const pdbChanged = beforePDB != null && afterPDB != null ? beforePDB !== afterPDB : null;
    if (pdbChanged === false) issues.push('exported PDB text did not change');

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            proteinId: model?.id || '',
            revision: model?.revision ?? null,
            atoms: model?.atoms?.size || 0,
            residues: model?.residues?.size || 0,
            chains: model?.chains?.size || 0,
            movedAtomCount: movedAtoms.length,
            pdbChanged,
            undoStackSize: commandManager?.undoStack?.length ?? null,
            redoStackSize: commandManager?.redoStack?.length ?? null,
            lineSummary: lineRep?.summary?.() || null,
        },
        movedAtoms,
    };
}

export function logEditValidation(input, {logger = console} = {}) {
    const result = validateEditSystem(input);
    const title = result.ok ? '[ProVR Edit Validation] OK' : '[ProVR Edit Validation] Issues found';
    logger.group?.(title);
    logger.log('summary:', result.summary);
    if (result.movedAtoms.length) console.table(result.movedAtoms.slice(0, 20));
    if (result.issues.length) logger.warn('issues:', result.issues);
    logger.groupEnd?.();
    return result;
}
