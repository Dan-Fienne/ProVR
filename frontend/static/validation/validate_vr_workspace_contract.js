import {VRRendererRuntime} from '../vr/runtime/VRRendererRuntime.js';
import {VRControllerInputAdapter} from '../vr/input/VRControllerInputAdapter.js';
import {VRSelectionController} from '../vr/interaction/VRSelectionController.js';
import {VRManipulationController} from '../vr/interaction/VRManipulationController.js';
import {SpatialUISystem} from '../vr/spatial-ui/SpatialUISystem.js';
import {SpatialToolbar} from '../vr/spatial-ui/SpatialToolbar.js';
import {SpatialButton} from '../vr/spatial-ui/SpatialButton.js';
import {SpatialInspector} from '../vr/spatial-ui/SpatialInspector.js';
import {SpatialToast} from '../vr/spatial-ui/SpatialToast.js';
import {ProVRVRWorkspace} from '../vr/workspace/ProVRVRWorkspace.js';
import {ProVRVRWorkspaceState} from '../vr/workspace/ProVRVRWorkspaceState.js';
import {SurfaceFeature} from '../features/surface/SurfaceFeature.js';
import {ExportFeature} from '../features/export/ExportFeature.js';
import {HistoryFeature} from '../features/history/HistoryFeature.js';

export function validateVRWorkspaceContract() {
    const issues = [];

    const checks = [
        ['VRRendererRuntime', VRRendererRuntime],
        ['VRControllerInputAdapter', VRControllerInputAdapter],
        ['VRSelectionController', VRSelectionController],
        ['VRManipulationController', VRManipulationController],
        ['SpatialUISystem', SpatialUISystem],
        ['SpatialToolbar', SpatialToolbar],
        ['SpatialButton', SpatialButton],
        ['SpatialInspector', SpatialInspector],
        ['SpatialToast', SpatialToast],
        ['ProVRVRWorkspace', ProVRVRWorkspace],
        ['ProVRVRWorkspaceState', ProVRVRWorkspaceState],
        ['SurfaceFeature', SurfaceFeature],
        ['ExportFeature', ExportFeature],
        ['HistoryFeature', HistoryFeature],
    ];

    for (const [name, value] of checks) {
        if (typeof value !== 'function') issues.push(`${name} is not a class/function export`);
    }

    const state = new ProVRVRWorkspaceState();
    state.setEditScope('chain');
    state.setVisible('cartoon', true);
    if (state.editScope !== 'chain') issues.push('ProVRVRWorkspaceState.setEditScope failed');
    if (state.visible.cartoon !== true) issues.push('ProVRVRWorkspaceState.setVisible failed');

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            checked: checks.map(([name]) => name),
            state: state.toJSON(),
        },
    };
}

if (typeof window !== 'undefined') {
    window.validateVRWorkspaceContract = validateVRWorkspaceContract;
}
