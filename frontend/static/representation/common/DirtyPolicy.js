export const RepDirtyFlags = Object.freeze({
    NONE: 0,
    VISIBILITY: 1 << 0,
    STYLE: 1 << 1,
    FILTER: 1 << 2,
    GEOMETRY: 1 << 3,
    PICK_TARGETS: 1 << 4,
    TRANSFORM: 1 << 5,
    DATA: 1 << 6,
    FULL_REBUILD: 1 << 15,
});

export function hasDirtyFlag(flags, flag) {
    return (flags & flag) === flag;
}

export function combineDirtyFlags(...flags) {
    return flags.reduce((out, flag) => out | flag, RepDirtyFlags.NONE);
}

export function dirtyFlagsToNames(flags) {
    const out = [];
    for (const [name, value] of Object.entries(RepDirtyFlags)) {
        if (name !== 'NONE' && value !== RepDirtyFlags.NONE && hasDirtyFlag(flags, value)) out.push(name);
    }
    if (!out.length) out.push('NONE');
    return out;
}

export function patchToDirtyFlags(patch = {}) {
    let flags = RepDirtyFlags.NONE;
    if ('visible' in patch) flags |= RepDirtyFlags.VISIBILITY;
    if ('style' in patch) flags |= RepDirtyFlags.STYLE;
    if ('filter' in patch) flags |= RepDirtyFlags.FILTER;
    if ('geometry' in patch) flags |= RepDirtyFlags.GEOMETRY;
    if ('interaction' in patch) flags |= RepDirtyFlags.PICK_TARGETS;
    if ('metadata' in patch) flags |= RepDirtyFlags.DATA;
    return flags || RepDirtyFlags.FULL_REBUILD;
}
