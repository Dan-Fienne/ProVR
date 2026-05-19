export const VRWorkflowPhase = Object.freeze({
    BOOT: 'boot',
    START_SPACE: 'startSpace',
    LOADING_PROTEIN: 'loadingProtein',
    WORKBENCH: 'workbench',
    SURFACE: 'surface',
    SELECT: 'select',
    EDIT: 'edit',
    DESIGN: 'design',
});

export const SelectionScope = Object.freeze({
    ATOM: 'atom',
    RESIDUE: 'residue',
    RESIDUE_RANGE: 'residueRange',
    CHAIN: 'chain',
    SURFACE_PATCH: 'surfacePatch',
});

export const SurfaceOperation = Object.freeze({
    NONE: 'none',
    FULL: 'full',
    CHAIN_PICK: 'chainPick',
    RANGE_PICK_START: 'rangePickStart',
    RANGE_PICK_END: 'rangePickEnd',
    PATCH_PICK: 'patchPick',
    CLEAR: 'clear',
});

export const EditOperation = Object.freeze({
    NONE: 'none',
    MOVE: 'move',
    MUTATE: 'mutate',
    CUT_FRAGMENT: 'cutFragment',
    REPLACE_FRAGMENT: 'replaceFragment',
    SNAP_FRAGMENT: 'snapFragment',
    MARK_DESIGN_REGION: 'markDesignRegion',
});

export function operationLabel(op) {
    const labels = {
        [EditOperation.MOVE]: 'Move selection',
        [EditOperation.MUTATE]: 'Mutate residue',
        [EditOperation.CUT_FRAGMENT]: 'Cut fragment',
        [EditOperation.REPLACE_FRAGMENT]: 'Replace fragment',
        [EditOperation.SNAP_FRAGMENT]: 'Magnet snap',
        [EditOperation.MARK_DESIGN_REGION]: 'Mark design region',
        [SurfaceOperation.FULL]: 'Full protein surface',
        [SurfaceOperation.CHAIN_PICK]: 'Pick chain surface',
        [SurfaceOperation.RANGE_PICK_START]: 'Pick range start',
        [SurfaceOperation.RANGE_PICK_END]: 'Pick range end',
        [SurfaceOperation.PATCH_PICK]: 'Pick surface patch',
    };
    return labels[op] || String(op || 'None');
}
