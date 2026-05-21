import {VRRigidDragMode, VRConformationMode} from '../vr/drag/VRDragModes.js';
import {VRInteractionMode} from '../vr/interaction-core/VRInteractionState.js';
import {describePickTarget} from '../vr/targeting/VRTargetDescriptor.js';

export function validateVRIndustrialInteractionCore() {
    const issues = [];
    for (const key of ['PROTEIN_COORDINATES','CHAIN','FRAGMENT','SELECTION']) if (!VRRigidDragMode[key]) issues.push(`missing rigid mode ${key}`);
    for (const key of ['ATOM_CONSTRAINT','RESIDUE_LOCAL','RESIDUE_SIDECHAIN','LOOP_RANGE']) if (!VRConformationMode[key]) issues.push(`missing conformation mode ${key}`);
    if (!VRInteractionMode.RIGID_DRAG || !VRInteractionMode.CONFORMATION_DRAG) issues.push('interaction modes missing');
    const d = describePickTarget({kind:'residue', atomIds:[1,2], residueIds:['r1'], chainIds:['A']}, null);
    if (!d.title || !d.subtitle) issues.push('target descriptor not producing label');
    return {ok: issues.length === 0, issues, summary:{rigidModes:VRRigidDragMode, conformationModes:VRConformationMode, sampleDescriptor:d, note:'2.5 separates targeting, rigid transform, conformation edit, preview, commit.'}};
}
if (typeof window !== 'undefined') window.validateVRIndustrialInteractionCore = validateVRIndustrialInteractionCore;
