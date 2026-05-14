import * as THREE from '../../libs/three.module.js';
import {
    SurfaceColorMode,
    colorForRange,
    matchingResidueColorRuleForOwner,
    normalizeResidueColorRules,
} from './SurfaceStyle.js';

function pushColor(colors, color) {
    colors.push(color.r, color.g, color.b);
}

function ownerFromAtom(atom) {
    if (!atom) return null;
    return {
        atomId: atom.atomId,
        residueId: atom.residueId,
        residueIdCandidates: atom.residueIdCandidates || [],
        residueKey: atom.residueKey,
        residueKeyCandidates: atom.residueKeyCandidates || [],
        residueNumber: atom.residueNumber,
        residueNumberCandidates: atom.residueNumberCandidates || [],
        displayNumber: atom.displayNumber,
        chainId: atom.chainId,
        chainCandidates: atom.chainIdCandidates || [],
        rawAtom: atom.rawAtom || null,
        rawResidue: atom.rawResidue || null,
    };
}

function incrementMap(map, key, amount = 1) {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + amount);
}

function hashString(value) {
    const text = String(value ?? 'unknown');
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function residuePaletteColor(owner, fallbackColor) {
    const key = owner?.residueKey || owner?.residueId || `${owner?.chainId || ''}:${owner?.residueNumber ?? ''}`;
    if (!key || key === ':') return fallbackColor.clone();
    const hue = (hashString(key) % 360) / 360;
    const color = new THREE.Color();
    color.setHSL(hue, 0.62, 0.56);
    return color;
}

function makeRuleHit(rule) {
    return {
        id: rule.id,
        name: rule.name,
        chainId: rule.chainId,
        start: rule.start,
        end: rule.end,
        color: rule.rawColor,
        matchedResidueKeys: new Set(),
        matchedResidueIds: new Set(),
        matchedAtomIds: new Set(),
        matchedVertexCount: 0,
    };
}

function addRuleHit(hit, owner) {
    if (!hit || !owner) return;
    hit.matchedVertexCount += 1;
    if (owner.residueKey) hit.matchedResidueKeys.add(owner.residueKey);
    for (const key of owner.residueKeyCandidates || []) if (key) hit.matchedResidueKeys.add(String(key));
    if (owner.residueId) hit.matchedResidueIds.add(owner.residueId);
    for (const id of owner.residueIdCandidates || []) if (id) hit.matchedResidueIds.add(String(id));
    if (owner.atomId !== null && owner.atomId !== undefined) hit.matchedAtomIds.add(owner.atomId);
}

export function buildSurfaceVertexColors({range, rangeIndex, style, atomSet, ownership}) {
    const rules = normalizeResidueColorRules([
        ...(Array.isArray(range?.residueColorRules) ? range.residueColorRules : []),
        ...(Array.isArray(range?.colorRules) ? range.colorRules : []),
    ]);
    const useVertexColors = style.colorMode === SurfaceColorMode.ATOM || style.colorMode === SurfaceColorMode.RESIDUE || rules.length > 0;
    const fixedColor = colorForRange(range, rangeIndex);
    const colors = [];
    const vertexColorRuleIds = [];
    const ruleHits = new Map(rules.map((rule) => [rule.id, makeRuleHit(rule)]));
    const residueVertexColorCounts = new Map();
    const vertexCount = ownership.vertexAtomIds.length;
    let residuePaletteVertices = 0;
    let atomColoredVertices = 0;

    for (let i = 0; i < vertexCount; i += 1) {
        const atom = ownership.atomById.get(ownership.vertexAtomIds[i]);
        const owner = ownerFromAtom(atom) || {
            residueId: ownership.vertexResidueIds[i],
            residueIdCandidates: ownership.vertexResidueIdCandidates?.[i] || [],
            residueKey: ownership.vertexResidueKeys[i],
            residueKeyCandidates: ownership.vertexResidueKeyCandidates?.[i] || [],
            residueNumber: ownership.vertexResidueNumbers[i],
            residueNumberCandidates: ownership.vertexResidueNumberCandidates?.[i] || [],
            chainId: ownership.vertexChainIds[i],
            chainCandidates: ownership.vertexChainIdCandidates?.[i] || [],
        };
        const matchedRule = matchingResidueColorRuleForOwner(owner, rules);
        let color = fixedColor;
        let ruleId = null;

        if (matchedRule) {
            color = matchedRule.color;
            ruleId = matchedRule.id;
            addRuleHit(ruleHits.get(matchedRule.id), owner);
        } else if (style.colorMode === SurfaceColorMode.ATOM && atom?.atomColor) {
            color = atom.atomColor;
            atomColoredVertices += 1;
        } else if (style.colorMode === SurfaceColorMode.RESIDUE) {
            color = residuePaletteColor(owner, fixedColor);
            residuePaletteVertices += 1;
        }

        pushColor(colors, color);
        vertexColorRuleIds.push(ruleId);
        incrementMap(residueVertexColorCounts, owner.residueKey);
    }

    const hitList = [...ruleHits.values()].map((hit) => ({
        ...hit,
        matchedResidueKeys: [...hit.matchedResidueKeys],
        matchedResidueIds: [...hit.matchedResidueIds],
        matchedAtomIds: [...hit.matchedAtomIds],
        matchedResidueCount: hit.matchedResidueKeys.size || hit.matchedResidueIds.size,
        matchedAtomCount: hit.matchedAtomIds.size,
    }));

    const ruleColoredVertices = vertexColorRuleIds.filter(Boolean).length;

    return {
        colors,
        useVertexColors,
        vertexColorRuleIds,
        fixedColor,
        stats: {
            colorMode: style.colorMode,
            ruleCount: rules.length,
            matchedRuleCount: hitList.filter((hit) => hit.matchedVertexCount > 0).length,
            matchedResidueCount: new Set(hitList.flatMap((hit) => hit.matchedResidueKeys)).size,
            matchedAtomCount: new Set(hitList.flatMap((hit) => hit.matchedAtomIds)).size,
            coloredVertices: ruleColoredVertices,
            ruleColoredVertices,
            residuePaletteVertices,
            atomColoredVertices,
            effectiveVertexColors: useVertexColors ? vertexCount : 0,
            colorRuleVertexCounts: Object.fromEntries(hitList.map((hit) => [hit.id, hit.matchedVertexCount])),
            residueVertexColorCounts: Object.fromEntries(residueVertexColorCounts),
            hits: hitList,
        },
    };
}
