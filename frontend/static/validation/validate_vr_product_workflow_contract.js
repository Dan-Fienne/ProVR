import {ProVRVRWorkspaceState} from '../vr/workspace/ProVRVRWorkspaceState.js';
import {VRWorkflowPhase, SurfaceOperation, EditOperation} from '../domain/design/EditOperationTypes.js';
import {FragmentLibrary} from '../domain/design/FragmentModel.js';
import {ProteinDesignFeature} from '../features/protein-design/ProteinDesignFeature.js';
import {SurfaceFeature} from '../features/surface/SurfaceFeature.js';
import {MutateResidueCommand} from '../core/command/structure/MutateResidueCommand.js';
import {CutFragmentCommand} from '../core/command/structure/CutFragmentCommand.js';
import {ReplaceFragmentCommand} from '../core/command/structure/ReplaceFragmentCommand.js';
import {SnapFragmentCommand} from '../core/command/structure/SnapFragmentCommand.js';

export function validateVRProductWorkflowContract() {
    const issues = [];

    const state = new ProVRVRWorkspaceState();
    state.setPhase(VRWorkflowPhase.START_SPACE);
    state.setSurfaceOperation(SurfaceOperation.RANGE_PICK_START);
    state.setEditOperation(EditOperation.MUTATE);

    if (state.phase !== VRWorkflowPhase.START_SPACE) issues.push('phase state failed');
    if (state.surfaceOperation !== SurfaceOperation.RANGE_PICK_START) issues.push('surface operation state failed');
    if (state.editOperation !== EditOperation.MUTATE) issues.push('edit operation state failed');

    const lib = new FragmentLibrary();
    if (!lib.first()) issues.push('FragmentLibrary has no builtins');

    const classes = [
        ProteinDesignFeature,
        SurfaceFeature,
        MutateResidueCommand,
        CutFragmentCommand,
        ReplaceFragmentCommand,
        SnapFragmentCommand,
    ];

    for (const cls of classes) {
        if (typeof cls !== 'function') issues.push(`${cls?.name || 'unknown'} is not a class export`);
    }

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            workflow: state.toJSON(),
            fragments: lib.list(),
        },
    };
}

if (typeof window !== 'undefined') {
    window.validateVRProductWorkflowContract = validateVRProductWorkflowContract;
}
