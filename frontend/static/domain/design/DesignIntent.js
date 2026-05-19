function uid(prefix = 'intent') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function clonePlain(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clonePlain);
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = clonePlain(v);
    return out;
}

export const DesignIntentKind = Object.freeze({
    SELECTION: 'selection',
    MANIPULATION: 'manipulation',
    REGION: 'region',
    CONSTRAINT: 'constraint',
    SANDBOX_ACTION: 'sandboxAction',
    TOOL_REQUEST: 'toolRequest',
    AI_HANDOFF: 'aiHandoff',
    RESULT_REVIEW: 'resultReview',
});

export const DesignTargetKind = Object.freeze({
    ATOM: 'atom',
    RESIDUE: 'residue',
    RESIDUE_RANGE: 'residueRange',
    CHAIN: 'chain',
    PROTEIN: 'protein',
    SURFACE_LAYER: 'surfaceLayer',
    SANDBOX_FRAGMENT: 'sandboxFragment',
    COMPONENT: 'component',
});

export class DesignIntent {
    constructor({
                    id = null,
                    kind,
                    target = null,
                    operation = '',
                    proteinId = null,
                    source = 'vr',
                    inputDevice = '',
                    before = null,
                    after = null,
                    constraints = [],
                    parameters = {},
                    metadata = {},
                    timestamp = null,
                } = {}) {
        if (!kind) throw new Error('[DesignIntent] kind is required');
        this.id = id || uid('intent');
        this.kind = kind;
        this.target = clonePlain(target);
        this.operation = operation;
        this.proteinId = proteinId || target?.proteinId || null;
        this.source = source;
        this.inputDevice = inputDevice;
        this.before = clonePlain(before);
        this.after = clonePlain(after);
        this.constraints = clonePlain(constraints);
        this.parameters = clonePlain(parameters);
        this.metadata = clonePlain(metadata);
        this.timestamp = timestamp || new Date().toISOString();
    }

    toJSON() {
        return {
            id: this.id,
            kind: this.kind,
            target: clonePlain(this.target),
            operation: this.operation,
            proteinId: this.proteinId,
            source: this.source,
            inputDevice: this.inputDevice,
            before: clonePlain(this.before),
            after: clonePlain(this.after),
            constraints: clonePlain(this.constraints),
            parameters: clonePlain(this.parameters),
            metadata: clonePlain(this.metadata),
            timestamp: this.timestamp,
        };
    }
}

export class DesignIntentStore {
    constructor({eventBus = null, projectSession = null} = {}) {
        this.eventBus = eventBus;
        this.projectSession = projectSession;
        this._intents = [];
    }

    record(input) {
        const intent = input instanceof DesignIntent ? input : new DesignIntent(input);
        this._intents.push(intent);
        this.projectSession?.recordDesignIntent?.(intent.toJSON());
        return intent;
    }

    list({kind = null, proteinId = null, limit = null} = {}) {
        let rows = this._intents;
        if (kind) rows = rows.filter((intent) => intent.kind === kind);
        if (proteinId) rows = rows.filter((intent) => intent.proteinId === proteinId);
        if (limit != null) rows = rows.slice(Math.max(0, rows.length - limit));
        return rows;
    }

    clear() {
        this._intents.length = 0;
    }

    toJSON() {
        return this._intents.map((intent) => intent.toJSON());
    }

    summary() {
        const byKind = {};
        for (const intent of this._intents) byKind[intent.kind] = (byKind[intent.kind] || 0) + 1;
        return {
            total: this._intents.length,
            byKind,
            latest: this._intents.at(-1)?.toJSON?.() || null,
        };
    }
}

export function makeSelectionIntent({target, source = 'vr', inputDevice = '', metadata = {}} = {}) {
    return new DesignIntent({
        kind: DesignIntentKind.SELECTION,
        target,
        operation: 'select',
        proteinId: target?.proteinId || null,
        source,
        inputDevice,
        metadata,
    });
}

export function makeManipulationIntent({
    target,
    operation = 'transform',
    before = null,
    after = null,
    source = 'vr',
    inputDevice = '',
    parameters = {},
    metadata = {},
} = {}) {
    return new DesignIntent({
        kind: DesignIntentKind.MANIPULATION,
        target,
        operation,
        proteinId: target?.proteinId || null,
        source,
        inputDevice,
        before,
        after,
        parameters,
        metadata,
    });
}

export function makeToolRequestIntent({
    toolId,
    target,
    parameters = {},
    source = 'vr',
    inputDevice = '',
    metadata = {},
} = {}) {
    return new DesignIntent({
        kind: DesignIntentKind.TOOL_REQUEST,
        target,
        operation: toolId,
        proteinId: target?.proteinId || null,
        source,
        inputDevice,
        parameters,
        metadata: {toolId, ...metadata},
    });
}
