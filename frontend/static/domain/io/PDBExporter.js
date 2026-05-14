function padLeft(value, width, fill = ' ') {
    return String(value).slice(0, width).padStart(width, fill);
}

function padRight(value, width, fill = ' ') {
    return String(value).slice(0, width).padEnd(width, fill);
}

function formatFloat(value, width, decimals) {
    const n = Number(value);
    const s = Number.isFinite(n) ? n.toFixed(decimals) : (0).toFixed(decimals);
    return padLeft(s, width);
}

function normalizeElement(element = '') {
    const e = String(element || '').trim().toUpperCase();
    if (!e) return 'X';
    if (e.length === 1) return e;
    const two = e.slice(0, 2);
    return two[1] && two[1] === two[1].toLowerCase() ? two : e.slice(0, 2);
}

function formatAtomName(name = '', element = '') {
    const raw = String(name || '').trim().slice(0, 4);
    if (raw.length >= 4) return raw;
    const el = normalizeElement(element);
    // PDB convention: one-letter element atom names are right-aligned in columns 13-16.
    if (el.length === 1 && raw.length < 4) return ` ${raw}`.padEnd(4, ' ');
    return raw.padEnd(4, ' ');
}

function uniqueSortedBondPairs(model) {
    const pairs = [];
    const seen = new Set();
    const adj = model?.bondGraph?._adj;
    if (!adj) return pairs;

    for (const [a, neighbors] of adj.entries()) {
        for (const b of neighbors) {
            const aa = Number(a);
            const bb = Number(b);
            const key = String(aa) < String(bb) ? `${aa}|${bb}` : `${bb}|${aa}`;
            if (seen.has(key)) continue;
            seen.add(key);
            pairs.push([a, b]);
        }
    }

    pairs.sort((x, y) => Number(x[0]) - Number(y[0]) || Number(x[1]) - Number(y[1]));
    return pairs;
}

function atomSortValue(atom) {
    return Number(atom.serial ?? atom.id ?? 0);
}

function recordForAtom(model, atom, options = {}) {
    const residue = model.residues.get(atom.residueId);
    const p = model.getAtomPosition(atom.id) || [0, 0, 0];

    const recordType = String(atom.recordType || residue?.recordType || 'ATOM').toUpperCase() === 'HETATM' ? 'HETATM' : 'ATOM';
    const serial = Number(atom.serial ?? atom.id ?? 1);
    const atomName = formatAtomName(atom.name, atom.element);
    const altLoc = String(atom.altLoc || ' ').slice(0, 1) || ' ';
    const resName = padRight((residue?.name || 'UNK').toUpperCase().slice(0, 3), 3);
    const chainId = String(residue?.chainId || 'A').slice(0, 1) || 'A';
    const seqNum = Number(residue?.seqNum ?? 1);
    const insCode = String(residue?.insCode || ' ').slice(0, 1) || ' ';
    const occupancy = atom.occupancy ?? 1.0;
    const bFactor = atom.bFactor ?? 0.0;
    const element = padLeft(normalizeElement(atom.element || atom.name).slice(0, 2), 2);

    return [
        padRight(recordType, 6),
        padLeft(serial, 5),
        ' ',
        atomName,
        altLoc,
        resName,
        ' ',
        chainId,
        padLeft(seqNum, 4),
        insCode,
        '   ',
        formatFloat(p[0], 8, 3),
        formatFloat(p[1], 8, 3),
        formatFloat(p[2], 8, 3),
        formatFloat(occupancy, 6, 2),
        formatFloat(bFactor, 6, 2),
        '          ',
        element,
        '  ',
    ].join('').slice(0, 80);
}

function conectLines(model, {includeConect = true} = {}) {
    if (!includeConect) return [];
    const neighborsByAtom = new Map();

    for (const [a, b] of uniqueSortedBondPairs(model)) {
        if (!neighborsByAtom.has(a)) neighborsByAtom.set(a, []);
        if (!neighborsByAtom.has(b)) neighborsByAtom.set(b, []);
        neighborsByAtom.get(a).push(b);
        neighborsByAtom.get(b).push(a);
    }

    const lines = [];
    const atomIds = [...neighborsByAtom.keys()].sort((a, b) => Number(a) - Number(b));

    for (const atomId of atomIds) {
        const neighbors = [...new Set(neighborsByAtom.get(atomId))]
            .sort((a, b) => Number(a) - Number(b));

        for (let i = 0; i < neighbors.length; i += 4) {
            const chunk = neighbors.slice(i, i + 4);
            lines.push(`CONECT${padLeft(atomId, 5)}${chunk.map((n) => padLeft(n, 5)).join('')}`.padEnd(80));
        }
    }

    return lines;
}

export function exportPDB(model, {
    includeConect = true,
    includeHeader = true,
    endRecord = true,
} = {}) {
    if (!model) throw new Error('[exportPDB] model is required');

    const lines = [];
    if (includeHeader) {
        const pdbId = String(model.info?.pdbId || model.id || '').toUpperCase().slice(0, 4);
        const classification = String(model.info?.classification || 'PROVR EDITED STRUCTURE').slice(0, 40);
        lines.push(`HEADER    ${padRight(classification, 40)}          ${padLeft(pdbId, 4)}`.padEnd(80));
        lines.push(`REMARK   1 EXPORTED BY PROVR FROM CURRENT PROTEINMODEL COORDINATES`.padEnd(80));
        lines.push(`REMARK   2 MODEL REVISION ${model.revision}`.padEnd(80));
    }

    const atoms = [...model.atoms.values()].sort((a, b) => atomSortValue(a) - atomSortValue(b));
    for (const atom of atoms) {
        lines.push(recordForAtom(model, atom));
    }

    lines.push(...conectLines(model, {includeConect}));

    if (endRecord) lines.push('END'.padEnd(80));
    return `${lines.join('\n')}\n`;
}

export function downloadText(text, filename = 'provr_export.pdb', mimeType = 'text/plain') {
    const blob = new Blob([text], {type: mimeType});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
