export const VRPhase = Object.freeze({
    IDLE: 'idle',
    MENU: 'menu',
    TARGETING: 'targeting',
    RANGE_START: 'range_start',
    RANGE_END: 'range_end',
    RIGID_DRAG: 'rigid_drag',
    CONFORMATION_DRAG: 'conformation_drag',
    MENU_DRAGGING: 'menu_dragging',
    SURFACE_OPACITY: 'surface_opacity',
    VIEW_TWO_HAND_SCALE: 'view_two_hand_scale',
    CONFIRM: 'confirm',
});

export const VRTool = Object.freeze({
    INSPECT: 'inspect',

    VIEW_GRAB_PROTEIN: 'view_grab_protein',
    VIEW_TWO_HAND_SCALE: 'view_two_hand_scale',

    SURFACE_PICK_CHAIN: 'surface_pick_chain',
    SURFACE_PICK_RANGE_START: 'surface_pick_range_start',

    TRANSFORM_PROTEIN_COORDINATES: 'transform_protein_coordinates',
    TRANSFORM_CHAIN: 'transform_chain',
    TRANSFORM_SELECTED_RIGID: 'transform_selected_rigid',
    TRANSFORM_FRAGMENT_RIGID: 'transform_fragment_rigid',

    CONFORM_ATOM_CONSTRAINT: 'conform_atom_constraint',
    CONFORM_RESIDUE_LOCAL: 'conform_residue_local',
    CONFORM_RESIDUE_SIDECHAIN: 'conform_residue_sidechain',
    CONFORM_LOOP_RANGE_START: 'conform_loop_range_start',

    FRAGMENT_CUT_START: 'fragment_cut_start',
    FRAGMENT_REPLACE_START: 'fragment_replace_start',
    FRAGMENT_INSERT: 'fragment_insert',
    FRAGMENT_BRIDGE: 'fragment_bridge',
    FRAGMENT_MAGNET_SNAP: 'fragment_magnet_snap',

    DESIGN_REGION_START: 'design_region_start',
    COLOR_PICK_CHAIN: 'color_pick_chain',
});

export class VRInteractionState {
    constructor() {
        this.menuOpen = false;
        this.currentTool = VRTool.INSPECT;
        this.currentPhase = VRPhase.IDLE;
        this.activeProteinId = null;
        this.hoverTarget = null;
        this.selectedTarget = null;
        this.pendingRangeStart = null;
        this.pendingRangeEnd = null;
        this.dragSession = null;
        this.status = 'Ready';
    }

    setTool(tool, phase = VRPhase.TARGETING) {
        this.currentTool = tool || VRTool.INSPECT;
        this.currentPhase = phase;
        this.pendingRangeStart = null;
        this.pendingRangeEnd = null;
    }

    clearTool() {
        this.currentTool = VRTool.INSPECT;
        this.currentPhase = VRPhase.IDLE;
        this.pendingRangeStart = null;
        this.pendingRangeEnd = null;
    }

    toJSON() {
        return {
            menuOpen: this.menuOpen,
            currentTool: this.currentTool,
            currentPhase: this.currentPhase,
            activeProteinId: this.activeProteinId,
            hoverTarget: this.hoverTarget ? {
                kind: this.hoverTarget.kind,
                atomIds: this.hoverTarget.atomIds?.length || 0,
                residueIds: this.hoverTarget.residueIds?.length || 0,
                chainIds: this.hoverTarget.chainIds || [],
            } : null,
            selectedTarget: this.selectedTarget ? {
                kind: this.selectedTarget.kind,
                atomIds: this.selectedTarget.atomIds?.length || 0,
                residueIds: this.selectedTarget.residueIds?.length || 0,
                chainIds: this.selectedTarget.chainIds || [],
            } : null,
            status: this.status,
        };
    }
}
