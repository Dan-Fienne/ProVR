import {PDBParser} from './PDBParser.js';
import {MMCIFParser} from './MMCIFParser.js';

function normalizeFormat(format = 'auto') {
    const key = String(format || 'auto').trim().toLowerCase();
    if (['pdb', 'ent'].includes(key)) return 'pdb';
    if (['cif', 'mmcif', 'mif'].includes(key)) return 'mmcif';
    return 'auto';
}

export function detectStructureFormat(text = '', filename = '') {
    const name = String(filename || '').toLowerCase();
    if (name.endsWith('.pdb') || name.endsWith('.ent')) return 'pdb';
    if (name.endsWith('.cif') || name.endsWith('.mmcif') || name.endsWith('.mif')) return 'mmcif';

    const head = String(text).slice(0, 5000);
    if (/^\s*data_/m.test(head) || /_atom_site\./.test(head)) return 'mmcif';
    if (/^(HEADER|ATOM  |HETATM|CRYST1|MODEL |TITLE )/m.test(head)) return 'pdb';
    return 'pdb';
}

export class StructureLoader {
    constructor({proteinSystem}) {
        if (!proteinSystem) throw new Error('[StructureLoader] proteinSystem is required');
        this.proteinSystem = proteinSystem;
        this.parsers = new Map([
            ['pdb', new PDBParser()],
            ['mmcif', new MMCIFParser()],
        ]);
    }

    loadText({text, proteinId, format = 'auto', filename = '', replace = true} = {}) {
        if (!text || typeof text !== 'string') throw new Error('[StructureLoader] text is required');
        const id = proteinId || inferProteinId(filename) || 'protein';
        const fmt = normalizeFormat(format) === 'auto' ? detectStructureFormat(text, filename) : normalizeFormat(format);
        const parser = this.parsers.get(fmt);
        if (!parser) throw new Error(`[StructureLoader] unsupported structure format: ${format}`);
        const model = parser.parse(text, id, this.proteinSystem, {replace});
        model.info.source = filename || '';
        model.info.format = fmt;
        return {proteinId: id, format: fmt, model};
    }

    async loadFile(file, {proteinId = null, format = 'auto', replace = true} = {}) {
        if (!file) throw new Error('[StructureLoader] file is required');
        const text = await file.text();
        return this.loadText({
            text,
            proteinId: proteinId || inferProteinId(file.name),
            filename: file.name,
            format,
            replace,
        });
    }
}

export function inferProteinId(filename = '') {
    const base = String(filename || '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').trim();
    return base ? base.toLowerCase() : '';
}