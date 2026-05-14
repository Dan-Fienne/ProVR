function finiteNumber(value, fallback = null) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function compactUnique(values = []) {
    const out = [];
    const seen = new Set();
    for (const value of values) {
        if (value === null || value === undefined || value === '') continue;
        const key = String(value);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }
    return out;
}

function stringValue(value) {
    if (value === null || value === undefined || value === '') return null;
    return String(value).trim();
}

function lastNumericToken(value) {
    const text = String(value ?? '');
    const matches = text.match(/-?\d+/g);
    if (!matches?.length) return null;
    const n = Number(matches[matches.length - 1]);
    return Number.isFinite(n) ? n : null;
}

function numericCandidate(value, {allowToken = true} = {}) {
    const direct = finiteNumber(value, null);
    if (direct !== null) return direct;
    if (!allowToken) return null;
    return lastNumericToken(value);
}

function numericCandidates(values = [], options = {}) {
    const out = [];
    for (const value of values) {
        const n = numericCandidate(value, options);
        if (n !== null) out.push(n);
    }
    return compactUnique(out.map((n) => Number(n)));
}

function chainCandidatesFrom(residue = null, atom = null) {
    return compactUnique([
        residue?.chainId,
        residue?.chain,
        residue?.chainName,
        residue?.asymId,
        residue?.authAsymId,
        residue?.labelAsymId,
        atom?.chainId,
        atom?.chain,
        atom?.chainName,
        atom?.asymId,
        atom?.authAsymId,
        atom?.labelAsymId,
    ].map(stringValue));
}

function residueIdCandidatesFrom(residue = null, atom = null) {
    return compactUnique([
        residue?.id,
        residue?.residueId,
        residue?.label,
        residue?.key,
        residue?.pdbId,
        atom?.residueId,
        atom?.resId,
        atom?.resi,
        atom?.resSeq,
        atom?.residueKey,
    ].map(stringValue));
}

function residueNumberCandidatesFrom(residue = null, atom = null) {
    // Prefer atom-side PDB/mmCIF fields first.  In this codebase atom fields are
    // usually closer to what the user types in validation boxes, while residue
    // objects may store internal order/index values.
    const primary = numericCandidates([
        atom?.resSeq,
        atom?.resi,
        atom?.resId,
        atom?.residueSeq,
        atom?.residueNumber,
        atom?.authSeqId,
        atom?.labelSeqId,
        atom?.pdbSeqNum,
        atom?.residueId,
        residue?.seqNum,
        residue?.sequenceNumber,
        residue?.resSeq,
        residue?.resi,
        residue?.resId,
        residue?.number,
        residue?.authSeqId,
        residue?.labelSeqId,
        residue?.pdbSeqNum,
        residue?.label,
        residue?.id,
        residue?.residueId,
    ]);

    // Internal order is a last-resort fallback.  We include both order and
    // order+1 because some parsers store 0-based order while UI fields are 1-based.
    const order = finiteNumber(residue?.order, null);
    const fallback = order === null ? [] : compactUnique([order, order + 1]);
    return compactUnique([...primary, ...fallback].map((n) => Number(n)));
}

function residueKeyCandidatesFrom(chainCandidates, numberCandidates, residueIdCandidates) {
    const chain = chainCandidates[0] || '_';
    const keys = [];
    for (const n of numberCandidates) keys.push(`${chain}:${n}`);
    for (const rid of residueIdCandidates) keys.push(String(rid));
    return compactUnique(keys);
}

