import * as THREE from '../../libs/three.webgpu.js';
import {buildResidueIdentity, residueIdentityMatchesRule} from './SurfaceResidueIdentity.js';

function finiteNumber(value, fallback = null) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function lastNumericToken(value) {
    const matches = String(value ?? '').match(/-?\d+/g);
    if (!matches?.length) return null;
    const n = Number(matches[matches.length - 1]);
    return Number.isFinite(n) ? n : null;
}

function numericFromCandidates(candidates = []) {
    for (const value of candidates) {
        const direct = finiteNumber(value, null);
        if (direct !== null) return direct;
        const parsed = lastNumericToken(value);
        if (parsed !== null) return parsed;
    }
    return null;
}

export const SurfaceMeshKind = Object.freeze({
    RANGE_SURFACE: 'range-surface',
    LAYER_SURFACE: 'surface-layer',
});

export const SurfaceColorMode = Object.freeze({
    RANGE: 'range',
    RESIDUE: 'residue',
    ATOM: 'atom',
});

export const DEFAULT_SURFACE_COLORS = Object.freeze([
    0x22d3ee,
    0x4ade80,
    0xf97316,
    0xa78bfa,
    0xfacc15,
    0xfb7185,
]);

export function normalizeColor(value, fallback = 0x22d3ee) {
    if (value instanceof THREE.Color) return value.clone();
    if (typeof value === 'number') return new THREE.Color(value);
    if (typeof value === 'string' && value.trim()) return new THREE.Color(value.trim());
    return new THREE.Color(fallback);
}

export function colorToHexString(value, fallback = 0x22d3ee) {
    return `#${normalizeColor(value, fallback).getHexString()}`;
}

export function colorForRange(range, index = 0) {
    const fallback = DEFAULT_SURFACE_COLORS[index % DEFAULT_SURFACE_COLORS.length];
    return normalizeColor(range?.color, fallback);
}

export function residueChainId(residue = null, atom = null) {
    return String(
        residue?.chainId ?? residue?.chain ?? residue?.chainName ??
        atom?.chainId ?? atom?.chain ?? atom?.chainName ?? ''
    );
}

export function atomChainId(atom = null) {
    return String(atom?.chainId ?? atom?.chain ?? atom?.chainName ?? '');
}

export function residueComparableValue(residue = null, atom = null) {
    return numericFromCandidates([
        residue?.seqNum,
        residue?.sequenceNumber,
        residue?.resSeq,
        residue?.resid,
        residue?.resId,
        residue?.number,
        residue?.labelSeqId,
        residue?.authSeqId,
        residue?.pdbSeqNum,
        residue?.order,
        atom?.resSeq,
        atom?.resi,
        atom?.resId,
        atom?.residueSeq,
        atom?.residueNumber,
        residue?.label,
        residue?.id,
    ]);
}

export function residueDisplayNumber(residue = null, atom = null) {
    const n = residueComparableValue(residue, atom);
    return n === null ? String(residue?.label ?? residue?.id ?? atom?.resId ?? '') : String(n);
}

export function residueKeyFromParts(chainId, residueNumber, residueId = null) {
    const chain = String(chainId ?? '').trim() || '_';
    const number = residueNumber === null || residueNumber === undefined || residueNumber === ''
        ? String(residueId ?? '')
        : String(residueNumber);
    return `${chain}:${number}`;
}

export function residueKey(residue = null, atom = null) {
    return residueKeyFromParts(residueChainId(residue, atom), residueComparableValue(residue, atom), residue?.id ?? atom?.residueId ?? null);
}

function rangeStart(rule) {
    return finiteNumber(rule?.startSeq ?? rule?.start ?? rule?.from ?? rule?.residueStart ?? rule?.residue ?? rule?.seqNum ?? rule?.seq ?? rule?.resSeq ?? rule?.resi, null);
}

function rangeEnd(rule) {
    return finiteNumber(rule?.endSeq ?? rule?.end ?? rule?.to ?? rule?.residueEnd ?? rule?.residue ?? rule?.seqNum ?? rule?.seq ?? rule?.resSeq ?? rule?.resi, null);
}

function normalizeResidueIdList(value) {
    if (!Array.isArray(value)) return null;
    return value.map((v) => String(v)).filter(Boolean);
}

