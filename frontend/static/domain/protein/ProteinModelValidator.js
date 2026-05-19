export function validateProteinModel(model) {
    const issues = [];
    if (!model) return {ok: false, issues: ['model is missing'], summary: null};

    for (const [chainId, chain] of model.chains.entries()) {
        if (!chain.id) issues.push(`chain ${chainId} missing id`);
        for (const residueId of chain.residueIds || []) {
            if (!model.residues.has(residueId)) issues.push(`chain ${chainId} references missing residue ${residueId}`);
        }
    }

    for (const [residueId, residue] of model.residues.entries()) {
        if (!model.chains.has(residue.chainId)) issues.push(`residue ${residueId} references missing chain ${residue.chainId}`);
        const seenAtoms = new Set();
        for (const atomId of residue.atomIds || []) {
            if (seenAtoms.has(atomId)) issues.push(`residue ${residueId} has duplicate atom ${atomId}`);
            seenAtoms.add(atomId);
            if (!model.atoms.has(atomId)) issues.push(`residue ${residueId} references missing atom ${atomId}`);
        }
    }

    for (const [atomId, atom] of model.atoms.entries()) {
        if (!model.residues.has(atom.residueId)) issues.push(`atom ${atomId} references missing residue ${atom.residueId}`);
        if (!model.coordinateStore.isValidIndex(atom.positionIndex)) issues.push(`atom ${atomId} has invalid positionIndex ${atom.positionIndex}`);
        const p = model.getAtomPosition(atomId);
        if (!p || p.some((v) => !Number.isFinite(v))) issues.push(`atom ${atomId} has invalid coordinates`);
    }

    for (const [a, b] of model.bondGraph.edges()) {
        if (!model.atoms.has(a)) issues.push(`bond references missing atom ${a}`);
        if (!model.atoms.has(b)) issues.push(`bond references missing atom ${b}`);
    }

    return {
        ok: issues.length === 0,
        issues,
        summary: model.summary(),
    };
}

export function validateProteinSystem(system) {
    const issues = [];
    if (!system) return {ok: false, issues: ['system is missing'], summary: null};
    for (const model of system.listProteins()) {
        const result = validateProteinModel(model);
        for (const issue of result.issues) issues.push(`${model.id}: ${issue}`);
    }
    return {
        ok: issues.length === 0,
        issues,
        summary: system.summary(),
    };
}
