import {BondGraph} from './BondGraph.js';
import {SecondaryStructureModel} from './SecondaryStructureModel.js';
import {SelectionModel} from './SelectionModel.js';
import {createAtom, createChain, createResidue} from './ProteinEntities.js';
import {CoordinateStore} from './CoordinateStore.js';
import {normalizeProteinId, normalizeChainId, residueKey, compareResidueOrder} from './ProteinIdentity.js';
import {inferChainType} from './StructureClassifier.js';

export class ProteinModel {
    constructor({
                    id,
                    name = '',
                    coordinateStore = null,
                    metadata = {},
                } = {}) {
        if (!id) throw new Error('[ProteinModel] id is required');
        this.id = normalizeProteinId(id);
        this.name = name || this.id;
        this.coordinateStore = coordinateStore || new CoordinateStore();

        this.chains = new Map();
        this.residues = new Map();
        this.atoms = new Map();

        this.bondGraph = new BondGraph();
        this.secondary = new SecondaryStructureModel();
        this.secondaryStructure = this.secondary;
        this.selection = new SelectionModel();

        this.info = {
            format: '',
            source: '',
            classification: '',
            pdbId: '',
            bondTopology: null,
            metadata: {...metadata},
        };

        this.revision = 0;
        this.createdAt = new Date().toISOString();
        this.updatedAt = this.createdAt;
    }

    ensureChain(chainId, options = {}) {
        const id = normalizeChainId(chainId);
        if (!this.chains.has(id)) {
            this.chains.set(id, createChain({id, ...options}));
        }
        return this.chains.get(id);
    }

    addChain(input = {}) {
        const chain = createChain(input);
        if (!this.chains.has(chain.id)) this.chains.set(chain.id, chain);
        return this.chains.get(chain.id);
    }

    addResidue(input = {}) {
        const chain = this.ensureChain(input.chainId || 'A');
        const id = input.id || residueKey({
            proteinId: this.id,
            chainId: chain.id,
            seqNum: input.seqNum,
            insCode: input.insCode,
            name: input.name,
            recordType: input.recordType,
        });

        if (this.residues.has(id)) return this.residues.get(id);

        const residue = createResidue({
            proteinId: this.id,
            ...input,
            id,
            chainId: chain.id,
            order: input.order ?? chain.residueIds.length,
        });

        this.residues.set(residue.id, residue);
        if (!chain.residueIds.includes(residue.id)) chain.residueIds.push(residue.id);
        chain.type = inferChainType(this, chain.id);
        return residue;
    }

    addAtom(input = {}) {
        const residue = this.residues.get(input.residueId);
        if (!residue) throw new Error(`[ProteinModel] residue not found for atom: ${input.residueId}`);

        const positionIndex = input.positionIndex ?? this.coordinateStore.allocate(input.x, input.y, input.z);
        if (input.positionIndex != null && (input.x != null || input.y != null || input.z != null)) {
            this.coordinateStore.setXYZ(input.positionIndex, input.x || 0, input.y || 0, input.z || 0);
        }

        const atom = createAtom({
            ...input,
            positionIndex,
            recordType: input.recordType || residue.recordType,
        });

        if (this.atoms.has(atom.id)) return this.atoms.get(atom.id);

        this.atoms.set(atom.id, atom);
        if (!residue.atomIds.includes(atom.id)) residue.atomIds.push(atom.id);
        this.bondGraph.addAtom(atom.id);
        return atom;
    }

    getAtom(atomId) {
        return this.atoms.get(atomId) || this.atoms.get(Number(atomId)) || null;
    }

    getAtomPosition(atomId, out = null) {
        const atom = this.getAtom(atomId);
        if (!atom) return null;
        return this.coordinateStore.getXYZ(atom.positionIndex, out);
    }

    setAtomPosition(atomId, x, y, z) {
        const atom = this.getAtom(atomId);
        if (!atom) return false;
        if (Array.isArray(x)) this.coordinateStore.setXYZ(atom.positionIndex, x[0], x[1], x[2]);
        else this.coordinateStore.setXYZ(atom.positionIndex, x, y, z);
        return true;
    }

    getResidueAtoms(residueId) {
        const residue = this.residues.get(residueId);
        return residue ? residue.atomIds.map((id) => this.getAtom(id)).filter(Boolean) : [];
    }

    getChainResidues(chainId) {
        const chain = this.chains.get(chainId);
        return chain ? chain.residueIds.map((id) => this.residues.get(id)).filter(Boolean) : [];
    }

    getChainAtomIds(chainId) {
        const ids = [];
        for (const residue of this.getChainResidues(chainId)) ids.push(...residue.atomIds);
        return ids;
    }

    getResidueRange({chainId, start = null, end = null} = {}) {
        const residues = this.getChainResidues(chainId).sort(compareResidueOrder);
        return residues.filter((residue) => {
            const n = Number(residue.seqNum);
            if (start !== null && Number.isFinite(n) && n < Number(start)) return false;
            if (end !== null && Number.isFinite(n) && n > Number(end)) return false;
            return true;
        });
    }

    removeAtom(atomId) {
        const atom = this.getAtom(atomId);
        if (!atom) return false;
        const residue = this.residues.get(atom.residueId);
        if (residue) residue.atomIds = residue.atomIds.filter((id) => id !== atom.id);
        this.bondGraph.removeAtom(atom.id);
        this.coordinateStore.release(atom.positionIndex);
        this.atoms.delete(atom.id);
        this.bumpRevision('removeAtom');
        return true;
    }

    bounds({atomIds = null} = {}) {
        const indices = [];
        const ids = atomIds || [...this.atoms.keys()];
        for (const atomId of ids) {
            const atom = this.getAtom(atomId);
            if (atom) indices.push(atom.positionIndex);
        }
        return this.coordinateStore.bounds(indices);
    }

    forEachAtom(fn) {
        for (const atom of this.atoms.values()) fn(atom, this);
    }

    bumpRevision(_reason = '') {
        this.revision += 1;
        this.updatedAt = new Date().toISOString();
        return this.revision;
    }

    toJSON({includeCoordinates = true} = {}) {
        return {
            id: this.id,
            name: this.name,
            revision: this.revision,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            info: {...this.info},
            chains: [...this.chains.values()].map((c) => ({...c, residueIds: [...c.residueIds]})),
            residues: [...this.residues.values()].map((r) => ({...r, atomIds: [...r.atomIds]})),
            atoms: [...this.atoms.values()].map((a) => ({...a})),
            bonds: this.bondGraph.edges(),
            secondary: this.secondary.toJSON(),
            coordinates: includeCoordinates ? Array.from(this.coordinateStore.toTypedArray()) : null,
        };
    }

    summary() {
        return {
            id: this.id,
            name: this.name,
            revision: this.revision,
            atoms: this.atoms.size,
            residues: this.residues.size,
            chains: this.chains.size,
            bonds: this.bondGraph.summary().bonds,
            coordinates: this.coordinateStore.summary(),
            secondary: this.secondary.summary(),
        };
    }
}
