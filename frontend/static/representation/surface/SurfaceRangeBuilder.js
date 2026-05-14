import * as THREE from '../../libs/three.webgpu.js';
import {createStructureFilter} from '../../domain/protein/StructureFilter.js';
import {
    SurfaceColorMode,
    atomChainId,
    colorForRange,
    normalizeColor,
    residueChainId,
    residueComparableValue,
    residueDisplayNumber,
    residueKey,
} from './SurfaceStyle.js';
import {buildResidueIdentity, canonicalResidueKey, firstResidueNumber, residueIdentityMatchesRange} from './SurfaceResidueIdentity.js';

const ELEMENT_RADII = Object.freeze({
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
    ZN: 1.39,
    CA: 1.94,
});

function finiteNumber(value, fallback = null) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function arrayOfStrings(value) {
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
    if (value === null || value === undefined || value === '') return [];
    return String(value).split(/[|;\s]+/).map((v) => v.trim()).filter(Boolean);
}

function arrayOfResidueIds(value) {
    if (!Array.isArray(value)) return null;
    return value.map((v) => String(v)).filter(Boolean);
}

function atomElement(atom) {
    const raw = String(atom?.element || atom?.elem || atom?.type || atom?.name || 'C').trim().toUpperCase();
    if (!raw) return 'C';
    if (raw.length >= 2 && ELEMENT_RADII[raw.slice(0, 2)]) return raw.slice(0, 2);
    return raw[0];
}

function atomRadius(atom, style) {
    const element = atomElement(atom);
    const base = ELEMENT_RADII[element] || 1.70;
    return base * style.surfaceRadiusScale + style.probeRadius;
}

function atomDisplayColor(atom, fallbackColor) {
    if (atom?.color instanceof THREE.Color) return atom.color.clone();
    if (typeof atom?.color === 'number' || typeof atom?.color === 'string') return normalizeColor(atom.color, fallbackColor.getHex());

    switch (atomElement(atom)) {
        case 'O': return new THREE.Color(0xef4444);
        case 'N': return new THREE.Color(0x3b82f6);
        case 'S': return new THREE.Color(0xfacc15);
        case 'P': return new THREE.Color(0xf97316);
        case 'H': return new THREE.Color(0xe5e7eb);
        default: return fallbackColor.clone();
    }
}

function rangeStart(range) {
    return finiteNumber(range?.startSeq ?? range?.start ?? range?.from ?? range?.residueStart ?? range?.residue ?? range?.seqNum ?? range?.seq ?? range?.resSeq ?? range?.resi, null);
}

function rangeEnd(range) {
    return finiteNumber(range?.endSeq ?? range?.end ?? range?.to ?? range?.residueEnd ?? range?.residue ?? range?.seqNum ?? range?.seq ?? range?.resSeq ?? range?.resi, null);
}

function sortedChainResidues(model, chain) {
    return (chain?.residueIds || [])
        .map((id) => model.residues?.get?.(id))
        .filter(Boolean)
        .sort((a, b) => {
            const ao = finiteNumber(a.order, finiteNumber(a.seqNum, 0));
            const bo = finiteNumber(b.order, finiteNumber(b.seqNum, 0));
            if (ao !== bo) return ao - bo;
            return String(a.id).localeCompare(String(b.id));
        });
}

function allResidues(model, filterOptions) {
    const filter = createStructureFilter(filterOptions || {});
    const residues = [];
    for (const [, chain] of model.chains?.entries?.() || []) {
        for (const residue of sortedChainResidues(model, chain)) {
            if (!filter.acceptResidue(residue)) continue;
            residues.push(residue);
        }
    }
    return residues;
}

function residuesFromAtomIds(model, atomIds = []) {
    const seen = new Set();
    const residues = [];
    for (const atomId of atomIds) {
        const atom = model.getAtom?.(atomId) || model.atoms?.get?.(atomId);
        const residueId = atom?.residueId || atom?.residue?.id;
        const residue = residueId ? model.residues?.get?.(residueId) : null;
        if (!residue || seen.has(residue.id)) continue;
        seen.add(residue.id);
        residues.push(residue);
    }
    return residues;
}

