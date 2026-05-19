import {EditOperation, SelectionScope, SurfaceOperation, VRWorkflowPhase} from '../../domain/design/EditOperationTypes.js';

export class ProVRVRWorkspaceState {
    constructor() {
        this.phase = VRWorkflowPhase.BOOT;
        this.activeProteinLoaded = false;
        this.editScope = SelectionScope.RESIDUE;
        this.editOperation = EditOperation.NONE;
        this.surfaceOperation = SurfaceOperation.NONE;
        this.surfaceRangeStart = null;
        this.selectedTarget = null;

        this.visible = {
            ballstick: true,
            cartoon: false,
            line: false,
            surface: false,
        };

        this.repIds = {
            ballstick: null,
            cartoon: null,
            line: null,
            surface: null,
        };

        this.status = {
            message: 'Ready',
            kind: 'info',
        };
    }

    setPhase(phase) { this.phase = phase; }
    setEditScope(scope) { this.editScope = scope; }
    setEditOperation(op) { this.editOperation = op; }
    setSurfaceOperation(op) { this.surfaceOperation = op; }
    setSelectedTarget(target) { this.selectedTarget = target; }
    clearSurfaceRange() { this.surfaceRangeStart = null; }
    setRepresentationId(type, id) { this.repIds[type] = id; }
    setVisible(type, visible) { this.visible[type] = !!visible; }

    toJSON() {
        return {
            phase: this.phase,
            activeProteinLoaded: this.activeProteinLoaded,
            editScope: this.editScope,
            editOperation: this.editOperation,
            surfaceOperation: this.surfaceOperation,
            surfaceRangeStart: this.surfaceRangeStart,
            selectedTarget: this.selectedTarget ? {
                kind: this.selectedTarget.kind,
                proteinId: this.selectedTarget.proteinId,
                residueIds: this.selectedTarget.residueIds || [],
                chainIds: this.selectedTarget.chainIds || [],
            } : null,
            visible: {...this.visible},
            repIds: {...this.repIds},
            status: {...this.status},
        };
    }
}
