import {SSEType} from '../protein/ProteinConstants.js';
import {classifyResidue} from '../protein/StructureClassifier.js';

function cleanCifValue(value, fallback = '') {
    if (value == null) return fallback;
    const s = String(value).trim();
    if (!s || s === '?' || s === '.') return fallback;
    return s;
}

function parseCifInt(value, fallback = null) {
    const s = cleanCifValue(value, '');
    if (!s) return fallback;
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? fallback : n;
}

function parseCifFloat(value, fallback = 0) {
    const s = cleanCifValue(value, '');
    if (!s) return fallback;
    const normalized = s.replace(/\([^)]+\)$/, '');
    const n = parseFloat(normalized);
    return Number.isNaN(n) ? fallback : n;
}

function normalizeTag(tag) {
    return String(tag || '').trim().toLowerCase();
}

function isStopToken(token) {
    const t = String(token || '').toLowerCase();
    return t === 'loop_' || t.startsWith('data_') || t.startsWith('save_') || t.startsWith('_');
}

function tokenizeCIF(text) {
    const tokens = [];
    let i = 0;
    const n = text.length;

    while (i < n) {
        const ch = text[i];

        if (/\s/.test(ch)) {
            i += 1;
            continue;
        }

        if (ch === '#') {
            while (i < n && text[i] !== '\n') i += 1;
            continue;
        }

        if (ch === ';' && (i === 0 || text[i - 1] === '\n' || text[i - 1] === '\r')) {
            i += 1;
            const start = i;
            let end = n;
            while (i < n) {
                if ((text[i] === '\n' || text[i] === '\r') && i + 1 < n && text[i + 1] === ';') {
                    end = i;
                    i += 2;
                    while (i < n && text[i] !== '\n') i += 1;
                    break;
                }
                i += 1;
            }
            tokens.push(text.slice(start, end));
            continue;
        }

        if (ch === '"' || ch === "'") {
            const quote = ch;
            i += 1;
            const start = i;
            while (i < n && text[i] !== quote) i += 1;
            tokens.push(text.slice(start, i));
            if (i < n && text[i] === quote) i += 1;
            continue;
        }

        const start = i;
        while (i < n && !/\s/.test(text[i]) && text[i] !== '#') i += 1;
        tokens.push(text.slice(start, i));
    }

    return tokens;
}

function parseLoopsAndItems(text) {
    const tokens = tokenizeCIF(text);
    const loops = [];
    const items = new Map();

    let i = 0;
    while (i < tokens.length) {
        const token = tokens[i];
        const lower = token.toLowerCase();

        if (lower === 'loop_') {
            i += 1;
            const tags = [];
            while (i < tokens.length && String(tokens[i]).startsWith('_')) {
                tags.push(tokens[i]);
                i += 1;
            }

            const rows = [];
            const width = tags.length;
            if (width === 0) continue;

            while (i < tokens.length && !isStopToken(tokens[i])) {
                if (i + width > tokens.length) break;
                rows.push(tokens.slice(i, i + width));
                i += width;
            }

            loops.push({tags, rows});
            continue;
        }

        if (String(token).startsWith('_')) {
            const key = normalizeTag(token);
            const value = i + 1 < tokens.length ? tokens[i + 1] : '';
            items.set(key, value);
            i += 2;
            continue;
        }

        i += 1;
    }

    return {loops, items, tokens};
}

function loopCategory(loop) {
    if (!loop.tags.length) return '';
    const first = normalizeTag(loop.tags[0]);
    const m = first.match(/^_([^\.\s]+)\./);
    return m ? m[1] : '';
}

function buildTagMap(tags) {
    const map = new Map();
    tags.forEach((tag, index) => map.set(normalizeTag(tag), index));
    return map;
}

function firstIndex(tagMap, names) {
    for (const name of names) {
        const hit = tagMap.get(normalizeTag(name));
        if (hit != null) return hit;
    }
    return -1;
}

