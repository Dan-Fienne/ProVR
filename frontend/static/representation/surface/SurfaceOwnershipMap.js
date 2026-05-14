import {residueKeyFromParts} from './SurfaceStyle.js';

function unique(list = []) {
    return [...new Set(list.filter((v) => v !== null && v !== undefined && v !== ''))];
}

export function buildSurfaceOwnershipMap({atomSet, meshData}) {
    const atomById = atomSet.atomById || new Map(atomSet.atoms.map((atom) => [atom.atomId, atom]));
    const residueById = atomSet.residueById || new Map();
    const residueByKey = atomSet.residueByKey || new Map();

    const vertexAtomIds = [];
    const vertexResidueIds = [];
    const vertexResidueKeys = [];
    const vertexResidueNumbers = [];
    const vertexResidueNumberCandidates = [];
    const vertexResidueIdCandidates = [];
    const vertexResidueKeyCandidates = [];
    const vertexChainIds = [];
    const vertexChainIdCandidates = [];
    const vertexOwnerKnown = [];
    const residueVertexCounts = new Map();
    const residueAtomIdsWithSurfaceVertices = new Map();
    const ruleVertexCounts = new Map();
    let ownedVertexCount = 0;

    const sourceAtomIds = meshData.vertexAtomIds || meshData.atomIds || [];
    const sourceRuleIds = meshData.vertexColorRuleIds || meshData.colorRuleIds || [];
    const vertexCount = Math.floor((meshData.positions || []).length / 3);

    for (let i = 0; i < vertexCount; i += 1) {
        const atomId = sourceAtomIds[i] ?? null;
        const atom = atomId !== null ? atomById.get(atomId) : null;
        const residueId = atom?.residueId ?? meshData.vertexResidueIds?.[i] ?? meshData.residueIds?.[i] ?? null;
        const chainId = atom?.chainId ?? meshData.vertexChainIds?.[i] ?? null;
        const residueNumber = atom?.residueNumber ?? meshData.vertexResidueNumbers?.[i] ?? null;
        const residueNumberCandidateList = atom?.residueNumberCandidates ?? meshData.vertexResidueNumberCandidates?.[i] ?? (residueNumber === null ? [] : [residueNumber]);
        const residueIdCandidateList = atom?.residueIdCandidates ?? meshData.vertexResidueIdCandidates?.[i] ?? (residueId === null ? [] : [residueId]);
        const residueKeyCandidateList = atom?.residueKeyCandidates ?? meshData.vertexResidueKeyCandidates?.[i] ?? [];
        const chainIdCandidateList = atom?.chainIdCandidates ?? meshData.vertexChainIdCandidates?.[i] ?? (chainId === null ? [] : [chainId]);
        const residueKey = atom?.residueKey ?? meshData.vertexResidueKeys?.[i] ?? residueKeyCandidateList[0] ?? residueKeyFromParts(chainId, residueNumber, residueId);
        const known = !!atom;

        vertexAtomIds.push(atomId);
        vertexResidueIds.push(residueId);
        vertexResidueKeys.push(residueKey);
        vertexResidueNumbers.push(residueNumber);
        vertexResidueNumberCandidates.push(residueNumberCandidateList);
        vertexResidueIdCandidates.push(residueIdCandidateList);
        vertexResidueKeyCandidates.push(residueKeyCandidateList);
        vertexChainIds.push(chainId);
        vertexChainIdCandidates.push(chainIdCandidateList);
        vertexOwnerKnown.push(known);

        if (known) ownedVertexCount += 1;
        if (residueKey) {
            residueVertexCounts.set(residueKey, (residueVertexCounts.get(residueKey) || 0) + 1);
            if (!residueAtomIdsWithSurfaceVertices.has(residueKey)) residueAtomIdsWithSurfaceVertices.set(residueKey, new Set());
            if (atomId !== null) residueAtomIdsWithSurfaceVertices.get(residueKey).add(atomId);
        }

        const ruleId = sourceRuleIds[i];
        if (ruleId) ruleVertexCounts.set(ruleId, (ruleVertexCounts.get(ruleId) || 0) + 1);
    }

    const selectedResidueKeys = unique(atomSet.atoms.map((atom) => atom.residueKey));
    const visibleResidueKeys = [...residueVertexCounts.keys()];
    const visibleResidueSet = new Set(visibleResidueKeys);
    const selectedResiduesWithoutSurfaceVertices = selectedResidueKeys.filter((key) => !visibleResidueSet.has(key));

    return {
        atomById,
        residueById,
        residueByKey,
        selectedAtomIds: [...atomSet.atomIds],
        selectedResidueIds: [...atomSet.residueIds],
        selectedResidueKeys,
        vertexAtomIds,
        vertexResidueIds,
        vertexResidueKeys,
        vertexResidueNumbers,
        vertexResidueNumberCandidates,
        vertexResidueIdCandidates,
        vertexResidueKeyCandidates,
        vertexChainIds,
        vertexChainIdCandidates,
        vertexOwnerKnown,
        residueVertexCounts: Object.fromEntries(residueVertexCounts),
        residueAtomIdsWithSurfaceVertices: Object.fromEntries([...residueAtomIdsWithSurfaceVertices.entries()].map(([key, set]) => [key, [...set]])),
        colorRuleVertexCounts: Object.fromEntries(ruleVertexCounts),
        stats: {
            vertexCount,
            ownedVertexCount,
            unownedVertexCount: vertexCount - ownedVertexCount,
            selectedResidueCount: atomSet.residueIds.length,
            selectedAtomCount: atomSet.atomIds.length,
            visibleResidueCount: visibleResidueKeys.length,
            hiddenSelectedResidueCount: selectedResiduesWithoutSurfaceVertices.length,
            selectedResiduesWithoutSurfaceVertices,
        },
    };
}

export function ownershipSummaryForUserData(ownership) {
    return {
        selectedAtomIds: ownership.selectedAtomIds,
        selectedResidueIds: ownership.selectedResidueIds,
        selectedResidueKeys: ownership.selectedResidueKeys,
        vertexAtomIds: ownership.vertexAtomIds,
        vertexResidueIds: ownership.vertexResidueIds,
        vertexResidueKeys: ownership.vertexResidueKeys,
        vertexResidueNumbers: ownership.vertexResidueNumbers,
        vertexResidueNumberCandidates: ownership.vertexResidueNumberCandidates,
        vertexResidueIdCandidates: ownership.vertexResidueIdCandidates,
        vertexResidueKeyCandidates: ownership.vertexResidueKeyCandidates,
        vertexChainIds: ownership.vertexChainIds,
        vertexChainIdCandidates: ownership.vertexChainIdCandidates,
        residueVertexCounts: ownership.residueVertexCounts,
        residueAtomIdsWithSurfaceVertices: ownership.residueAtomIdsWithSurfaceVertices,
        stats: ownership.stats,
    };
}
