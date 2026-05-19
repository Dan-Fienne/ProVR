import {mergeRepresentationDefaults, normalizeRepresentationSpec} from './RepresentationSpec.js';
import {normalizeCapabilities, RepresentationFamily, assertCapabilities} from './RepresentationCapabilities.js';

function clonePlain(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clonePlain);
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = clonePlain(v);
    return out;
}

export class RepresentationRegistry {
    constructor() {
        this._records = new Map();
    }

    register(type, record = {}) {
        if (!type || typeof type !== 'string') throw new Error('[RepresentationRegistry] type is required');
        if (this._records.has(type)) throw new Error(`[RepresentationRegistry] duplicate type: ${type}`);

        assertCapabilities(record);

        const normalized = Object.freeze({
            type,
            family: record.family || RepresentationFamily.CUSTOM,
            description: record.description || '',
            capabilities: normalizeCapabilities(record.capabilities || {}),
            defaults: clonePlain(record.defaults || {}),
            factory: record.factory,
            metadata: clonePlain(record.metadata || {}),
        });

        this._records.set(type, normalized);
        return normalized;
    }

    has(type) {
        return this._records.has(type);
    }

    get(type) {
        return this._records.get(type) || null;
    }

    require(type) {
        const record = this.get(type);
        if (!record) throw new Error(`[RepresentationRegistry] representation type not registered: ${type}`);
        return record;
    }

    create(specInput, context) {
        const input = normalizeRepresentationSpec(specInput);
        const record = this.require(input.type);
        const spec = mergeRepresentationDefaults(input.toJSON(), record.defaults || {});
        const rep = record.factory({spec, context, registryRecord: record});
        if (!rep) throw new Error(`[RepresentationRegistry] factory returned null for type: ${input.type}`);
        return rep;
    }

    list() {
        return [...this._records.values()].map((record) => ({
            type: record.type,
            family: record.family,
            description: record.description,
            capabilities: {...record.capabilities},
            defaults: clonePlain(record.defaults),
        }));
    }

    summary() {
        return {
            count: this._records.size,
            types: [...this._records.keys()],
            rows: this.list(),
        };
    }
}
