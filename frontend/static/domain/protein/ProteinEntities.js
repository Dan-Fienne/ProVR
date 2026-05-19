import {RecordType, ResidueKind, SSEType} from './ProteinConstants.js';
import {
    atomKey,
    normalizeAtomName,
    normalizeChainId,
    normalizeElement,
    normalizeResidueName,
    residueKey,
    residueLabel,
} from './ProteinIdentity.js';

function clonePlain(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clonePlain);
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = clonePlain(v);
    return out;
}

export function createChain({
    id = null,
    chainId = null,
    type = 'unknown',
    residueIds = [],
    metadata = {},
} = {}) {
    const cid = normalizeChainId(id ?? chainId, 'A');
    return {
        id: cid,
        chainId: cid,
        type,
        residueIds: [...residueIds],
        metadata: clonePlain(metadata) || {},
    };
}

export function createResidue({
    proteinId,
    id = null,
    chainId,
    seqNum = 0,
    insCode = '',
    name = 'UNK',
    label = null,
    recordType = RecordType.ATOM,
    kind = ResidueKind.UNKNOWN,
    chainType = null,
    atomIds = [],
    order = null,
    sse = SSEType.LOOP,
    isProtein = false,
    isNucleic = false,
    isHeterogen = false,
    isWater = false,
    isUnknown = false,
    metadata = {},
} = {}) {
    const normalizedName = normalizeResidueName(name);
    const normalizedChain = normalizeChainId(chainId);
    const rid = id || residueKey({
        proteinId,
        chainId: normalizedChain,
        seqNum,
        insCode,
        name: normalizedName,
        recordType,
    });
    const lbl = label || residueLabel(seqNum, insCode);

    return {
        id: rid,
        chainId: normalizedChain,
        seqNum,
        insCode: insCode || '',
        name: normalizedName,
        label: lbl,
        recordType,
        kind,
        chainType,
        atomIds: [...atomIds],
        order,
        sse,
        isProtein,
        isNucleic,
        isHeterogen,
        isWater,
        isUnknown,
        metadata: clonePlain(metadata) || {},
    };
}

export function createAtom({
    atomId = null,
    id = null,
    serial = null,
    atomName = null,
    name = null,
    element = '',
    residueId,
    recordType = RecordType.ATOM,
    altLoc = '',
    occupancy = 1.0,
    bFactor = 0.0,
    positionIndex = null,
    metadata = {},
    ...extras
} = {}) {
    const atomNameValue = normalizeAtomName(atomName ?? name, 'X');
    const atomIdValue = id ?? atomId ?? atomKey({atomId, serial, atomName: atomNameValue, residueId, altLoc});

    return {
        ...extras,
        id: atomIdValue,
        atomId: atomIdValue,
        serial: serial ?? atomIdValue,
        name: atomNameValue,
        atomName: atomNameValue,
        element: normalizeElement(element, atomNameValue),
        residueId,
        recordType,
        altLoc: altLoc || '',
        occupancy: Number.isFinite(Number(occupancy)) ? Number(occupancy) : 1.0,
        bFactor: Number.isFinite(Number(bFactor)) ? Number(bFactor) : 0.0,
        positionIndex,
        metadata: clonePlain(metadata) || {},
    };
}

export function cloneChain(chain) { return createChain(clonePlain(chain)); }
export function cloneResidue(residue) { return createResidue(clonePlain(residue)); }
export function cloneAtom(atom) { return createAtom(clonePlain(atom)); }