function rowValue(row, index, fallback = '') {
    if (index < 0) return fallback;
    return cleanCifValue(row[index], fallback);
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

function getDataBlockId(text) {
    const m = text.match(/^\s*data_([^\s#]+)/im);
    return m ? m[1].trim() : '';
}

function atomSiteDebugInfo(text) {
    const {loops} = parseLoopsAndItems(text);
    const atomLoop = loops.find((loop) => loopCategory(loop) === 'atom_site');
    if (!atomLoop) {
        return {
            hasAtomSiteLoop: false,
            atomSiteTags: [],
            atomSiteRows: 0,
            loops: loops.map((loop) => ({
                category: loopCategory(loop),
                tagCount: loop.tags.length,
                rowCount: loop.rows.length,
                firstTags: loop.tags.slice(0, 10),
            })),
        };
    }

    return {
        hasAtomSiteLoop: true,
        atomSiteTags: atomLoop.tags,
        atomSiteRows: atomLoop.rows.length,
        firstAtomSiteRow: atomLoop.rows[0] || [],
    };
}

export class MMCIFParser {
    parse(text, proteinId, proteinSystem, options = {}) {
        const {modelNumber = 1, preferAuthIds = true} = options;

        if (proteinSystem.getProtein(proteinId)) {
            proteinSystem.removeProtein(proteinId);
        }

        const model = proteinSystem.createProtein(proteinId);
        model.info.format = 'mmcif';
        model.info.pdbId = proteinId;

        const dataBlockId = getDataBlockId(text);
        if (dataBlockId) model.info.dataBlockId = dataBlockId;

        const {loops, items} = parseLoopsAndItems(text);
        model.info.mmcifDebug = atomSiteDebugInfo(text);

        const entryId = cleanCifValue(items.get('_entry.id'), '');
        if (entryId) model.info.pdbId = entryId.toUpperCase();

        const atomLoop = loops.find((loop) => loopCategory(loop) === 'atom_site');
        if (!atomLoop) {
            model.bumpRevision();
            return model;
        }

        const tagMap = buildTagMap(atomLoop.tags);

        const idxGroup = firstIndex(tagMap, ['_atom_site.group_PDB', '_atom_site.group_pdb']);
        const idxId = firstIndex(tagMap, ['_atom_site.id']);
        const idxElement = firstIndex(tagMap, ['_atom_site.type_symbol']);
        const idxLabelAtom = firstIndex(tagMap, ['_atom_site.label_atom_id']);
        const idxAuthAtom = firstIndex(tagMap, ['_atom_site.auth_atom_id']);
        const idxAlt = firstIndex(tagMap, ['_atom_site.label_alt_id']);
        const idxLabelComp = firstIndex(tagMap, ['_atom_site.label_comp_id']);
        const idxAuthComp = firstIndex(tagMap, ['_atom_site.auth_comp_id']);
        const idxLabelAsym = firstIndex(tagMap, ['_atom_site.label_asym_id']);
        const idxAuthAsym = firstIndex(tagMap, ['_atom_site.auth_asym_id']);
        const idxLabelSeq = firstIndex(tagMap, ['_atom_site.label_seq_id']);
        const idxAuthSeq = firstIndex(tagMap, ['_atom_site.auth_seq_id']);
        const idxIns = firstIndex(tagMap, ['_atom_site.pdbx_PDB_ins_code', '_atom_site.pdbx_pdb_ins_code']);
        const idxX = firstIndex(tagMap, ['_atom_site.Cartn_x', '_atom_site.cartn_x']);
        const idxY = firstIndex(tagMap, ['_atom_site.Cartn_y', '_atom_site.cartn_y']);
        const idxZ = firstIndex(tagMap, ['_atom_site.Cartn_z', '_atom_site.cartn_z']);
        const idxOcc = firstIndex(tagMap, ['_atom_site.occupancy']);
        const idxB = firstIndex(tagMap, ['_atom_site.B_iso_or_equiv', '_atom_site.b_iso_or_equiv']);
        const idxModel = firstIndex(tagMap, ['_atom_site.pdbx_PDB_model_num', '_atom_site.pdbx_pdb_model_num']);

        model.info.mmcifDebug.atomSiteResolvedIndexes = {idxId, idxX, idxY, idxZ};

        if (idxX < 0 || idxY < 0 || idxZ < 0) {
            model.info.mmcifDebug.error = 'atom_site loop found, but Cartn_x/Cartn_y/Cartn_z columns were not found';
            model.bumpRevision();
            return model;
        }

        let generatedAtomId = 1;
        let generatedResidueSeq = 1;
        const pseudoResidueSeqByKey = new Map();

        for (const row of atomLoop.rows) {
            const rowModel = parseCifInt(rowValue(row, idxModel, ''), null);
            if (rowModel != null && modelNumber != null && rowModel !== modelNumber) continue;

            const altLoc = rowValue(row, idxAlt, '');
            if (altLoc && altLoc !== 'A') continue;

            const rawGroup = rowValue(row, idxGroup, 'ATOM').toUpperCase();
            const recordType = rawGroup === 'HETATM' ? 'HETATM' : 'ATOM';

            let atomSerial = parseCifInt(rowValue(row, idxId, ''), null);
            if (atomSerial == null) atomSerial = generatedAtomId;
            generatedAtomId = Math.max(generatedAtomId, atomSerial + 1);

            const labelAtom = rowValue(row, idxLabelAtom, '');
            const authAtom = rowValue(row, idxAuthAtom, '');
            const atomName = (preferAuthIds ? (authAtom || labelAtom) : (labelAtom || authAtom)) || `X${atomSerial}`;

            const labelComp = rowValue(row, idxLabelComp, '');
            const authComp = rowValue(row, idxAuthComp, '');
            const resName = ((preferAuthIds ? (authComp || labelComp) : (labelComp || authComp)) || 'UNK').toUpperCase();

            const labelAsym = rowValue(row, idxLabelAsym, '');
            const authAsym = rowValue(row, idxAuthAsym, '');
            const chainId = (preferAuthIds ? (authAsym || labelAsym) : (labelAsym || authAsym)) || 'X';

            const labelSeq = rowValue(row, idxLabelSeq, '');
            const authSeq = rowValue(row, idxAuthSeq, '');
            const seqRaw = preferAuthIds ? (authSeq || labelSeq) : (labelSeq || authSeq);

            let seqNum = parseCifInt(seqRaw, null);
            const insCode = rowValue(row, idxIns, '');

            if (seqNum == null) {
                const pseudoKey = [chainId, resName, labelAsym, authAsym, labelSeq, authSeq, insCode].join('|');
                if (!pseudoResidueSeqByKey.has(pseudoKey)) {
                    pseudoResidueSeqByKey.set(pseudoKey, generatedResidueSeq);
                    generatedResidueSeq += 1;
                }
                seqNum = pseudoResidueSeqByKey.get(pseudoKey);
            }

            const x = parseCifFloat(rowValue(row, idxX, ''), 0);
            const y = parseCifFloat(rowValue(row, idxY, ''), 0);
            const z = parseCifFloat(rowValue(row, idxZ, ''), 0);
            const occupancy = parseCifFloat(rowValue(row, idxOcc, ''), 1.0);
            const bFactor = parseCifFloat(rowValue(row, idxB, ''), 0.0);
            const element = (rowValue(row, idxElement, '') || atomName.replace(/[^A-Za-z]/g, '').slice(0, 2) || 'X').toUpperCase();

            const classification = classifyResidue({recordType, resName});

            const residue = model.addResidue({
                chainId,
                seqNum,
                insCode,
                name: resName,
                chainType: classification.chainType,
                recordType,
                kind: classification.kind,
                isProtein: classification.isProtein,
                isNucleic: classification.isNucleic,
                isHeterogen: classification.isHeterogen,
                isWater: classification.isWater,
                isUnknown: classification.isUnknown,
            });

            model.addAtom({
                atomId: atomSerial,
                atomName,
                element,
                x, y, z,
                occupancy,
                bFactor,
                residueId: residue.id,
                recordType,
                altLoc,
                serial: atomSerial,
            });
        }

        this._parseStructConnLoops(loops, model);
        this._parseSecondaryStructureLoops(loops, model);

        model.bumpRevision();
        return model;
    }

    debug(text) {
        return atomSiteDebugInfo(text);
    }

    _parseStructConnLoops(loops, model) {
        const connLoop = loops.find((loop) => loopCategory(loop) === 'struct_conn');
        if (!connLoop) return;

        const tagMap = buildTagMap(connLoop.tags);
        const p1ChainIdx = firstIndex(tagMap, ['_struct_conn.ptnr1_auth_asym_id', '_struct_conn.ptnr1_label_asym_id']);
        const p1SeqIdx = firstIndex(tagMap, ['_struct_conn.ptnr1_auth_seq_id', '_struct_conn.ptnr1_label_seq_id']);
        const p1AtomIdx = firstIndex(tagMap, ['_struct_conn.ptnr1_auth_atom_id', '_struct_conn.ptnr1_label_atom_id']);
        const p2ChainIdx = firstIndex(tagMap, ['_struct_conn.ptnr2_auth_asym_id', '_struct_conn.ptnr2_label_asym_id']);
        const p2SeqIdx = firstIndex(tagMap, ['_struct_conn.ptnr2_auth_seq_id', '_struct_conn.ptnr2_label_seq_id']);
        const p2AtomIdx = firstIndex(tagMap, ['_struct_conn.ptnr2_auth_atom_id', '_struct_conn.ptnr2_label_atom_id']);

        if (p1ChainIdx < 0 || p1SeqIdx < 0 || p1AtomIdx < 0 || p2ChainIdx < 0 || p2SeqIdx < 0 || p2AtomIdx < 0) return;

        for (const row of connLoop.rows) {
            const a1 = this._findAtomByResidueAndName(
                model,
                rowValue(row, p1ChainIdx, ''),
                rowValue(row, p1SeqIdx, ''),
                rowValue(row, p1AtomIdx, '')
            );
            const a2 = this._findAtomByResidueAndName(
                model,
                rowValue(row, p2ChainIdx, ''),
                rowValue(row, p2SeqIdx, ''),
                rowValue(row, p2AtomIdx, '')
            );
            if (a1 && a2) model.bondGraph.addBond(a1.id, a2.id);
        }
    }

    _findAtomByResidueAndName(model, chainId, seqRaw, atomName) {
        const seqNum = parseCifInt(seqRaw, null);
        const cleanAtomName = cleanCifValue(atomName, '').toUpperCase();
        if (!chainId || seqNum == null || !cleanAtomName) return null;

        const residue = model.getResidueByChainLabel(chainId, String(seqNum));
        if (!residue) return null;

        for (const atomId of residue.atomIds) {
            const atom = model.getAtom(atomId);
            if (atom && atom.name.toUpperCase() === cleanAtomName) return atom;
        }
        return null;
    }

    _parseSecondaryStructureLoops(loops, model) {
        for (const residue of model.residues.values()) {
            residue.sse = SSEType.LOOP;
            model.secondary.setResidueSSE(residue.id, SSEType.LOOP);
        }

        this._parseStructConf(loops, model);
        this._parseStructSheetRange(loops, model);
    }

    _parseStructConf(loops, model) {
        const confLoop = loops.find((loop) => loopCategory(loop) === 'struct_conf');
        if (!confLoop) return;

        const tagMap = buildTagMap(confLoop.tags);
        const typeIdx = firstIndex(tagMap, ['_struct_conf.conf_type_id']);
        const begChainIdx = firstIndex(tagMap, ['_struct_conf.beg_auth_asym_id', '_struct_conf.beg_label_asym_id']);
        const begSeqIdx = firstIndex(tagMap, ['_struct_conf.beg_auth_seq_id', '_struct_conf.beg_label_seq_id']);
        const begInsIdx = firstIndex(tagMap, ['_struct_conf.pdbx_beg_PDB_ins_code', '_struct_conf.pdbx_beg_pdb_ins_code']);
        const endChainIdx = firstIndex(tagMap, ['_struct_conf.end_auth_asym_id', '_struct_conf.end_label_asym_id']);
        const endSeqIdx = firstIndex(tagMap, ['_struct_conf.end_auth_seq_id', '_struct_conf.end_label_seq_id']);
        const endInsIdx = firstIndex(tagMap, ['_struct_conf.pdbx_end_PDB_ins_code', '_struct_conf.pdbx_end_pdb_ins_code']);

        if (begChainIdx < 0 || begSeqIdx < 0 || endChainIdx < 0 || endSeqIdx < 0) return;

        for (const row of confLoop.rows) {
            const type = rowValue(row, typeIdx, '').toUpperCase();
            if (type && !type.includes('HELX') && !type.includes('HELIX')) continue;

            const chainId = rowValue(row, begChainIdx, '') || rowValue(row, endChainIdx, '');
            const startSeq = parseCifInt(rowValue(row, begSeqIdx, ''), null);
            const endSeq = parseCifInt(rowValue(row, endSeqIdx, ''), null);
            if (!chainId || startSeq == null || endSeq == null) continue;

            const start = residueLabel(startSeq, rowValue(row, begInsIdx, ''));
            const end = residueLabel(endSeq, rowValue(row, endInsIdx, ''));
            const chain = model.chains.get(chainId);
            if (!chain) continue;

            for (const rid of chain.residueIds) {
                const residue = model.residues.get(rid);
                if (residue && inRange(residue.label, start, end)) {
                    residue.sse = SSEType.HELIX;
                    model.secondary.setResidueSSE(residue.id, SSEType.HELIX);
                }
            }
            model.secondary.addRange(chainId, start, end, SSEType.HELIX);
        }
    }

    _parseStructSheetRange(loops, model) {
        const sheetLoop = loops.find((loop) => loopCategory(loop) === 'struct_sheet_range');
        if (!sheetLoop) return;

        const tagMap = buildTagMap(sheetLoop.tags);
        const begChainIdx = firstIndex(tagMap, ['_struct_sheet_range.beg_auth_asym_id', '_struct_sheet_range.beg_label_asym_id']);
        const begSeqIdx = firstIndex(tagMap, ['_struct_sheet_range.beg_auth_seq_id', '_struct_sheet_range.beg_label_seq_id']);
        const begInsIdx = firstIndex(tagMap, ['_struct_sheet_range.pdbx_beg_PDB_ins_code', '_struct_sheet_range.pdbx_beg_pdb_ins_code']);
        const endChainIdx = firstIndex(tagMap, ['_struct_sheet_range.end_auth_asym_id', '_struct_sheet_range.end_label_asym_id']);
        const endSeqIdx = firstIndex(tagMap, ['_struct_sheet_range.end_auth_seq_id', '_struct_sheet_range.end_label_seq_id']);
        const endInsIdx = firstIndex(tagMap, ['_struct_sheet_range.pdbx_end_PDB_ins_code', '_struct_sheet_range.pdbx_end_pdb_ins_code']);

        if (begChainIdx < 0 || begSeqIdx < 0 || endChainIdx < 0 || endSeqIdx < 0) return;

        for (const row of sheetLoop.rows) {
            const chainId = rowValue(row, begChainIdx, '') || rowValue(row, endChainIdx, '');
            const startSeq = parseCifInt(rowValue(row, begSeqIdx, ''), null);
            const endSeq = parseCifInt(rowValue(row, endSeqIdx, ''), null);
            if (!chainId || startSeq == null || endSeq == null) continue;

            const start = residueLabel(startSeq, rowValue(row, begInsIdx, ''));
            const end = residueLabel(endSeq, rowValue(row, endInsIdx, ''));
            const chain = model.chains.get(chainId);
            if (!chain) continue;

            for (const rid of chain.residueIds) {
                const residue = model.residues.get(rid);
                if (residue && inRange(residue.label, start, end)) {
                    residue.sse = SSEType.SHEET;
                    model.secondary.setResidueSSE(residue.id, SSEType.SHEET);
                }
            }
            model.secondary.addRange(chainId, start, end, SSEType.SHEET);
        }
    }
}

export function debugMMCIFAtomSite(text) {
    return atomSiteDebugInfo(text);
}
