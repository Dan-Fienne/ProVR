import {sse, structureInfo} from "../core/constants.js";
import {mark, resCompare, sliceStr} from "./utils.js";

export class PDBManager {
    constructor() {
        this._map = new Map();
    };

    add(pdb) {
        this._map.set(pdb.id, pdb);
    };

    get(id) {
        return this._map.get(id);
    };

    delete(id) {
        return this._map.delete(id);
    };

    has(id) {
        return this._map.has(id);
    };

    listIds() {
        return [...this._map.keys()];
    };
}

export class PDB {
    constructor(pdbId) {
        this.id = pdbId;

        this.main = new Map();
        this.het = new Map();
        this.dna = new Map();

        /* atom index */
        this.bonds = new Map();
        this.atomIdx = new Map();
        this.single = new Set();

        /* ssBond */
        this.ssbonds = [];

        /* sec struc */
        this.helix = new Map();
        this.sheet = new Map();
    };

    // unify chains iter
    iterChains(types = ['main']) {
        const out = [];
        for (const t of types) {
            const bag = this[t];
            if (!bag) continue;
            for (const [cid, chain] of bag) {
                out.push([cid, chain, t]);
            }
        }
        return out;
    };

    // chain type: main, het, dna
    addChain(chain) {
        const cType = chain.type;
        switch (cType) {
            case 'main':
                this.main.set(chain.id, chain);
                break;
            case 'het':
                this.het.set(chain.id, chain);
                break;
            case 'dna':
                this.dna.set(chain.id, chain);
                break;
            default:
                this.main.set(chain.id, chain);
                break;
        }
    };

    addAtom(atom) {
        this.atomIdx.set(atom.id, atom);
        this.single.add(atom.id);
    };

    addConnect(mainId, linkId) {
        if (!this.atomIdx.has(mainId) || !this.atomIdx.has(linkId) || mainId === linkId) return;
        const link = (id1, id2) => {
            if (!this.bonds.has(id1)) {
                this.bonds.set(id1, new Set());
            }
            this.bonds.get(id1).add(id2);
        };
        link(mainId, linkId);
        link(linkId, mainId);
        this.single.delete(mainId);
        this.single.delete(linkId);
    };

    addSSBond(serial, c1, r1, c2, r2) {
        this.ssbonds.push({serial, chain1: c1, res1: r1, chain2: c2, res2: r2});
    };

    addHelix(chainId, start, stop) {
        if (!this.helix.has(chainId)) this.helix.set(chainId, []);
        this.helix.get(chainId).push([start, stop]);
    };

    addSheet(chainId, sheetId, start, stop) {
        if (!this.sheet.has(chainId)) this.sheet.set(chainId, new Map());
        const sheet = this.sheet.get(chainId);
        if (!sheet.has(sheetId)) sheet.set(sheetId, []);
        sheet.get(sheetId).push([start, stop]);
    };
}


export class Atom {
    constructor({
                    id,
                    name,
                    element,
                    x,
                    y,
                    z,
                    occupancy,
                    bFactor,
                    parent
                }) {
        Object.assign(this, {
            id,
            name,
            element,
            x,
            y,
            z,
            occupancy,
            bFactor,
            parent
        });
    }
}


export class Residue {
    constructor(resId, resName, parent) {
        this.resId = resId;
        this.resName = resName;
        this.parent = parent;

        this.atoms = new Map();
    }

    addAtom(atom) {
        this.atoms.set(atom.name, atom);
    }
}

export class Chain {
    constructor(chainId, chainType, parent) {
        this.id = chainId;
        this.type = chainType;
        this.residues = new Map();

        this.parent = parent;
    }

    getRes(resId, resName) {
        if (!this.residues.has(resId))
            this.residues.set(resId, new Residue(resId, resName, this));
        return this.residues.get(resId);
    }
}


export class PDBParser {
    constructor(protein) {
        this.pdb = protein;
        // 解析缓存，减少 Map 访问
        this._last = {type: null, chainId: null, chain: null, resId: null, residue: null};
    }

    parser(pdbId, text) {
        const lines = text.split(/\r?\n/);
        for (let line of lines) {
            const head = sliceStr(line, 0, 6);
            switch (head) {
                case 'ATOM':
                    this.parseATOM(line, 'main');
                    break;
                case 'HETATM':
                    this.parseATOM(line, 'het');
                    break;
                case 'CONECT':
                    this.parseConnect(line);
                    break;
                case 'SSBOND':
                    this.parseSSBond(line);
                    break;
                case 'HELIX':
                    this.parseHelix(line);
                    break;
                case 'SHEET':
                    this.parseSheet(line);
                    break;

            }
        }
        this.annotate();
        return this.pdb;
    }

    extract(line) {
        const toNum = (s) => {
            const n = +s;
            return Number.isFinite(n) ? n : NaN;
        };
        return {
            id: toNum(sliceStr(line, 7, 11)),
            name: sliceStr(line, 13, 16),
            resName: sliceStr(line, 18, 20) || 'YDF',
            chain: sliceStr(line, 22),
            resId: sliceStr(line, 23, 27),
            x: toNum(sliceStr(line, 31, 38)),
            y: toNum(sliceStr(line, 39, 46)),
            z: toNum(sliceStr(line, 47, 54)),
            occupancy: toNum(sliceStr(line, 55, 60)),
            bFactor: toNum(sliceStr(line, 61, 66)),
            element: sliceStr(line, 77, 78)
        };
    };


