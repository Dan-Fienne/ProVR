function countSceneObjects(scene) {
    const rows = [];
    let total = 0;
    let meshCount = 0;
    const byKind = {};

    if (!scene || typeof scene.traverse !== 'function') {
        return {total, meshCount, byKind, rows};
    }

    scene.traverse((obj) => {
        total += 1;
        if (obj.type === 'Mesh') meshCount += 1;

        const kind = obj.userData?.kind || obj.userData?.cartoonProxyKind || '';
        if (String(kind).startsWith('cartoon')) byKind[kind] = (byKind[kind] || 0) + 1;

        rows.push({
            name: obj.name || '',
            type: obj.type || obj.constructor?.name || '',
            visible: obj.visible,
            kind,
            cartoonProxyKind: obj.userData?.cartoonProxyKind || '',
            representationId: obj.userData?.representationId || '',
            chainId: obj.userData?.chainId || '',
            sse: obj.userData?.sse || '',
            residueCount: obj.userData?.residueCount ?? '',
            frameCount: obj.userData?.frameCount ?? '',
            endpointLoopMode: obj.userData?.endpointLoopMode || '',
            endpointLoopAnchorCount: obj.userData?.endpointLoopAnchorCount ?? '',
            endpointLoopLoopResidueAnchorCount: obj.userData?.endpointLoopLoopResidueAnchorCount ?? '',
            endpointLoopUsesAllLoopResidueAnchors: obj.userData?.endpointLoopUsesAllLoopResidueAnchors ?? '',
            endpointLoopTangentPolicy: obj.userData?.endpointLoopTangentPolicy || '',
            secondaryBoundaryTube: !!obj.userData?.secondaryBoundaryTube,
            secondaryBoundaryTubeMode: obj.userData?.secondaryBoundaryTubeMode || '',
            secondaryBoundaryLeftSSE: obj.userData?.secondaryBoundaryLeftSSE || '',
            secondaryBoundaryRightSSE: obj.userData?.secondaryBoundaryRightSSE || '',
            sheetGeometryMode: obj.userData?.sheetGeometryMode || '',
            hasTarget: !!obj.userData?.target,
        });
    });

    return {total, meshCount, byKind, rows};
}

function residueSSESummary(model) {
    const out = {};
    if (!model) return out;

    for (const residue of model.residues.values()) {
        const sse = model.secondary?.getResidueSSE?.(residue.id) || residue.sse || 'LOOP';
        out[sse] = (out[sse] || 0) + 1;
    }

    return out;
}

function loopSplineSummary(rep) {
    const rows = [];
    let endpointAware = 0;
    let allPoint = 0;
    let connectorStyle = 0;

    for (const mesh of rep?._meshes || []) {
        const data = mesh.userData || {};
        if (!data.endpointAwareLoop && !data.endpointLoopMode) continue;

        endpointAware += data.endpointAwareLoop ? 1 : 0;
        allPoint += data.endpointLoopUsesAllLoopResidueAnchors ? 1 : 0;
        connectorStyle += data.endpointLoopSeparateConnectorMeshes ? 1 : 0;

        rows.push({
            name: mesh.name || '',
            chainId: data.chainId || '',
            residueCount: data.residueCount || 0,
            frameCount: data.frameCount || 0,
            mode: data.endpointLoopMode || '',
            renderAnchorCount: data.endpointLoopRenderAnchorCount || 0,
            loopResidueAnchorCount: data.endpointLoopLoopResidueAnchorCount || 0,
            usesAllLoopResidueAnchors: !!data.endpointLoopUsesAllLoopResidueAnchors,
            tangentPolicy: data.endpointLoopTangentPolicy || '',
            startBoundarySSE: data.endpointLoopStartBoundarySSE || '',
            endBoundarySSE: data.endpointLoopEndBoundarySSE || '',
            hasLeftTangentContext: !!data.endpointLoopHasLeftTangentContext,
            hasRightTangentContext: !!data.endpointLoopHasRightTangentContext,
        });
    }

    return {endpointAware, allPoint, connectorStyle, rows};
}

function isSecondarySSE(sse) {
    return sse === 'HELIX' || sse === 'SHEET';
}

function secondaryBoundaryCandidateCount(rep) {
    let count = 0;
    for (const chain of rep?._trace?.chains || []) {
        const segments = chain.segments || [];
        for (let i = 0; i < segments.length - 1; i += 1) {
            if (isSecondarySSE(segments[i]?.sse) && isSecondarySSE(segments[i + 1]?.sse)) count += 1;
        }
    }
    return count;
}

function secondaryBoundaryTubeSummary(rep) {
    const rows = [];
    let count = 0;

    for (const mesh of rep?._meshes || []) {
        const data = mesh.userData || {};
        if (!data.secondaryBoundaryTube) continue;
        count += 1;
        rows.push({
            name: mesh.name || '',
            chainId: data.chainId || '',
            frameCount: data.frameCount || 0,
            mode: data.secondaryBoundaryTubeMode || '',
            leftSSE: data.secondaryBoundaryLeftSSE || '',
            rightSSE: data.secondaryBoundaryRightSSE || '',
            hasLeftContext: !!data.secondaryBoundaryHasLeftContext,
            hasRightContext: !!data.secondaryBoundaryHasRightContext,
            tangentPolicy: data.secondaryBoundaryTangentPolicy || '',
        });
    }

    return {count, candidatePairs: secondaryBoundaryCandidateCount(rep), rows};
}

