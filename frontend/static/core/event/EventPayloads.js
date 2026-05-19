import {EventTypes, requireKnownEventType} from './EventTypes.js';

function clonePlain(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clonePlain);
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = clonePlain(v);
    return out;
}

function nowIso() {
    return new Date().toISOString();
}

function normalizeIds(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((v) => v !== null && v !== undefined))];
}

/**
 * Build a normalized ProVR event payload.
 */
export function createEventPayload(type, payload = {}, {
    source = payload.source || 'unknown',
    allowUnknown = false,
} = {}) {
    const eventType = requireKnownEventType(type, {allowUnknown});
    return Object.freeze({
        ...clonePlain(payload),
        type: eventType,
        source,
        timestamp: payload.timestamp || nowIso(),
    });
}

export function createStructureLoadedPayload({
    proteinId,
    model,
    format = '',
    filename = '',
    source = 'structure-loader',
} = {}) {
    return createEventPayload(EventTypes.STRUCTURE_LOADED, {
        proteinId,
        model,
        format,
        filename,
    }, {source});
}

export function createAtomSetTransformedPayload({
    proteinId,
    atomIds = [],
    residueIds = [],
    chainIds = [],
    phase = 'final',
    revision = null,
    intent = null,
    metadata = {},
    source = 'command',
} = {}) {
    return createEventPayload(EventTypes.ATOM_SET_TRANSFORMED, {
        proteinId,
        atomIds: normalizeIds(atomIds),
        residueIds: normalizeIds(residueIds),
        chainIds: normalizeIds(chainIds),
        phase,
        revision,
        intent: clonePlain(intent),
        metadata: clonePlain(metadata),
    }, {source});
}

export function createEditSessionPayload(type, {
    sessionId,
    proteinId,
    target = null,
    atomIds = [],
    residueIds = [],
    chainIds = [],
    phase = null,
    translation = null,
    metadata = {},
    source = 'edit-session',
} = {}) {
    return createEventPayload(type, {
        sessionId,
        proteinId,
        target: clonePlain(target),
        atomIds: normalizeIds(atomIds),
        residueIds: normalizeIds(residueIds),
        chainIds: normalizeIds(chainIds),
        phase,
        translation: translation ? [...translation] : null,
        metadata: clonePlain(metadata),
    }, {source});
}

export function createRepresentationPayload(type, {
    representationId,
    proteinId,
    representationType = '',
    spec = null,
    metadata = {},
    source = 'representation-manager',
} = {}) {
    return createEventPayload(type, {
        representationId,
        proteinId,
        representationType,
        spec: clonePlain(spec),
        metadata: clonePlain(metadata),
    }, {source});
}

export function createToolJobPayload(type, {
    jobId,
    toolId,
    status = '',
    progress = null,
    artifacts = [],
    error = null,
    metadata = {},
    source = 'tool-workflow',
} = {}) {
    return createEventPayload(type, {
        jobId,
        toolId,
        status,
        progress,
        artifacts: clonePlain(artifacts),
        error,
        metadata: clonePlain(metadata),
    }, {source});
}

export function assertEventPayload(evt, {
    requireProteinId = false,
    requireAtomIds = false,
} = {}) {
    if (!evt || typeof evt !== 'object') {
        throw new Error('[EventPayloads] event payload must be an object');
    }
    requireKnownEventType(evt.type, {allowUnknown: false});
    if (requireProteinId && !evt.proteinId) {
        throw new Error(`[EventPayloads] ${evt.type} requires proteinId`);
    }
    if (requireAtomIds && (!Array.isArray(evt.atomIds) || evt.atomIds.length === 0)) {
        throw new Error(`[EventPayloads] ${evt.type} requires non-empty atomIds`);
    }
    return true;
}
