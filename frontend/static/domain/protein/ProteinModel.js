import {ChainType, RecordType, ResidueKind, SSEType} from './ProteinConstants.js';
import {BondGraph} from './BondGraph.js';
import {SecondaryStructureModel} from './SecondaryStructureModel.js';
import {SelectionModel} from './SelectionModel.js';

function residueLabel(seqNum, insCode = '') {
    return `${seqNum}${insCode || ''}`;
}

function normalizeLabelPart(value) {
    return String(value ?? '').trim() || '_';
}

export class ProteinModel {
    constructor({proteinId, coordinateStore}) {
        this.id = proteinId;
        this.coordinateStore = coordinateStore;

        this.revision = 0;
        this.info = {
            pdbId: proteinId,
            classification: '',
            format: '',
            source: '',
        };

        this.chains = new Map();
        this.residues = new Map();
        this.atoms = new Map();

        this.bondGraph = new BondGraph();
        this.secondary = new SecondaryStructureModel();
        this.selection = new SelectionModel();

        this._residueKeyMap = new Map();
        this._chainResidueKeyMap = new Map();
    }

    bumpRevision() {
        this.revision += 1;
        return this.revision;
    }

    ensureChain(chainId, chainType = ChainType.UNK) {
        const id = normalizeLabelPart(chainId) === '_' ? 'X' : String(chainId);
        if (!this.chains.has(id)) {
            this.chains.set(id, {
                id,
                type: chainType,
                types: new Set(chainType ? [chainType] : []),
                residueIds: [],
                previewTransform: null,
            });
        } else {
            const c = this.chains.get(id);
            if (chainType) c.types.add(chainType);
            if (c.type === ChainType.UNK && chainType !== ChainType.UNK) c.type = chainType;
        }
        return this.chains.get(id);
    }

    addResidue({
                   chainId,
                   seqNum,
                   insCode = '',
                   name,
                   chainType = ChainType.UNK,
                   recordType = RecordType.ATOM,
                   kind = ResidueKind.UNKNOWN,
                   isProtein = false,
                   isNucleic = false,
                   isHeterogen = false,
                   isWater = false,
                   isUnknown = false,
               }) {
        const safeChainId = normalizeLabelPart(chainId) === '_' ? 'X' : String(chainId);
        const safeSeqNum = Number.isFinite(Number(seqNum)) ? Number(seqNum) : 0;
        const safeInsCode = ['?', '.'].includes(String(insCode).trim()) ? '' : String(insCode || '').trim();
        const safeName = (name || 'UNK').toUpperCase();
        const label = residueLabel(safeSeqNum, safeInsCode);
        const fullKey = [safeChainId, label, safeName, recordType, kind].map(normalizeLabelPart).join(':');
        const hit = this._residueKeyMap.get(fullKey);
        if (hit) return this.residues.get(hit);

        const chain = this.ensureChain(safeChainId, chainType);
        const residueId = `${this.id}:${safeChainId}:${label}:${safeName}:${recordType}`;

        const residue = {
            id: residueId,
            chainId: safeChainId,
            seqNum: safeSeqNum,
            insCode: safeInsCode,
            label,
            name: safeName,
            atomIds: [],
            sse: SSEType.LOOP,
            order: chain.residueIds.length,

            chainType,
            recordType,
            kind,
            isProtein,
            isNucleic,
            isHeterogen,
            isWater,
            isUnknown,
        };

        this.residues.set(residueId, residue);
        chain.residueIds.push(residueId);
        this._residueKeyMap.set(fullKey, residueId);

        const simpleKey = `${safeChainId}:${label}`;
        if (!this._chainResidueKeyMap.has(simpleKey) || residue.isProtein || residue.isNucleic) {
            this._chainResidueKeyMap.set(simpleKey, residueId);
        }

        return residue;
    }

    getResidueByChainLabel(chainId, label) {
        const key = `${chainId}:${label}`;
        const residueId = this._chainResidueKeyMap.get(key);
        if (!residueId) return null;
        return this.residues.get(residueId) || null;
    }

    addAtom({
                atomId,
                atomName,
                element,
                x, y, z,
                occupancy = 1.0,
                bFactor = 0.0,
                residueId,
                recordType = RecordType.ATOM,
                altLoc = '',
                serial = atomId,
            }) {
        if (this.atoms.has(atomId)) return this.atoms.get(atomId);

        const positionIndex = this.coordinateStore.allocAtom(x, y, z);
        const atom = {
            id: atomId,
            serial,
            name: (atomName || '').toUpperCase(),
            element: (element || '').toUpperCase(),
            occupancy,
            bFactor,
            residueId,
            positionIndex,
            recordType,
            altLoc: ['?', '.'].includes(String(altLoc).trim()) ? '' : String(altLoc || '').trim(),
        };
        this.atoms.set(atomId, atom);

        const residue = this.residues.get(residueId);
        if (residue) residue.atomIds.push(atomId);

        return atom;
    }

    getAtom(atomId) {
        return this.atoms.get(atomId) || null;
    }

    setAtomPosition(atomId, x, y, z) {
        const atom = this.atoms.get(atomId);
        if (!atom) return false;
        this.coordinateStore.setXYZ(atom.positionIndex, x, y, z);
        return true;
    }

    getAtomPosition(atomId, out = [0, 0, 0]) {
        const atom = this.atoms.get(atomId);
        if (!atom) return null;
        return this.coordinateStore.getXYZ(atom.positionIndex, out);
    }

    getChainAtomIds(chainId) {
        const chain = this.chains.get(chainId);
        if (!chain) return [];
        const out = [];
        for (const rid of chain.residueIds) {
            const r = this.residues.get(rid);
            if (!r) continue;
            for (const aid of r.atomIds) out.push(aid);
        }
        return out;
    }
}