export function buildResidueIdentity(residue = null, atom = null) {
    const chainCandidates = chainCandidatesFrom(residue, atom);
    const residueIdCandidates = residueIdCandidatesFrom(residue, atom);
    const residueNumberCandidates = residueNumberCandidatesFrom(residue, atom);
    const residueKeyCandidates = residueKeyCandidatesFrom(chainCandidates, residueNumberCandidates, residueIdCandidates);
    const chainId = chainCandidates[0] || '';
    const residueNumber = residueNumberCandidates.length ? residueNumberCandidates[0] : null;
    const residueId = residueIdCandidates[0] || null;
    const residueKey = residueKeyCandidates[0] || `${chainId || '_'}:${residueId ?? ''}`;

    return {
        chainId,
        chainCandidates,
        residueId,
        residueIdCandidates,
        residueNumber,
        residueNumberCandidates,
        displayNumber: residueNumber === null ? String(residueId ?? '') : String(residueNumber),
        residueKey,
        residueKeyCandidates,
        rawResidue: residue || null,
        rawAtom: atom || null,
    };
}

function ruleChainMatches(identity, rule) {
    const ruleChain = stringValue(rule?.chainId ?? rule?.chain ?? rule?.authAsymId ?? rule?.labelAsymId);
    if (!ruleChain) return true;
    const candidates = identity?.chainCandidates?.length ? identity.chainCandidates : [identity?.chainId];
    return candidates.map((v) => String(v).trim()).some((v) => v === ruleChain);
}

function normalizedResidueIds(rule) {
    const ids = rule?.residueIds ?? rule?.residues ?? null;
    if (!Array.isArray(ids)) return [];
    return ids.map((v) => String(v)).filter(Boolean);
}

function rangeStart(rule) {
    return numericCandidate(rule?.startSeq ?? rule?.start ?? rule?.from ?? rule?.residueStart ?? rule?.residue ?? rule?.seqNum ?? rule?.seq ?? rule?.resSeq ?? rule?.resi, {allowToken: true});
}

function rangeEnd(rule) {
    return numericCandidate(rule?.endSeq ?? rule?.end ?? rule?.to ?? rule?.residueEnd ?? rule?.residue ?? rule?.seqNum ?? rule?.seq ?? rule?.resSeq ?? rule?.resi, {allowToken: true});
}

export function residueIdentityMatchesRule(identity, rule) {
    if (!identity || !rule) return false;
    if (!ruleChainMatches(identity, rule)) return false;

    const explicitIds = normalizedResidueIds(rule);
    if (explicitIds.length) {
        const candidates = compactUnique([
            identity.residueId,
            identity.residueKey,
            identity.displayNumber,
            ...(identity.residueIdCandidates || []),
            ...(identity.residueKeyCandidates || []),
            ...(identity.residueNumberCandidates || []).map((n) => String(n)),
        ].map(stringValue));
        return candidates.some((v) => explicitIds.includes(v));
    }

    const start = rangeStart(rule);
    const end = rangeEnd(rule);
    if (start === null && end === null) return false;

    return (identity.residueNumberCandidates || []).some((n) => {
        if (start !== null && n < start) return false;
        if (end !== null && n > end) return false;
        return true;
    });
}

export function residueIdentityMatchesRange(identity, range) {
    if (!identity || !range) return false;
    if (!ruleChainMatches(identity, range)) return false;

    const explicitIds = normalizedResidueIds(range);
    if (explicitIds.length) {
        const candidates = compactUnique([
            identity.residueId,
            identity.residueKey,
            identity.displayNumber,
            ...(identity.residueIdCandidates || []),
            ...(identity.residueKeyCandidates || []),
            ...(identity.residueNumberCandidates || []).map((n) => String(n)),
        ].map(stringValue));
        return candidates.some((v) => explicitIds.includes(v));
    }

    const start = rangeStart(range);
    const end = rangeEnd(range);
    if (start === null && end === null) return true;

    return (identity.residueNumberCandidates || []).some((n) => {
        if (start !== null && n < start) return false;
        if (end !== null && n > end) return false;
        return true;
    });
}

export function canonicalResidueKey(identity) {
    if (!identity) return null;
    return identity.residueKey || identity.residueKeyCandidates?.[0] || null;
}

export function firstResidueNumber(identity) {
    return identity?.residueNumber ?? identity?.residueNumberCandidates?.[0] ?? null;
}