export function normalizeResidueColorRules(rules = []) {
    const explicit = Array.isArray(rules) ? rules.filter(Boolean) : [];
    return explicit.map((rule, index) => {
        const color = rule?.color ?? rule?.hex ?? rule?.value;
        if (!color) return null;
        const start = rangeStart(rule);
        const end = rangeEnd(rule);
        const residueIds = normalizeResidueIdList(rule?.residueIds ?? rule?.residues ?? null);
        return {
            id: rule.id || rule.name || `residue_color_rule_${index + 1}`,
            name: rule.name || rule.label || rule.id || `Residue color rule ${index + 1}`,
            chainId: rule.chainId ?? rule.chain ?? null,
            start,
            end,
            residueIds,
            color: normalizeColor(color),
            rawColor: typeof color === 'string' ? color : colorToHexString(color),
            metadata: {...(rule.metadata || {})},
            raw: rule,
        };
    }).filter(Boolean);
}

export function residueLikeMatchesColorRule(residueLike, rule) {
    if (!residueLike || !rule) return false;
    const identity = residueLike.chainCandidates || residueLike.residueNumberCandidates
        ? residueLike
        : buildResidueIdentity(residueLike.rawResidue || residueLike.residue || null, residueLike.rawAtom || residueLike.atom || residueLike);
    return residueIdentityMatchesRule(identity, rule);
}


export function matchingResidueColorRuleForOwner(owner, rules = []) {
    const normalized = normalizeResidueColorRules(rules);
    for (let i = normalized.length - 1; i >= 0; i -= 1) {
        if (residueLikeMatchesColorRule(owner, normalized[i])) return normalized[i];
    }
    return null;
}

export function countResidueColorRules(rulesOrRange = []) {
    const rules = Array.isArray(rulesOrRange)
        ? rulesOrRange
        : [
            ...(Array.isArray(rulesOrRange?.residueColorRules) ? rulesOrRange.residueColorRules : []),
            ...(Array.isArray(rulesOrRange?.colorRules) ? rulesOrRange.colorRules : []),
        ];
    return normalizeResidueColorRules(rules).length;
}

export function resolveSurfaceStyle(style = {}) {
    const requestedMode = style.colorMode || SurfaceColorMode.RANGE;
    const colorMode = Object.values(SurfaceColorMode).includes(requestedMode) ? requestedMode : SurfaceColorMode.RANGE;
    return {
        colorMode,
        opacity: clamp(finiteNumber(style.opacity, 0.46), 0.02, 1.0),
        roughness: clamp(finiteNumber(style.roughness, 0.42), 0, 1),
        metalness: clamp(finiteNumber(style.metalness, 0.0), 0, 1),
        side: style.side || 'double',
        wireframe: !!style.wireframe,

        contactThreshold: Math.max(0, finiteNumber(style.contactThreshold, 1.2)),
        clashThreshold: Math.max(0, finiteNumber(style.clashThreshold, 0.35)),
        maxContactSamplesPerLayer: Math.max(80, Math.floor(finiteNumber(style.maxContactSamplesPerLayer, 1000))),

        probeRadius: Math.max(0, finiteNumber(style.probeRadius, 1.40)),
        gridSpacing: Math.max(0.35, finiteNumber(style.gridSpacing, 0.80)),
        surfaceRadiusScale: Math.max(0.2, finiteNumber(style.surfaceRadiusScale, 1.0)),
        bboxPadding: Math.max(1.5, finiteNumber(style.bboxPadding, 2.4)),
        maxGridPoints: Math.max(10000, Math.floor(finiteNumber(style.maxGridPoints, 220000))),
        maxAtomsPerRange: Math.max(1, Math.floor(finiteNumber(style.maxAtomsPerRange, 2400))),
        minRangeResidues: Math.max(1, Math.floor(finiteNumber(style.minRangeResidues, 1))),
        livePreview: style.livePreview ?? true,

        // A single committed rendering policy for ProVR Surface v5.
        // Geometry generation, vertex ownership, coloring and picking are kept
        // separate so surface remains a residue-owned design target.
        ownershipPolicy: 'surface-layer-atom-residue-ownership-with-rigid-transform'
        , rebuildOnRigidTransform: style.rebuildOnRigidTransform === true,
    };
}

export function materialSideFromStyle(style) {
    if (style.side === 'front') return THREE.FrontSide;
    if (style.side === 'back') return THREE.BackSide;
    return THREE.DoubleSide;
}
