function countSceneObjects(scene) {
    let total = 0;
    let lineSegments = 0;
    let groups = 0;
    const rows = [];

    if (!scene || typeof scene.traverse !== 'function') {
        return {total: 0, lineSegments: 0, groups: 0, rows};
    }

    scene.traverse((obj) => {
        total += 1;
        if (obj.type === 'LineSegments') lineSegments += 1;
        if (obj.type === 'Group') groups += 1;
        rows.push({
            name: obj.name || '',
            type: obj.type || obj.constructor?.name || '',
            visible: obj.visible,
            children: obj.children?.length || 0,
            hasSummary: !!obj.userData?.summary,
            segmentCount: obj.userData?.segmentCount ?? '',
        });
    });

    return {total, lineSegments, groups, rows};
}

function bondCount(model) {
    if (!model?.bondGraph?._adj) return 0;
    let endpoints = 0;
    for (const neighbors of model.bondGraph._adj.values()) endpoints += neighbors.size;
    return endpoints / 2;
}

export function validateRenderSystem({model, viewport, manager, lineRepId = null} = {}) {
    const issues = [];

    if (!model) issues.push('model is missing');
    if (!viewport) issues.push('viewport is missing');
    if (!manager) issues.push('representation manager is missing');

    const sceneInfo = countSceneObjects(viewport?.scene);
    const ids = manager ? manager.list({proteinId: model?.id}) : [];
    const reps = ids.map((id) => manager.get(id)).filter(Boolean);
    const lineReps = reps.filter((rep) => rep.spec.type === 'line');
    const lineRep = lineRepId ? manager.get(lineRepId) : lineReps[0] || null;
    const pickRegistry = manager?.context?.pickRegistry;
    const pickSummary = pickRegistry?.summary ? pickRegistry.summary() : null;
    const lineSummary = lineRep?.summary ? lineRep.summary() : null;

    if (model && model.atoms.size === 0) issues.push('model has no atoms');
    if (model && model.residues.size === 0) issues.push('model has no residues');
    if (model && model.chains.size === 0) issues.push('model has no chains');
    if (model && bondCount(model) === 0) issues.push('bondGraph has no bonds');
    if (!lineRep) issues.push('line representation was not created');
    if (lineRep && !lineRep.built) issues.push('line representation was not built');
    if (lineSummary && lineSummary.lineSegments === 0) issues.push('line representation has no visible line segments');
    if (pickSummary && pickSummary.total === 0) issues.push('pick registry has no targets');
    if (sceneInfo.lineSegments === 0) issues.push('scene has no THREE.LineSegments object');

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            proteinId: model?.id || '',
            atoms: model?.atoms?.size || 0,
            residues: model?.residues?.size || 0,
            chains: model?.chains?.size || 0,
            bonds: model ? bondCount(model) : 0,
            bondTopology: model?.info?.bondTopology?.summary || null,
            representationIds: ids,
            representationCount: ids.length,
            lineRepresentationCount: lineReps.length,
            lineSummary,
            scene: {
                totalObjects: sceneInfo.total,
                groups: sceneInfo.groups,
                lineSegments: sceneInfo.lineSegments,
            },
            pickRegistry: pickSummary,
        },
        sceneRows: sceneInfo.rows,
    };
}

export function logRenderValidation(input, {logger = console} = {}) {
    const result = validateRenderSystem(input);
    const title = result.ok ? '[ProVR Render Validation] OK' : '[ProVR Render Validation] Issues found';
    logger.group?.(title);
    logger.log('summary:', result.summary);
    if (result.issues.length) logger.warn('issues:', result.issues);
    logger.groupEnd?.();
    return result;
}
