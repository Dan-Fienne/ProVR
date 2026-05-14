export function validateSurfaceRepresentation({model, manager, repId}) {
    const issues = [];
    const warnings = [];
    const rep = repId ? manager?.get?.(repId) : null;
    const summary = rep?.summary?.() || null;

    if (!model) issues.push('No ProteinModel loaded.');
    if (!rep) issues.push(`Surface representation not found: ${repId}`);
    if (!summary) issues.push('Surface summary is not available.');

    if (summary) {
        if (summary.surfaceMode !== 'surface-layer-v5-full-chain-range-rigid-transform') {
            issues.push(`Unexpected surfaceMode: ${summary.surfaceMode}`);
        }
        if (summary.layerSurfaceMeshes <= 0) issues.push('No surface layer meshes were generated.');
        if (summary.vertices <= 0 || summary.faces <= 0) issues.push('Surface geometry is empty.');
        if (summary.pickTargets !== summary.visualPickTargets) {
            issues.push(`Pick target mismatch: pickTargets=${summary.pickTargets}, visualPickTargets=${summary.visualPickTargets}`);
        }
        if (summary.ownedVertices !== summary.vertices) {
            issues.push(`Some surface vertices have no atom/residue ownership: ownedVertices=${summary.ownedVertices}, vertices=${summary.vertices}`);
        }

        const layers = summary.ranges || [];
        const contextLayers = layers.filter((layer) => layer.layerScope === 'model' || layer.layerRole === 'context');
        const localLayers = layers.filter((layer) => layer.layerScope !== 'model' && layer.layerRole !== 'context');
        if (!contextLayers.length) warnings.push('No full/complex context surface layer is present. Add a model/complex layer when validating full-surface + local-surface overlays.');
        if (!localLayers.length) warnings.push('No local chain/range surface layer is present. Add range or chain layers to compare against the full context surface.');

        for (const layer of layers) {
            if (layer.pickable && !layer.dragPolicy?.includes('no-geometry-rebuild')) {
                issues.push(`Layer ${layer.layerId || layer.rangeId} does not declare no-rebuild rigid inspection drag policy.`);
            }
            if (!layer.ownershipStats || layer.ownershipStats.selectedAtomCount <= 0) {
                issues.push(`Layer ${layer.layerId || layer.rangeId} has no selected atom ownership.`);
            }
            if ((layer.vertices || 0) > 0 && (layer.ownershipStats?.ownedVertexCount || 0) !== layer.vertices) {
                issues.push(`Layer ${layer.layerId || layer.rangeId} has unowned surface vertices.`);
            }
            if ((layer.residueColorRuleCount || 0) > 0) {
                const colorStats = layer.residueColorStats || {};
                if ((colorStats.matchedRuleCount || 0) === 0) {
                    warnings.push(`Layer ${layer.layerId || layer.rangeId}: residue color rules did not color any visible surface vertices.`);
                }
                for (const hit of colorStats.hits || []) {
                    if ((hit.matchedVertexCount || 0) === 0) {
                        warnings.push(`Rule ${hit.name || hit.id} matched no visible vertices. Check chain/residue numbers or whether those residues are buried.`);
                    }
                }
            }
        }


        if (summary.geometryRebuildDuringDrag !== false) {
            issues.push('Surface v5 should not rebuild geometry during rigid surface-layer inspection drag.');
        }
        if (summary.contacts && summary.contacts.transformAware !== true) {
            issues.push('Surface layer contact analysis must use current transformed mesh coordinates.');
        }
        const contacts = summary.contacts || {};
        if ((summary.layerSurfaceMeshes || 0) > 1 && (contacts.pairCount || 0) === 0) {
            warnings.push('Multiple layers exist but no layer-contact pairs were analyzed.');
        }
        if ((contacts.contactPairCount || 0) === 0 && (summary.layerSurfaceMeshes || 0) > 1) {
            warnings.push('No near surface-surface contact was detected under the current threshold; drag a focus layer or increase contactThreshold if you are visually checking broad proximity.');
        }
    }

    return {
        ok: issues.length === 0,
        issues,
        warnings,
        summary,
    };
}

export function logSurfaceValidation(args) {
    const report = validateSurfaceRepresentation(args);
    const log = report.ok ? console.info : console.warn;
    log('[ProVR Surface validation]', report);
    return report;
}
