/**
 * ProVR EventTypes
 *
 * Single event dictionary for the entire frontend.
 * No runtime, feature, page, validator, or VR module should invent local event strings.
 */
export const EventTypes = Object.freeze({
    // Structure lifecycle
    STRUCTURE_LOADING: 'structureLoading',
    STRUCTURE_LOADED: 'structureLoaded',
    STRUCTURE_LOAD_FAILED: 'structureLoadFailed',
    STRUCTURE_REBUILT: 'structureRebuilt',
    STRUCTURE_REMOVED: 'structureRemoved',

    // Atom / residue / chain editing
    ATOM_POSITION_CHANGED: 'atomPositionChanged',
    ATOM_SET_TRANSFORMED: 'atomSetTransformed',
    RESIDUE_MODIFIED: 'residueModified',
    CHAIN_TRANSFORMED: 'chainTransformed',

    // Selection / picking
    PICK_TARGET_HOVERED: 'pickTargetHovered',
    PICK_TARGET_SELECTED: 'pickTargetSelected',
    SELECTION_CHANGED: 'selectionChanged',
    EDIT_TARGET_RESOLVED: 'editTargetResolved',

    // Edit session
    EDIT_SESSION_STARTED: 'editSessionStarted',
    EDIT_SESSION_PREVIEWED: 'editSessionPreviewed',
    EDIT_SESSION_CANCELLED: 'editSessionCancelled',
    EDIT_SESSION_COMMITTED: 'editSessionCommitted',
    EDIT_SESSION_FAILED: 'editSessionFailed',

    // Command / history
    COMMAND_EXECUTED: 'commandExecuted',
    COMMAND_UNDONE: 'commandUndone',
    COMMAND_REDONE: 'commandRedone',
    COMMAND_FAILED: 'commandFailed',
    COMMAND_TRANSACTION_STARTED: 'commandTransactionStarted',
    COMMAND_TRANSACTION_COMMITTED: 'commandTransactionCommitted',
    COMMAND_TRANSACTION_ROLLED_BACK: 'commandTransactionRolledBack',
    HISTORY_CHANGED: 'historyChanged',

    // Representation lifecycle
    REPRESENTATION_REGISTERED: 'representationRegistered',
    REPRESENTATION_CREATED: 'representationCreated',
    REPRESENTATION_REMOVED: 'representationRemoved',
    REPRESENTATION_REBUILT: 'representationRebuilt',
    REPRESENTATION_UPDATED: 'representationUpdated',
    REPRESENTATION_VISIBILITY_CHANGED: 'representationVisibilityChanged',
    REPRESENTATION_SPEC_CHANGED: 'representationSpecChanged',

    // Surface
    SURFACE_LAYER_CREATED: 'surfaceLayerCreated',
    SURFACE_LAYER_TRANSFORMED: 'surfaceLayerTransformed',
    SURFACE_LAYER_RESET: 'surfaceLayerReset',
    SURFACE_CONTACT_ANALYZED: 'surfaceContactAnalyzed',

    // Project/session
    PROJECT_CREATED: 'projectCreated',
    PROJECT_LOADED: 'projectLoaded',
    PROJECT_SAVED: 'projectSaved',
    PROJECT_DIRTY_CHANGED: 'projectDirtyChanged',
    PROJECT_ARTIFACT_ADDED: 'projectArtifactAdded',

    // Design intent / paper-level closed loop
    DESIGN_INTENT_RECORDED: 'designIntentRecorded',
    DESIGN_REGION_CREATED: 'designRegionCreated',
    DESIGN_CONSTRAINT_CHANGED: 'designConstraintChanged',
    AI_HANDOFF_CREATED: 'aiHandoffCreated',
    AI_RESULT_IMPORTED: 'aiResultImported',

    // Sandbox
    SANDBOX_ENTERED: 'sandboxEntered',
    SANDBOX_EXITED: 'sandboxExited',
    SANDBOX_FRAGMENT_ADDED: 'sandboxFragmentAdded',
    SANDBOX_FRAGMENT_TRANSFORMED: 'sandboxFragmentTransformed',
    SANDBOX_BACKBONE_BUILT: 'sandboxBackboneBuilt',
    SANDBOX_MODEL_COMMITTED: 'sandboxModelCommitted',

    // Tool / backend job
    TOOL_REGISTERED: 'toolRegistered',
    TOOL_JOB_SUBMITTED: 'toolJobSubmitted',
    TOOL_JOB_STARTED: 'toolJobStarted',
    TOOL_JOB_PROGRESS: 'toolJobProgress',
    TOOL_JOB_COMPLETED: 'toolJobCompleted',
    TOOL_JOB_FAILED: 'toolJobFailed',
    TOOL_ARTIFACT_IMPORTED: 'toolArtifactImported',

    // Workflow
    WORKFLOW_STARTED: 'workflowStarted',
    WORKFLOW_NODE_STARTED: 'workflowNodeStarted',
    WORKFLOW_NODE_COMPLETED: 'workflowNodeCompleted',
    WORKFLOW_NODE_FAILED: 'workflowNodeFailed',
    WORKFLOW_COMPLETED: 'workflowCompleted',
    WORKFLOW_FAILED: 'workflowFailed',

    // Runtime / UI
    RUNTIME_READY: 'runtimeReady',
    RUNTIME_ERROR: 'runtimeError',
    UI_ACTION_REQUESTED: 'uiActionRequested',
    UI_STATE_CHANGED: 'uiStateChanged',
});

const KNOWN_EVENT_VALUES = new Set(Object.values(EventTypes));

export function isKnownEventType(type) {
    return KNOWN_EVENT_VALUES.has(type);
}

export function eventTypeName(value) {
    for (const [key, eventValue] of Object.entries(EventTypes)) {
        if (eventValue === value) return key;
    }
    return null;
}

export function requireKnownEventType(type, {allowUnknown = false} = {}) {
    if (!type || typeof type !== 'string') {
        throw new Error('[EventTypes] event type must be a non-empty string');
    }
    if (!allowUnknown && !isKnownEventType(type)) {
        throw new Error(`[EventTypes] unknown event type: ${type}`);
    }
    return type;
}
