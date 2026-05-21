import {VRDragScope, resolveDragTarget} from '../vr/interaction/VRDragScope.js';
import {WorkflowPage, WorkflowTaskKind} from '../vr/workflow/VRWorkflowActions.js';
import {PageDefinitions} from '../vr/workflow/VRWorkflowDefinitions.js';

export function validateVRDragScopeContract() {
    const issues = [];

    for (const scope of ['ATOM', 'RESIDUE', 'RANGE', 'CHAIN', 'PROTEIN']) {
        if (!VRDragScope[scope]) issues.push(`Missing drag scope: ${scope}`);
    }

    const movePage = PageDefinitions[WorkflowPage.MOVE];
    if (!movePage) issues.push('Missing WorkflowPage.MOVE');
    else {
        const ids = movePage.buttons.map((b) => b.id);
        for (const id of ['move:atom', 'move:residue', 'move:range', 'move:chain', 'move:protein']) {
            if (!ids.includes(id)) issues.push(`Move page missing ${id}`);
        }
    }

    if (WorkflowTaskKind.MOVE_RANGE_SETUP !== 'moveRangeSetup') {
        issues.push('Missing MOVE_RANGE_SETUP task kind');
    }

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            dragScopes: VRDragScope,
            moveButtons: movePage?.buttons?.map((b) => [b.id, b.title]) || [],
            note: 'Move atom/residue/range/chain/protein coordinates are now first-class workflow scopes. Hover feedback layer should make target hits visible.',
        },
    };
}

if (typeof window !== 'undefined') {
    window.validateVRDragScopeContract = validateVRDragScopeContract;
}
