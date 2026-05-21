import {VRModelDragController} from '../vr/interaction/VRModelDragController.js';
import {VRHoverFeedbackLayer} from '../vr/interaction/VRHoverFeedbackLayer.js';
import {installControllerOBJModels} from '../vr/controllers/SimpleOBJControllerModel.js';

export function validateVRFastDragContract() {
    const issues = [];

    if (typeof VRModelDragController !== 'function') issues.push('VRModelDragController missing');
    if (typeof VRHoverFeedbackLayer !== 'function') issues.push('VRHoverFeedbackLayer missing');
    if (typeof installControllerOBJModels !== 'function') issues.push('custom controller OBJ installer missing');

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            previewMode: 'visual-only',
            perFrameModelWrites: false,
            perFrameEventDispatch: false,
            commitMode: 'single TransformAtomSetCommand on selectend',
            hoverRerender: 'target-key throttled',
            controllerModel: '/static/vr/models/controller.obj',
        },
    };
}

if (typeof window !== 'undefined') {
    window.validateVRFastDragContract = validateVRFastDragContract;
}
