import {ChainType, SSEType} from './ProteinConstants.js';
import {BondGraph} from './BondGraph.js';
import {SecondaryStructureModel} from './SecondaryStructureModel.js';
import {SelectionModel} from './SelectionModel.js';

function residueLabel(seqNum, insCode = '') {
    return `${seqNum}${insCode || ''}`;
}

export class ProteinModel {
    constructor({proteinId, coordinateStore}) {
        this.id = proteinId;
        this.coordinateStore = coordinateStore;

        this.revision = 0;
        this.info = {pdbId: proteinId, classification: ''};

        this.chains = new Map();
        this.residues = new Map();
        this.atoms = new Map();

        this.bondGraph = new BondGraph();
        this.secondary = new SecondaryStructureModel();
        this.selection = new SelectionModel();

        this._chainResidueKeyMap = new Map();
    }

    bumpRevision() {
        this.revision += 1;
        return this.revision;
    }

    ensureChain(chainId, chainType = ChainType.UNK) {
        if (!this.chains.has(chainId)) {
            this.chains.set(chainId, {
                id: chainId,
                type: chainType,
                residueIds: [],
                previewTransform: null,
            });
        } else {
            const c = this.chains.get(chainId);
            if (c.type === ChainType.UNK && chainType !== ChainType.UNK) c.type = chainType;
        }
        return this.chains.get(chainId);
    }

    addResidue({chainId, seqNum, insCode = '', name, chainType = ChainType.UNK}) {
        const label = residueLabel(seqNum, insCode);
        const key = `${chainId}:${label}`;
        const hit = this._chainResidueKeyMap.get(key);
        if (hit) return this.residues.get(hit);

        const chain = this.ensureChain(chainId, chainType);
        const residueId = `${this.id}:${chainId}:${label}`;

        const residue = {
            id: residueId,
            chainId,
            seqNum,
            insCode,
            label,
            name: (name || 'UNK').toUpperCase(),
            atomIds: [],
            sse: SSEType.LOOP,
            order: chain.residueIds.length,
        };

        this.residues.set(residueId, residue);
        chain.residueIds.push(residueId);
        this._chainResidueKeyMap.set(key, residueId);
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
                residueId
            }) {
        if (this.atoms.has(atomId)) return this.atoms.get(atomId);

        const positionIndex = this.coordinateStore.allocAtom(x, y, z);
        const atom = {
            id: atomId,
            name: (atomName || '').toUpperCase(),
            element: (element || '').toUpperCase(),
            occupancy,
            bFactor,
            residueId,
            positionIndex,
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