function sheetGeometrySummary(rep) {
    const rows = [];
    let sheetMeshes = 0;
    let fixed = 0;

    for (const mesh of rep?._meshes || []) {
        const data = mesh.userData || {};
        if (data.sse !== 'SHEET') continue;
        sheetMeshes += 1;
        if (data.sheetGeometryMode === 'fixed-legacy-body-arrowhead') fixed += 1;
        rows.push({
            name: mesh.name || '',
            chainId: data.chainId || '',
            residueCount: data.residueCount || 0,
            frameCount: data.frameCount || 0,
            visualFrameCount: data.visualFrameCount || 0,
            sheetGeometryMode: data.sheetGeometryMode || '',
        });
    }

    return {sheetMeshes, fixed, rows};
}

export function validateCartoonRepresentation({
                                                  model,
                                                  viewport = null,
                                                  manager = null,
                                                  repId = null,
                                              } = {}) {
    const issues = [];

    if (!model) issues.push('model is missing');
    if (model && model.atoms.size === 0) issues.push('model has no atoms');
    if (model && model.residues.size === 0) issues.push('model has no residues');
    if (model && model.chains.size === 0) issues.push('model has no chains');

    const rep = repId && manager ? manager.get(repId) : null;
    if (!manager) issues.push('representation manager is missing');
    if (!rep) issues.push('cartoon representation is missing');
    if (rep && !rep.built) issues.push('cartoon representation was not built');

    const repSummary = rep?.summary?.() || rep?.root?.userData?.summary || null;
    const loopSpline = loopSplineSummary(rep);
    const secondaryBoundaryTubes = secondaryBoundaryTubeSummary(rep);
    const sheetGeometry = sheetGeometrySummary(rep);
    if (repSummary) {
        if ((repSummary.tracePoints || 0) === 0) issues.push('cartoon has no trace points');
        if ((repSummary.frames || 0) === 0) issues.push('cartoon has no frames');
        if ((repSummary.visualMeshes || 0) === 0) issues.push('cartoon has no visual meshes');
        if ((repSummary.pickTargets || 0) === 0) issues.push('cartoon has no pick targets');
        if ((repSummary.pickProxies || 0) === 0) issues.push('cartoon has no drag pick proxies');
        if (repSummary.options?.endpointBridgeMode === 'loop-owned-multi-anchor-spline-no-connector-mesh'
            && (repSummary.transitionMeshes || 0) > 0) {
            issues.push('loop-owned all-point spline should not create separate transition connector meshes');
        }
        if (loopSpline.endpointAware > 0 && loopSpline.allPoint !== loopSpline.endpointAware) {
            issues.push('each endpoint-aware loop mesh must use every loop residue point as a spline anchor');
        }
        if (loopSpline.connectorStyle > 0) {
            issues.push('endpoint-aware loop mesh reports separate connector-style generation');
        }
        if (secondaryBoundaryTubes.candidatePairs > 0 && secondaryBoundaryTubes.count !== secondaryBoundaryTubes.candidatePairs) {
            issues.push('each direct SSE-SSE boundary should create one Hermite boundary tube');
        }
        if (sheetGeometry.sheetMeshes > 0 && sheetGeometry.fixed !== sheetGeometry.sheetMeshes) {
            issues.push('each sheet mesh should use the fixed legacy body-arrowhead geometry mode');
        }
    }

    const scene = countSceneObjects(viewport?.scene);
    const cartoonMeshCount = Object.values(scene.byKind).reduce((sum, n) => sum + n, 0);
    if (viewport && cartoonMeshCount === 0) issues.push('scene has no cartoon meshes');

    const pickSummary = manager?.context?.pickRegistry?.summary?.() || null;
    if (pickSummary && pickSummary.total === 0) issues.push('PickRegistry has no targets');

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            proteinId: model?.id || '',
            modelRevision: model?.revision ?? null,
            atoms: model?.atoms?.size || 0,
            residues: model?.residues?.size || 0,
            chains: model?.chains?.size || 0,
            residueSSE: residueSSESummary(model),
            representationId: repId,
            cartoon: repSummary,
            loopSpline,
            secondaryBoundaryTubes,
            sheetGeometry,
            pickRegistry: pickSummary,
            scene: {
                totalObjects: scene.total,
                meshCount: scene.meshCount,
                cartoonMeshCount,
                byKind: scene.byKind,
            },
        },
        sceneRows: scene.rows,
    };
}

export function logCartoonValidation(input = {}, {logger = console} = {}) {
    const result = validateCartoonRepresentation(input);
    const status = result.ok ? 'OK' : 'ISSUES';

    logger.group?.(`[ProVR Cartoon Fixed Sheet Arrow Validation] ${status}`);
    logger.log('summary:', result.summary);
    if (result.issues.length) logger.warn('issues:', result.issues);
    if (result.summary?.loopSpline?.rows?.length) logger.table?.(result.summary.loopSpline.rows.slice(0, 120));
    if (result.summary?.secondaryBoundaryTubes?.rows?.length) logger.table?.(result.summary.secondaryBoundaryTubes.rows.slice(0, 120));
    if (result.summary?.sheetGeometry?.rows?.length) logger.table?.(result.summary.sheetGeometry.rows.slice(0, 120));
    if (result.sceneRows?.length) logger.table?.(result.sceneRows.slice(0, 120));
    logger.groupEnd?.();

    return result;
}
