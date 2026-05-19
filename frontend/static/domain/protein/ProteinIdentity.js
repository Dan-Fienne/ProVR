function stringValue(value, fallback = '') {
    if (value === null || value === undefined || value === '') return fallback;
    return String(value).trim();
}

function normalizeToken(value, fallback = '') {
    const out = stringValue(value, fallback);
    if (out === '.' || out === '?') return fallback;
    return out;
}

export function normalizeProteinId(value, fallback = 'protein') {
    const raw = normalizeToken(value, fallback);
    return raw.replace(/[^\w.-]+/g, '_') || fallback;
}

export function normalizeChainId(value, fallback = 'A') {
    return normalizeToken(value, fallback) || fallback;
}

export function normalizeResidueName(value, fallback = 'UNK') {
    return normalizeToken(value, fallback).toUpperCase().slice(0, 8) || fallback;
}

export function normalizeAtomName(value, fallback = 'X') {
    return normalizeToken(value, fallback).slice(0, 8) || fallback;
}

export function normalizeElement(value, atomName = '') {
    const raw = normalizeToken(value, '').toUpperCase();
    if (raw) return raw.slice(0, 2);
    const guess = normalizeToken(atomName, 'X').replace(/[^A-Za-z]/g, '').toUpperCase();
    return (guess.slice(0, 2) || 'X');
}

export function residueLabel(seqNum, insCode = '') {
    const seq = Number.isFinite(Number(seqNum)) ? String(Number(seqNum)) : String(seqNum ?? '');
    return `${seq}${normalizeToken(insCode, '')}`;
}

export function residueKey({proteinId = '', chainId, seqNum, insCode = '', name = '', recordType = ''} = {}) {
    return [
        normalizeProteinId(proteinId, 'protein'),
        normalizeChainId(chainId, 'A'),
        residueLabel(seqNum, insCode),
        normalizeResidueName(name, 'UNK'),
        normalizeToken(recordType, ''),
    ].join(':');
}

export function atomKey({atomId = null, serial = null, atomName = '', residueId = '', altLoc = ''} = {}) {
    if (atomId !== null && atomId !== undefined) return atomId;
    if (serial !== null && serial !== undefined) return serial;
    return [residueId, normalizeAtomName(atomName), normalizeToken(altLoc, '')].join(':');
}

export function compareResidueOrder(a, b) {
    const ao = Number.isFinite(Number(a?.order)) ? Number(a.order) : Number(a?.seqNum ?? 0);
    const bo = Number.isFinite(Number(b?.order)) ? Number(b.order) : Number(b?.seqNum ?? 0);
    if (ao !== bo) return ao - bo;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
}
