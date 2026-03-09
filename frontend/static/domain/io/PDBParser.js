import {detectChainType} from '../protein/ProteinConstants.js';
import {SSEType} from '../protein/ProteinConstants.js';

function col(line, start, end) {
    return line.slice(start - 1, end).trim();
}

function intCol(line, s, e) {
    const v = parseInt(col(line, s, e), 10);
    return Number.isNaN(v) ? null : v;
}

function floatCol(line, s, e, def = 0) {
    const v = parseFloat(col(line, s, e));
    return Number.isNaN(v) ? def : v;
}

function residueLabel(seqNum, insCode = '') {
    return `${seqNum}${insCode || ''}`;
}

function parseLabel(label) {
    const m = String(label).match(/^(-?\d+)([A-Za-z]?)$/);
    if (!m) return {n: 0, i: ''};
    return {n: parseInt(m[1], 10), i: m[2] || ''};
}

function compareLabel(a, b) {
    const A = parseLabel(a);
    const B = parseLabel(b);
    if (A.n !== B.n) return A.n - B.n;
    return A.i.localeCompare(B.i);
}

function inRange(label, start, end) {
    return compareLabel(label, start) >= 0 && compareLabel(label, end) <= 0;
}

export class PDBParser {
    parse(text, proteinId, proteinSystem) {
        const model = proteinSystem.createProtein(proteinId);

        const helixRanges = [];
        const sheetRanges = [];

        const lines = text.split(/\r?\n/);
        for (const line of lines) {
            const rec = col(line, 1, 6).toUpperCase();

            if (rec === 'HEADER') {
                model.info.classification = col(line, 11, 50);
                const pdbId = col(line, 63, 66).toUpperCase();
                if (pdbId) model.info.pdbId = pdbId;
                continue;
            }

            if (rec === 'ATOM' || rec === 'HETATM') {
                const atomSerial = intCol(line, 7, 11);
                if (atomSerial == null) continue;

                const atomName = col(line, 13, 16);
                const altLoc = col(line, 17, 17).toUpperCase();
                if (altLoc && altLoc !== 'A') continue;

                const resName = col(line, 18, 20).toUpperCase() || 'UNK';
                const chainId = col(line, 22, 22) || 'X';
                const seqNum = intCol(line, 23, 26);
                if (seqNum == null) continue;
                const insCode = col(line, 27, 27);

                const x = floatCol(line, 31, 38, 0);
                const y = floatCol(line, 39, 46, 0);
                const z = floatCol(line, 47, 54, 0);

                const occupancy = floatCol(line, 55, 60, 1.0);
                const bFactor = floatCol(line, 61, 66, 0.0);
                const element = (col(line, 77, 78) || atomName[0] || 'X').toUpperCase();

                const chainType = rec === 'HETATM' ? 'HET' : detectChainType(resName);
                const residue = model.addResidue({
                    chainId,
                    seqNum,
                    insCode,
                    name: resName,
                    chainType
                });

                model.addAtom({
                    atomId: atomSerial,
                    atomName,
                    element,
                    x, y, z,
                    occupancy,
                    bFactor,
                    residueId: residue.id
                });

                continue;
            }

            if (rec === 'CONECT') {
                const a = intCol(line, 7, 11);
                if (a == null) continue;
                const others = [
                    intCol(line, 12, 16),
                    intCol(line, 17, 21),
                    intCol(line, 22, 26),
                    intCol(line, 27, 31),
                ];
                for (const b of others) {
                    if (b != null && model.atoms.has(a) && model.atoms.has(b)) {
                        model.bondGraph.addBond(a, b);
                    }
                }
                continue;
            }

            if (rec === 'HELIX') {
                const chainId = col(line, 20, 20) || 'X';
                const startSeq = intCol(line, 22, 25);
                const startIns = col(line, 26, 26);
                const endSeq = intCol(line, 34, 37);
                const endIns = col(line, 38, 38);
                if (startSeq != null && endSeq != null) {
                    helixRanges.push({
                        chainId,
                        start: residueLabel(startSeq, startIns),
                        end: residueLabel(endSeq, endIns),
                    });
                }
                continue;
            }

            if (rec === 'SHEET') {
                const chainId = col(line, 22, 22) || 'X';
                const startSeq = intCol(line, 23, 26);
                const startIns = col(line, 27, 27);
                const endSeq = intCol(line, 34, 37);
                const endIns = col(line, 38, 38);
                if (startSeq != null && endSeq != null) {
                    sheetRanges.push({
                        chainId,
                        start: residueLabel(startSeq, startIns),
                        end: residueLabel(endSeq, endIns),
                    });
                }
            }
        }

        for (const residue of model.residues.values()) {
            residue.sse = SSEType.LOOP;
            model.secondary.setResidueSSE(residue.id, SSEType.LOOP);
        }

        for (const r of helixRanges) {
            const chain = model.chains.get(r.chainId);
            if (!chain) continue;
            for (const rid of chain.residueIds) {
                const res = model.residues.get(rid);
                if (!res) continue;
                if (inRange(res.label, r.start, r.end)) {
                    res.sse = SSEType.HELIX;
                    model.secondary.setResidueSSE(res.id, SSEType.HELIX);
                }
            }
            model.secondary.addRange(r.chainId, r.start, r.end, SSEType.HELIX);
        }

        for (const r of sheetRanges) {
            const chain = model.chains.get(r.chainId);
            if (!chain) continue;
            for (const rid of chain.residueIds) {
                const res = model.residues.get(rid);
                if (!res) continue;
                if (inRange(res.label, r.start, r.end)) {
                    res.sse = SSEType.SHEET;
                    model.secondary.setResidueSSE(res.id, SSEType.SHEET);
                }
            }
            model.secondary.addRange(r.chainId, r.start, r.end, SSEType.SHEET);
        }

        model.bumpRevision();
        return model;
    }
}