const DEFAULT_COLOR = 0x9ca3af;
const DEFAULT_BALLSTICK_RADIUS = 0.22;
const DEFAULT_VDW_RADIUS = 1.50;

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
    NA: 0xab5cf2,
    K: 0x8f40d4,
    X: DEFAULT_COLOR,
});

const BALLSTICK_RADII = Object.freeze({
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
    NA: 0.30,
    K: 0.34,
    X: DEFAULT_BALLSTICK_RADIUS,
});

const VDW_RADII = Object.freeze({
    H: 1.20,
    C: 1.70,
    N: 1.55,
    O: 1.52,
    S: 1.80,
    P: 1.80,
    F: 1.47,
    CL: 1.75,
    BR: 1.85,
    I: 1.98,
    FE: 1.80,
    MG: 1.73,
    CA: 2.31,
    ZN: 1.39,
    CU: 1.40,
    MN: 1.73,
    NA: 2.27,
    K: 2.75,
    X: DEFAULT_VDW_RADIUS,
});

function lettersOnly(value = '') {
    return String(value || '').replace(/[^a-zA-Z]/g, '').trim().toUpperCase();
}

export function normalizeElement(element = '') {
    const raw = lettersOnly(element);
    if (!raw) return 'X';
    if (ELEMENT_COLORS[raw]) return raw;

    if (raw.length >= 2) {
        const two = raw.slice(0, 2);
        if (ELEMENT_COLORS[two]) return two;
    }

    if (ELEMENT_COLORS[raw[0]]) return raw[0];
    return 'X';
}

export function getElementColor(element) {
    return ELEMENT_COLORS[normalizeElement(element)] ?? DEFAULT_COLOR;
}

export function getBallStickRadius(element) {
    return BALLSTICK_RADII[normalizeElement(element)] ?? DEFAULT_BALLSTICK_RADIUS;
}

export function getVdwRadius(element) {
    return VDW_RADII[normalizeElement(element)] ?? DEFAULT_VDW_RADIUS;
}
