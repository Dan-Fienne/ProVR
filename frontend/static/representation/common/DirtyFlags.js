export const DirtyFlags = Object.freeze({
    NONE: 0,
    ATOM_POSITION: 1 << 0,
    BOND_GEOMETRY: 1 << 1,
    CHAIN_TRANSFORM: 1 << 2,
    TOPOLOGY: 1 << 3,
    FULL_REBUILD: 1 << 4,
});

export function hasFlag(mask, flag) {
    return (mask & flag) !== 0;
}