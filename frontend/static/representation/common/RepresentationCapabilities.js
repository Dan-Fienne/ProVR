export const RepresentationFamily = Object.freeze({
    ATOMIC: 'atomic',
    TRACE: 'trace',
    SURFACE: 'surface',
    OVERLAY: 'overlay',
    DEBUG: 'debug',
});

export const DefaultCapabilities = Object.freeze({
    family: RepresentationFamily.DEBUG,
    pickAtom: false,
    pickBond: false,
    pickResidue: false,
    pickResidueRange: false,
    pickChain: false,
    pickComponent: false,
    pickSurfacePatch: false,
    supportsIncrementalAtomUpdate: false,
    supportsPreviewTransform: false,
    requiresBondGraph: false,
    requiresBackboneTrace: false,
    requiresSSE: false,
    expensiveRebuild: false,
});

export function mergeCapabilities(capabilities = {}) {
    return {...DefaultCapabilities, ...capabilities};
}