    parseATOM(line, type) {
        const alt = sliceStr(line, 17);
        if (alt && alt !== 'A') return;

        const atomInfo = this.extract(line);
        if (atomInfo.resId === '') return;

        const pdbType = sliceStr(line, 18, 20);
        if (pdbType in structureInfo.dna) {
            type = 'dna';
        }

        // chain
        const chainId = atomInfo.chain || 'Y';
        let container = this.pdb.main;
        switch (type) {
            case 'main':
                break;
            case 'het':
                container = this.pdb.het;
                break;
            case 'dna':
                container = this.pdb.dna;
                break;
            default:
                container = this.pdb.main;
        }
        let chain;
        if (this._last.type === type && this._last.chainId === chainId && this._last.chain) {
            chain = this._last.chain;
        } else {
            chain = container.get(chainId);
            if (!chain) {
                chain = new Chain(chainId, type, container);
                this.pdb.addChain(chain);
            }
            Object.assign(this._last, {type, chainId, chain, resId: null, residue: null});
        }

        // residue
        let residue;
        if (this._last.resId === atomInfo.resId && this._last.residue) {
            residue = this._last.residue;
        } else {
            residue = chain.getRes(atomInfo.resId, atomInfo.resName);
            this._last.resId = atomInfo.resId;
            this._last.residue = residue;
        }

        const atom = new Atom({
            id: atomInfo.id,
            name: atomInfo.name,
            element: atomInfo.element,
            x: atomInfo.x,
            y: atomInfo.y,
            z: atomInfo.z,
            occupancy: atomInfo.occupancy,
            bFactor: atomInfo.bFactor,
            parent: residue,
        });
        residue.addAtom(atom);
        this.pdb.addAtom(atom);
    };

    parseConnect(line) {
        const mainId = parseInt(sliceStr(line, 7, 11));
        if (!Number.isInteger(mainId)) return;

        const ids = [
            sliceStr(line, 12, 16),
            sliceStr(line, 17, 21),
            sliceStr(line, 22, 26),
            sliceStr(line, 27, 31),
        ].map(str => parseInt(str))
            .filter(Number.isInteger);

        for (const othId of ids) {
            this.pdb.addConnect(mainId, othId);
        }
    };

    parseSSBond(line) {
        const serial = parseInt(sliceStr(line, 7, 11));
        const c1 = sliceStr(line, 16);
        const r1 = parseInt(sliceStr(line, 18, 22));
        const c2 = sliceStr(line, 30);
        const r2 = parseInt(sliceStr(line, 32, 36));
        this.pdb.addSSBond(serial, c1, r1, c2, r2);
    };

    parseHelix(line) {
        const chainId = sliceStr(line, 20);
        const start = parseInt(sliceStr(line, 22, 26));
        const stop = parseInt(sliceStr(line, 34, 38));
        this.pdb.addHelix(chainId, start, stop);
    };

    parseSheet(line) {
        const chainId = sliceStr(line, 22);
        const sheetId = sliceStr(line, 12, 14) || 'A1';
        const start = parseInt(sliceStr(line, 23, 27));
        const stop = parseInt(sliceStr(line, 34, 38));
        this.pdb.addSheet(chainId, sheetId, start, stop);
    };

    annotate() {

        /* annotate second structure */
        const tag = {
            'helix': [sse.helix_head, sse.helix_body, sse.helix_foot],
            'sheet': [sse.sheet_head, sse.sheet_body, sse.sheet_foot],
            'loop': [sse.loop_body]
        }

        for (const [chainId, chain] of this.pdb.iterChains(["main"])) {
            const breaks = new Map();
            /* helix */
            (this.pdb.helix.get(chainId) || []).forEach(([start, end]) => {
                mark(breaks, start, 'start', 'helix');
                mark(breaks, end, 'end', 'helix');
            });
            /* sheet */
            const sheet = this.pdb.sheet.get(chainId);
            if (sheet) {
                for (const ranges of sheet.values()) {
                    ranges.forEach(([start, end]) => {
                        mark(breaks, start, 'start', 'sheet');
                        mark(breaks, end, 'end', 'sheet')
                    });
                }
            }

            /* 单指针 */
            const residues = Array.from(chain.residues.keys()).sort(resCompare);
            let curr = null;
            let body = null;
            let foot = null;
            let head = null;

            for (const rid of residues) {
                const residue = chain.residues.get(rid);
                const bk = breaks.get(rid);

                if (bk?.start) {
                    curr = bk.start;
                    [head, body, foot] = tag[curr];
                    residue.sse = head;

                    if (bk.end === curr) {
                        residue.sse = foot;
                        curr = null;
                    }
                    continue;
                }

                residue.sse = curr ? body : sse.loop_body;

                if (bk?.end === curr) {
                    residue.sse = foot;
                    curr = null;
                }
            }
        }
    };
}