function residuesFromResidueIds(model, residueIds = []) {
    const residues = [];
    const seen = new Set();
    for (const residueId of residueIds) {
        const residue = model.residues?.get?.(residueId);
        if (!residue || seen.has(residue.id)) continue;
        seen.add(residue.id);
        residues.push(residue);
    }
    return residues;
}

function chainIdsFromLayer(layer = {}) {
    const ids = [
        ...arrayOfStrings(layer.chainIds),
        ...arrayOfStrings(layer.chains),
        ...arrayOfStrings(layer.chainId),
        ...arrayOfStrings(layer.chain),
    ];
    return [...new Set(ids)];
}

function layerScope(layer = {}) {
    const raw = String(layer.scope || layer.type || layer.selection || layer.mode || '').trim().toLowerCase();
    if (['model', 'all', 'full', 'whole', 'wholemodel', 'protein', 'complex', 'allchains'].includes(raw)) return 'model';
    if (['chain', 'chains', 'multichain', 'multi-chain'].includes(raw)) return 'chains';
    if (['range', 'residuerange', 'residue-range', 'ranges'].includes(raw)) return 'range';
    if (Array.isArray(layer.atomIds) && layer.atomIds.length) return 'atomIds';
    if (Array.isArray(layer.residueIds) && layer.residueIds.length) return 'residueIds';
    if (Array.isArray(layer.ranges) && layer.ranges.length) return 'ranges';
    if (chainIdsFromLayer(layer).length && rangeStart(layer) === null && rangeEnd(layer) === null) return 'chains';
    if (rangeStart(layer) !== null || rangeEnd(layer) !== null) return 'range';
    return 'model';
}

function rangeLikeForLayer(layer, chainId = null) {
    return {
        ...layer,
        chainId: chainId ?? layer.chainId ?? layer.chain ?? null,
        start: rangeStart(layer),
        end: rangeEnd(layer),
    };
}

function residuePassesSingleRange(model, residue, range) {
    const atomIds = Array.isArray(residue?.atomIds) ? residue.atomIds : [];

    // First try every atom-side identity. User-facing residue numbers are often
    // parsed on atoms while residue objects only keep internal indices.
    for (const atomId of atomIds) {
        const atom = model.getAtom?.(atomId) || model.atoms?.get?.(atomId);
        if (!atom) continue;
        if (residueIdentityMatchesRange(buildResidueIdentity(residue, atom), range)) return true;
    }

    return residueIdentityMatchesRange(buildResidueIdentity(residue, null), range);
}

function residuePassesLayer(model, residue, layer) {
    const scope = layerScope(layer);
    if (scope === 'model') return true;

    const chainIds = chainIdsFromLayer(layer);
    if (scope === 'chains') {
        if (!chainIds.length) return true;
        return chainIds.includes(residueChainId(residue));
    }

    if (scope === 'range') {
        if (chainIds.length) return chainIds.some((chainId) => residuePassesSingleRange(model, residue, rangeLikeForLayer(layer, chainId)));
        return residuePassesSingleRange(model, residue, rangeLikeForLayer(layer));
    }

    if (scope === 'ranges') {
        return (layer.ranges || []).some((subRange) => {
            const ids = chainIdsFromLayer(subRange);
            if (ids.length) return ids.some((chainId) => residuePassesSingleRange(model, residue, rangeLikeForLayer(subRange, chainId)));
            return residuePassesSingleRange(model, residue, rangeLikeForLayer(subRange));
        });
    }

    return false;
}

