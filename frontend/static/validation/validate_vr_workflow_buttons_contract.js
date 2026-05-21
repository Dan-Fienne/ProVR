import {VRWorkflowState} from '../vr/workflow/VRWorkflowState.js';
import {VRWorkflowController} from '../vr/workflow/VRWorkflowController.js';
import {CommonButtons, PageDefinitions} from '../vr/workflow/VRWorkflowDefinitions.js';
import {WorkflowPage, WorkflowTaskKind} from '../vr/workflow/VRWorkflowActions.js';

export function validateVRWorkflowButtonsContract() {
    const issues = [];

    const requiredPages = [
        WorkflowPage.START,
        WorkflowPage.HOME,
        WorkflowPage.LOAD,
        WorkflowPage.VIEW,
        WorkflowPage.SELECT,
        WorkflowPage.SURFACE,
        WorkflowPage.EDIT,
        WorkflowPage.MUTATE,
        WorkflowPage.FRAGMENT,
        WorkflowPage.DESIGN,
        WorkflowPage.COLOR,
        WorkflowPage.TOOLS,
        WorkflowPage.SYSTEM,
        WorkflowPage.PROTEIN_SIZE,
        WorkflowPage.UI_SIZE,
    ];

    for (const page of requiredPages) {
        if (!PageDefinitions[page]) issues.push(`Missing page: ${page}`);
        if (!PageDefinitions[page]?.buttons?.length) issues.push(`Page has no buttons: ${page}`);
    }

    if (CommonButtons.length < 8) issues.push('Common bar should expose shared actions.');

    const state = new VRWorkflowState();
    const controller = new VRWorkflowController({state, hooks: {}});
    controller.navigate(WorkflowPage.SURFACE);
    if (state.page !== WorkflowPage.SURFACE) issues.push('Navigation failed');

    state.armTask(WorkflowTaskKind.SURFACE_RANGE, {title: 'Surface Range', requiredPicks: 2, pickType: 'range'});
    if (!controller.getMainButtons().some((b) => b.id === 'common:cancel')) issues.push('Task view missing cancel');

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            pageCount: requiredPages.length,
            commonButtonCount: CommonButtons.length,
            sampleStatus: controller.getStatusCard(),
            state: state.toJSON(),
        },
    };
}

if (typeof window !== 'undefined') {
    window.validateVRWorkflowButtonsContract = validateVRWorkflowButtonsContract;
}
