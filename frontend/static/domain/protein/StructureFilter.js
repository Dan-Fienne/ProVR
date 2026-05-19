import {ResidueKind} from './ProteinConstants.js';

function makeSet(value) {
    if (!value) return null;
    if (value instanceof Set) return value;
    if (Array.isArray(value)) return new Set(value);
    return new Set([value]);
}

export function normalizeStructureFilter(options = {}) {
    return {
        protein: options.protein !== false,
        nucleic: options.nucleic !== false,
        heterogen: options.heterogen !== false,
        water: options.water === true,
        unknown: options.unknown === true,
        chainIds: makeSet(options.chainIds),
        residueIds: makeSet(options.residueIds),
        atomIds: makeSet(options.atomIds),
        predicate: typeof options.predicate === 'function' ? options.predicate : null,
        bondPredicate: typeof options.bondPredicate === 'function' ? options.bondPredicate : null,
    };
}

export function createStructureFilter(options = {}) {
    const spec = normalizeStructureFilter(options);

    function acceptResidue(residue) {
        if (!residue) return false;
        if (spec.residueIds && !spec.residueIds.has(residue.id)) return false;
        if (spec.chainIds && !spec.chainIds.has(residue.chainId)) return false;

        if (residue.kind === ResidueKind.PROTEIN && !spec.protein) return false;
        if (residue.kind === ResidueKind.NUCLEIC && !spec.nucleic) return false;
        if (residue.kind === ResidueKind.HETEROGEN && !spec.heterogen) return false;
        if (residue.kind === ResidueKind.WATER && !spec.water) return false;
        if (residue.kind === ResidueKind.UNKNOWN && !spec.unknown) return false;

        if (spec.predicate && !spec.predicate({residue})) return false;
        return true;
    }

    function acceptAtom(atom, model = null) {
        if (!atom) return false;
        if (spec.atomIds && !spec.atomIds.has(atom.id)) return false;
        const residue = model?.residues?.get?.(atom.residueId) || null;
        if (residue && !acceptResidue(residue)) return false;
        if (spec.predicate && !spec.predicate({atom, residue})) return false;
        return true;
    }

    function acceptBond(atomA, atomB, model = null) {
        if (!atomA || !atomB) return false;
        if (!acceptAtom(atomA, model)) return false;
        if (!acceptAtom(atomB, model)) return false;
        if (spec.bondPredicate && !spec.bondPredicate({atomA, atomB, model})) return false;
        return true;
    }

    return {
        spec,
        acceptResidue,
        acceptAtom,
        acceptBond,
        explain() {
            return {
                protein: spec.protein,
                nucleic: spec.nucleic,
                heterogen: spec.heterogen,
                water: spec.water,
                unknown: spec.unknown,
                chainIds: spec.chainIds ? [...spec.chainIds] : null,
                residueIds: spec.residueIds ? [...spec.residueIds] : null,
                atomIds: spec.atomIds ? [...spec.atomIds] : null,
                hasPredicate: !!spec.predicate,
                hasBondPredicate: !!spec.bondPredicate,
            };
        },
    };
}
