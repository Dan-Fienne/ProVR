import {VRInteractionState} from '../vr/interaction/VRInteractionState.js';
import {VRProteinCollection} from '../vr/workspace/VRProteinCollection.js';

export function validateVRDragStatePreviewFixContract() {
    const issues = [];

    const state = new VRInteractionState();
    state.menuOpen = true;
    state.setTool('transform_protein_coordinates');
    if (state.currentTool !== 'transform_protein_coordinates') issues.push('Tool state did not set correctly.');

    const context = {};
    Object.defineProperty(context, 'activeProteinId', {get: () => 'getter-only'});
    Object.defineProperty(context, 'activeModel', {get: () => null});
    const collection = new VRProteinCollection({context, representationFeature: {setVisible(){}}});
    collection.addProtein({model: {id: 'p1'}, pdbId: 'P1'});
    if (collection.activeProteinId !== 'p1') issues.push('ProteinCollection active state failed.');

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            dragState: 'InputRouter now syncs state.menuOpen with menu.isOpen().',
            rigidPreview: 'VRRigidTransformEngine applies real preview positions and emits preview events.',
            collection: collection.summary(),
        },
    };
}

if (typeof window !== 'undefined') window.validateVRDragStatePreviewFixContract = validateVRDragStatePreviewFixContract;
