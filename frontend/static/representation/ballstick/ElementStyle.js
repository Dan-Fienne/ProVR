const DEFAULT_COLOR = 0x9ca3af;
const DEFAULT_RADIUS = 0.22;

const ELEMENT_COLORS = Object.freeze({
    H: 0xffffff,
    C: 0x909090,
    N: 0x3050f8,
    O: 0xff0d0d,
    S: 0xffff30,
    P: 0xff8000,
    F: 0x50f850,
    CL: 0x1ff01f,
    BR: 0xa62929,
    I: 0x940094,
    FE: 0xe06633,
    MG: 0x8aff00,
    CA: 0x3dff00,
    ZN: 0x7d80b0,
    CU: 0xc88033,
    MN: 0x9c7ac7,
});

const ELEMENT_RADII = Object.freeze({
    H: 0.14,
    C: 0.22,
    N: 0.21,
    O: 0.20,
    S: 0.28,
    P: 0.28,
    F: 0.20,
    CL: 0.26,
    BR: 0.30,
    I: 0.34,
    FE: 0.29,
    MG: 0.30,
    CA: 0.30,
    ZN: 0.30,
    CU: 0.30,
    MN: 0.30,
});

function normalizeElement(element='') {
    const e = String(element).trim().toUpperCase();
    if (!e) return 'X';
    if (e.length === 1) return e;
    if (e.length >= 2) {
        const two = e.slice(0, 2);
        if (ELEMENT_COLORS[two] || ELEMENT_RADII[two]) return two;
        return e[0];
    }
    return e[0];
}

export function getElementColor(element) {
    const key = normalizeElement(element);
    return ELEMENT_COLORS[key] ?? DEFAULT_COLOR;
}

export function getElementRadius(element) {
    const key = normalizeElement(element);
    return ELEMENT_RADII[key] ?? DEFAULT_RADIUS;
}