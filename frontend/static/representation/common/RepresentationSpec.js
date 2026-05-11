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
    visible: true,
});

export const DefaultRepresentationGeometry = Object.freeze({
    quality: 'medium',
});

export const DefaultRepresentationInteraction = Object.freeze({
    pickable: true,
    targetLevel: 'atom',
});

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
                } = {}) {
        if (!type) throw new Error('[RepresentationSpec] type is required');
        if (!proteinId) throw new Error('[RepresentationSpec] proteinId is required');

        this.id = id || uid(type);
        this.type = type;
        this.proteinId = proteinId;
        this.name = name || this.id;
        this.filter = {...DefaultRepresentationFilter, ...clonePlain(filter)};
        this.style = {...DefaultRepresentationStyle, ...clonePlain(style)};
        this.geometry = {...DefaultRepresentationGeometry, ...clonePlain(geometry)};
        this.interaction = {...DefaultRepresentationInteraction, ...clonePlain(interaction)};
        this.visible = visible;
        this.metadata = clonePlain(metadata);
    }

    patch(patch = {}) {
        return new RepresentationSpec({
            id: patch.id ?? this.id,
            type: patch.type ?? this.type,
            proteinId: patch.proteinId ?? this.proteinId,
            name: patch.name ?? this.name,
            filter: patch.filter ? {...this.filter, ...clonePlain(patch.filter)} : this.filter,
            style: patch.style ? {...this.style, ...clonePlain(patch.style)} : this.style,
            geometry: patch.geometry ? {...this.geometry, ...clonePlain(patch.geometry)} : this.geometry,
            interaction: patch.interaction ? {...this.interaction, ...clonePlain(patch.interaction)} : this.interaction,
            visible: patch.visible ?? this.visible,
            metadata: patch.metadata ? {...this.metadata, ...clonePlain(patch.metadata)} : this.metadata,
        });
    }

    toJSON() {
        return {
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
