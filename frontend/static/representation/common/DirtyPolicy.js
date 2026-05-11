export const RepDirtyFlags = Object.freeze({
    NONE: 0,
    VISIBILITY: 1 << 0,
    STYLE: 1 << 1,
    FILTER: 1 << 2,
    GEOMETRY: 1 << 3,
    PICK_TARGETS: 1 << 4,
    FULL_REBUILD: 1 << 5,
});

export function hasDirtyFlag(mask, flag) {
    return (mask & flag) !== 0;
}

export function dirtyFlagsToNames(mask) {
    const out = [];
    for (const [name, value] of Object.entries(RepDirtyFlags)) {
        if (value !== 0 && hasDirtyFlag(mask, value)) out.push(name);
    }
    return out;
}
