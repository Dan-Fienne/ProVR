function countSceneObjects(scene) {
    const rows = [];
    let total = 0;
    let meshCount = 0;
    let groupCount = 0;

    if (!scene || typeof scene.traverse !== 'function') {
        return {total, meshCount, groupCount, rows};
    }

    scene.traverse((obj) => {
        total += 1;
        if (obj.type === 'Mesh') meshCount += 1;
        if (obj.type === 'Group') groupCount += 1;
        rows.push({
            name: obj.name || '',
            type: obj.type || obj.constructor?.name || '',
            visible: obj.visible,
            children: obj.children?.length || 0,
            kind: obj.userData?.kind || '',
            representationId: obj.userData?.representationId || '',
            atomId: obj.userData?.atomId ?? '',
            atomIds: obj.userData?.atomIds ? obj.userData.atomIds.join('-') : '',
            hasTarget: !!obj.userData?.target,
        });
    });

    return {total, meshCount, groupCount, rows};
}

function countBonds(model) {
    if (!model?.bondGraph?._adj) return 0;
    let endpoints = 0;
    for (const neighbors of model.bondGraph._adj.values()) endpoints += neighbors.size;
    return endpoints / 2;
}

function firstAtoms(model, n = 10) {
    if (!model) return [];
    return [...model.atoms.values()].slice(0, n).map((atom) => {
        const residue = model.residues.get(atom.residueId);
        return {
            atomId: atom.id,
            atomName: atom.name,
            element: atom.element,
            residueId: atom.residueId,
            residueName: residue?.name || '',
            residueLabel: residue?.label || '',
            chainId: residue?.chainId || '',
            position: model.getAtomPosition(atom.id),
        };
    });
}

export function validateBallStickRepresentation({
                                                    model,
                                                    viewport = null,
                                                    manager = null,
                                                    repId = null,
                                                    commandManager = null,
                                                    beforePDB = null,
                                                    afterPDB = null,
                                                } = {}) {
    const issues = [];

    if (!model) issues.push('model is missing');
    if (model && model.atoms.size === 0) issues.push('model has no atoms');
    if (model && model.residues.size === 0) issues.push('model has no residues');
    if (model && model.chains.size === 0) issues.push('model has no chains');
    if (model && countBonds(model) === 0) issues.push('bondGraph has no bonds');

    const rep = repId && manager ? manager.get(repId) : null;
    if (!manager) issues.push('representation manager is missing');
    if (!rep) issues.push('ballstick representation is missing');
    if (rep && !rep.built) issues.push('ballstick representation was not built');

    const repSummary = rep?.summary?.() || rep?.root?.userData?.summary || null;
    if (repSummary) {
        if ((repSummary.atoms || 0) === 0) issues.push('ballstick has no atom meshes');
        if ((repSummary.bonds || 0) === 0) issues.push('ballstick has no bond meshes');
        if ((repSummary.atomPickTargets || 0) === 0 && model?.atoms?.size > 0) {
            issues.push('ballstick has no atom pick targets');
        }
        if ((repSummary.bondPickTargets || 0) === 0 && countBonds(model) > 0) {
            issues.push('ballstick has no bond pick targets');
        }
    }

    const pickSummary = manager?.context?.pickRegistry?.summary?.() || null;
    if (pickSummary && pickSummary.total === 0) issues.push('PickRegistry has no targets');

    const scene = countSceneObjects(viewport?.scene);
    if (viewport && scene.meshCount === 0) issues.push('scene has no THREE.Mesh objects');

    const pdbChanged = beforePDB != null && afterPDB != null ? beforePDB !== afterPDB : null;

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            proteinId: model?.id || '',
            modelRevision: model?.revision ?? null,
            atoms: model?.atoms?.size || 0,
            residues: model?.residues?.size || 0,
            chains: model?.chains?.size || 0,
            bonds: model ? countBonds(model) : 0,
            bondTopology: model?.info?.bondTopology?.summary || null,
            representationId: repId,
            representation: repSummary,
            pickRegistry: pickSummary,
            scene: {
                totalObjects: scene.total,
                meshCount: scene.meshCount,
                groupCount: scene.groupCount,
            },
            undoStackSize: commandManager?.undoStack?.length ?? null,
            redoStackSize: commandManager?.redoStack?.length ?? null,
            pdbChanged,
            sampleAtoms: firstAtoms(model, 10),
        },
        sceneRows: scene.rows,
    };
}

export function logBallStickValidation(input = {}, {logger = console} = {}) {
    const result = validateBallStickRepresentation(input);
    const status = result.ok ? 'OK' : 'ISSUES';
    logger.group?.(`[ProVR BallStick Validation] ${status}`);
    logger.log('summary:', result.summary);
    if (result.issues.length) logger.warn('issues:', result.issues);
    if (result.sceneRows?.length) logger.table?.(result.sceneRows.slice(0, 50));
    logger.groupEnd?.();
    return result;
}