function normalizeSingleLayer(layer, index, source = 'layers') {
    const scope = layerScope(layer);
    const chainIds = chainIdsFromLayer(layer);
    const start = rangeStart(layer);
    const end = rangeEnd(layer);
    const id = layer.id || layer.name || layer.label || `surface_layer_${index + 1}`;
    const role = layer.role || layer.kind || (scope === 'model' ? 'context' : 'focus');
    return {
        id,
        name: layer.name || layer.label || id,
        scope,
        role,
        chainId: chainIds.length === 1 ? chainIds[0] : (layer.chainId ?? layer.chain ?? null),
        chainIds,
        start,
        end,
        ranges: Array.isArray(layer.ranges) ? layer.ranges.map((r) => ({...r, start: rangeStart(r), end: rangeEnd(r), chainIds: chainIdsFromLayer(r)})) : null,
        residueIds: arrayOfResidueIds(layer.residueIds ?? layer.residues ?? null),
        atomIds: Array.isArray(layer.atomIds) ? [...layer.atomIds] : null,
        color: layer.color,
        opacity: layer.opacity,
        colorMode: layer.colorMode || layer.surfaceColorMode || null,
        visible: layer.visible !== false,
        pickable: layer.pickable,
        editable: layer.editable,
        residueColorRules: Array.isArray(layer.residueColorRules) ? [...layer.residueColorRules] : (Array.isArray(layer.colorRules) ? [...layer.colorRules] : []),
        metadata: {source, ...(layer.metadata || {})},
        raw: layer,
    };
}

function normalizeRangeAsLayer(range, index, source = 'ranges') {
    return normalizeSingleLayer({
        ...range,
        scope: 'range',
        role: range.role || 'focus',
    }, index, source);
}

export function normalizeSurfaceLayers(model, spec = {}, {filter = {}} = {}) {
    const explicitLayers = Array.isArray(spec.layers) ? spec.layers.filter(Boolean) : [];
    if (explicitLayers.length) return explicitLayers.map((layer, index) => normalizeSingleLayer(layer, index, 'layers'));

    const explicitSurfaces = Array.isArray(spec.surfaces) ? spec.surfaces.filter(Boolean) : [];
    if (explicitSurfaces.length) return explicitSurfaces.map((layer, index) => normalizeSingleLayer(layer, index, 'surfaces'));

    const explicitRanges = Array.isArray(spec.ranges || spec.selections) ? (spec.ranges || spec.selections).filter(Boolean) : [];
    if (explicitRanges.length) return explicitRanges.map((range, index) => normalizeRangeAsLayer(range, index, 'ranges'));

    if (!model) return [];
    return [{
        id: 'surface_full_model',
        name: 'Full model surface',
        scope: 'model',
        role: 'context',
        chainId: null,
        chainIds: [],
        start: null,
        end: null,
        ranges: null,
        residueIds: null,
        atomIds: null,
        color: undefined,
        opacity: undefined,
        colorMode: null,
        visible: true,
        pickable: false,
        editable: false,
        residueColorRules: [],
        metadata: {fallbackWholeModel: true, source: 'fallback'},
        raw: {},
    }];
}

// Backward-compatible name used by earlier validation patches.
export function normalizeSurfaceRanges(model, ranges = [], opts = {}) {
    return normalizeSurfaceLayers(model, {ranges}, opts);
}

export function selectResiduesForSurfaceLayer(model, layer, {filter = {}} = {}) {
    if (!model) return [];
    if (Array.isArray(layer?.atomIds) && layer.atomIds.length) return residuesFromAtomIds(model, layer.atomIds);
    if (Array.isArray(layer?.residueIds) && layer.residueIds.length) return residuesFromResidueIds(model, layer.residueIds);
    return allResidues(model, filter).filter((residue) => residuePassesLayer(model, residue, layer));
}

// Backward-compatible name.
export function selectResiduesForSurfaceRange(model, range, opts = {}) {
    return selectResiduesForSurfaceLayer(model, range, opts);
}

