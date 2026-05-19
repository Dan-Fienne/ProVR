function uid(prefix = 'rep') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function clonePlain(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clonePlain);
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = clonePlain(v);
    return out;
}

function deepMerge(base = {}, patch = {}) {
    const out = clonePlain(base) || {};
    for (const [key, value] of Object.entries(patch || {})) {
        if (
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            out[key] &&
            typeof out[key] === 'object' &&
            !Array.isArray(out[key])
        ) {
            out[key] = deepMerge(out[key], value);
        } else {
            out[key] = clonePlain(value);
        }
    }
    return out;
}

export const DefaultRepresentationFilter = Object.freeze({
    protein: true,
    nucleic: true,
    heterogen: true,
    water: false,
    unknown: false,
    chainIds: null,
    residueIds: null,
    atomIds: null,
});

export const DefaultRepresentationStyle = Object.freeze({
    colorScheme: 'element',
    opacity: 1.0,
});

export const DefaultRepresentationGeometry = Object.freeze({
    quality: 'medium',
});

export const DefaultRepresentationInteraction = Object.freeze({
    pickable: true,
    targetLevel: 'atom',
});

const KNOWN_KEYS = new Set([
    'id',
    'type',
    'proteinId',
    'name',
    'filter',
    'style',
    'geometry',
    'interaction',
    'visible',
    'metadata',
]);

/**
 * RepresentationSpec preserves unknown top-level extras.
 *
 * This is critical for surface specs:
 * - layers
 * - ranges
 * - residueColorRules
 * - colorRules
 *
 * and future representation plugins.
 */
export class RepresentationSpec {
    constructor({
                    id = null,
                    type,
                    proteinId,
                    name = '',
                    filter = {},
                    style = {},
                    geometry = {},
                    interaction = {},
                    visible = true,
                    metadata = {},
                    ...extras
                } = {}) {
        if (!type) throw new Error('[RepresentationSpec] type is required');
        if (!proteinId) throw new Error('[RepresentationSpec] proteinId is required');

        this.id = id || uid(type);
        this.type = type;
        this.proteinId = proteinId;
        this.name = name || this.id;

        this.filter = deepMerge(DefaultRepresentationFilter, filter);
        this.style = deepMerge(DefaultRepresentationStyle, style);
        this.geometry = deepMerge(DefaultRepresentationGeometry, geometry);
        this.interaction = deepMerge(DefaultRepresentationInteraction, interaction);
        this.visible = visible !== false;
        this.metadata = clonePlain(metadata) || {};

        this._extras = clonePlain(extras) || {};
        Object.assign(this, this._extras);

        Object.freeze(this.filter);
        Object.freeze(this.style);
        Object.freeze(this.geometry);
        Object.freeze(this.interaction);
        Object.freeze(this.metadata);
        Object.freeze(this._extras);
    }

    patch(patch = {}) {
        const nextExtras = {...this._extras};
        for (const [key, value] of Object.entries(patch)) {
            if (!KNOWN_KEYS.has(key)) nextExtras[key] = clonePlain(value);
        }

        return new RepresentationSpec({
            ...nextExtras,
            id: patch.id ?? this.id,
            type: patch.type ?? this.type,
            proteinId: patch.proteinId ?? this.proteinId,
            name: patch.name ?? this.name,
            filter: patch.filter ? deepMerge(this.filter, patch.filter) : this.filter,
            style: patch.style ? deepMerge(this.style, patch.style) : this.style,
            geometry: patch.geometry ? deepMerge(this.geometry, patch.geometry) : this.geometry,
            interaction: patch.interaction ? deepMerge(this.interaction, patch.interaction) : this.interaction,
            visible: patch.visible ?? this.visible,
            metadata: patch.metadata ? deepMerge(this.metadata, patch.metadata) : this.metadata,
        });
    }

    toJSON() {
        return {
            ...clonePlain(this._extras),
            id: this.id,
            type: this.type,
            proteinId: this.proteinId,
            name: this.name,
            filter: clonePlain(this.filter),
            style: clonePlain(this.style),
            geometry: clonePlain(this.geometry),
            interaction: clonePlain(this.interaction),
            visible: this.visible,
            metadata: clonePlain(this.metadata),
        };
    }
}

export function normalizeRepresentationSpec(input) {
    if (input instanceof RepresentationSpec) return input;
    return new RepresentationSpec(input);
}

export function mergeRepresentationDefaults(input = {}, defaults = {}) {
    const spec = normalizeRepresentationSpec({
        ...clonePlain(defaults),
        ...clonePlain(input),
        filter: deepMerge(defaults.filter || {}, input.filter || {}),
        style: deepMerge(defaults.style || {}, input.style || {}),
        geometry: deepMerge(defaults.geometry || {}, input.geometry || {}),
        interaction: deepMerge(defaults.interaction || {}, input.interaction || {}),
        metadata: deepMerge(defaults.metadata || {}, input.metadata || {}),
    });
    return spec;
}
