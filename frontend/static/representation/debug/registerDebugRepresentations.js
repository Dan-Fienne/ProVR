import {RepresentationFamily} from '../common/RepresentationCapabilities.js';
import {DebugAtomRepresentation} from './DebugAtomRepresentation.js';
import {DebugResidueRepresentation} from './DebugResidueRepresentation.js';
import {DebugBondRepresentation} from './DebugBondRepresentation.js';

export function registerDebugRepresentations(registryOrManager) {
    const register = registryOrManager.register.bind(registryOrManager);

    register('debug-atoms', {
        family: RepresentationFamily.DEBUG,
        description: 'Non-Three.js debug atom objects with atom PickTargets.',
        capabilities: {
            pickAtom: true,
            supportsIncrementalAtomUpdate: true,
        },
        factory: ({spec, context}) => new DebugAtomRepresentation({spec, context}),
    });

    register('debug-residues', {
        family: RepresentationFamily.DEBUG,
        description: 'Non-Three.js debug residue objects with residue PickTargets.',
        capabilities: {
            pickResidue: true,
        },
        factory: ({spec, context}) => new DebugResidueRepresentation({spec, context}),
    });

    register('debug-bonds', {
        family: RepresentationFamily.DEBUG,
        description: 'Non-Three.js debug bond objects with bond PickTargets.',
        capabilities: {
            pickBond: true,
            requiresBondGraph: true,
        },
        factory: ({spec, context}) => new DebugBondRepresentation({spec, context}),
    });
}
