import {mergeCapabilities} from './RepresentationCapabilities.js';

export class RepresentationRegistry {
    constructor() {
        this._records = new Map();
    }

    register(type, {
        factory,
        family = 'debug',
        capabilities = {},
        optionSchema = null,
        description = '',
    } = {}) {
        if (!type) throw new Error('[RepresentationRegistry] type is required');
        if (typeof factory !== 'function') throw new Error(`[RepresentationRegistry] factory is required for ${type}`);
        this._records.set(type, {
            type,
            factory,
            family,
            capabilities: mergeCapabilities({family, ...capabilities}),
            optionSchema,
            description,
        });
    }

    has(type) {
        return this._records.has(type);
    }

    get(type) {
        return this._records.get(type) || null;
    }

    list() {
        return [...this._records.values()].map((record) => ({
            type: record.type,
            family: record.family,
            capabilities: record.capabilities,
            description: record.description,
        }));
    }

    create(spec, context) {
        const record = this.get(spec.type);
        if (!record) throw new Error(`[RepresentationRegistry] unknown representation type: ${spec.type}`);
        return record.factory({spec, context});
    }
}