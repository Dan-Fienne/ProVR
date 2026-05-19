export const RepresentationFamily = Object.freeze({
    ATOMIC: 'atomic',
    TRACE: 'trace',
    SURFACE: 'surface',
    DEBUG: 'debug',
    CUSTOM: 'custom',
});

export const DefaultRepresentationCapabilities = Object.freeze({
    pickAtom: false,
    pickBond: false,
    pickResidue: false,
    pickResidueRange: false,
    pickChain: false,
    pickComponent: false,

    supportsIncrementalAtomUpdate: false,
    supportsPreviewTransform: false,
    supportsRigidLayerTransform: false,
    supportsSurfaceLayerRigidInspectionDrag: false,

    requiresBondGraph: false,
    requiresBondTopology: false,
    requiresBackboneTrace: false,
    requiresSSE: false,

    rendersThreeObjects: true,
    visualMeshPickableByDefault: false,
});

export function normalizeCapabilities(capabilities = {}) {
    return Object.freeze({
        ...DefaultRepresentationCapabilities,
        ...capabilities,
    });
}

export function assertCapabilities(record = {}) {
    if (!record.factory || typeof record.factory !== 'function') {
        throw new Error('[RepresentationCapabilities] representation record requires factory({spec, context})');
    }
    return true;
}