export function buildSurfaceAtomSet(model, residues, layer, style, layerIndex = 0) {
    const atomIds = [];
    const residueIds = [];
    const residueKeys = [];
    const atoms = [];
    const atomById = new Map();
    const residueById = new Map();
    const residueByKey = new Map();
    const fixedColor = colorForRange(layer, layerIndex);
    const allowedAtomIds = Array.isArray(layer?.atomIds) && layer.atomIds.length ? new Set(layer.atomIds) : null;

    for (const residue of residues || []) {
        if (!residue?.atomIds?.length) continue;
        const rKey = canonicalResidueKey(buildResidueIdentity(residue, null)) || residueKey(residue);
        residueById.set(residue.id, residue);
        residueByKey.set(rKey, residue);
        residueIds.push(residue.id);
        residueKeys.push(rKey);

        for (const atomId of residue.atomIds) {
            if (allowedAtomIds && !allowedAtomIds.has(atomId)) continue;
            if (atomById.has(atomId)) continue;

            const atom = model.getAtom?.(atomId) || model.atoms?.get?.(atomId);
            const p = model.getAtomPosition?.(atomId);
            if (!atom || !p) continue;

            const element = atomElement(atom);
            const identity = buildResidueIdentity(residue, atom);
            const chainId = identity.chainId || residueChainId(residue, atom) || atomChainId(atom) || layer.chainId || '';
            const residueNumber = firstResidueNumber(identity);
            const displayNumber = identity.displayNumber || residueDisplayNumber(residue, atom);
            const rKeyForAtom = canonicalResidueKey(identity) || residueKey(residue, atom);
            const atomColor = style.colorMode === SurfaceColorMode.ATOM ? atomDisplayColor(atom, fixedColor) : fixedColor.clone();
            const entry = {
                id: String(atom.id ?? atomId),
                atomId,
                residueId: residue.id,
                residueKey: rKeyForAtom,
                residueNumber,
                residueNumberCandidates: identity.residueNumberCandidates,
                residueIdCandidates: identity.residueIdCandidates,
                residueKeyCandidates: identity.residueKeyCandidates,
                chainIdCandidates: identity.chainCandidates,
                displayNumber,
                chainId,
                coord: {x: Number(p[0]), y: Number(p[1]), z: Number(p[2])},
                position: [Number(p[0]), Number(p[1]), Number(p[2])],
                name: atom.name || element,
                elem: element,
                element,
                serial: String(atom.id ?? atomId),
                resn: residue.name || atom.resName || '',
                resi: displayNumber,
                radius: atomRadius(atom, style),
                baseRadius: atomRadius(atom, {...style, probeRadius: 0}),
                atomColor,
                rangeColor: fixedColor.clone(),
                rawAtom: atom,
                rawResidue: residue,
            };
            atomById.set(atomId, entry);
            atoms.push(entry);
            atomIds.push(atomId);
        }
    }

    return {
        atoms,
        atomIds,
        residueIds: [...new Set(residueIds)],
        residueKeys: [...new Set(residueKeys)],
        atomById,
        residueById,
        residueByKey,
        fixedColor,
    };
}

export function boundingBoxForSurfaceAtoms(atoms, style) {
    const min = {x: Infinity, y: Infinity, z: Infinity};
    const max = {x: -Infinity, y: -Infinity, z: -Infinity};

    for (const atom of atoms || []) {
        const r = (atom.radius || 1.7) + style.bboxPadding;
        min.x = Math.min(min.x, atom.coord.x - r);
        min.y = Math.min(min.y, atom.coord.y - r);
        min.z = Math.min(min.z, atom.coord.z - r);
        max.x = Math.max(max.x, atom.coord.x + r);
        max.y = Math.max(max.y, atom.coord.y + r);
        max.z = Math.max(max.z, atom.coord.z + r);
    }

    if (!Number.isFinite(min.x)) {
        min.x = min.y = min.z = -1;
        max.x = max.y = max.z = 1;
    }
    return {min, max};
}
