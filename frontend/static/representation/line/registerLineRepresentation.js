import {LineRepresentation} from './LineRepresentation.js';

export function registerLineRepresentation(registryOrManager) {
    registryOrManager.register('line', {
        factory: ({spec, context}) => new LineRepresentation({spec, context}),
        family: 'atomic',
        capabilities: {
            pickAtom: false,
            pickBond: true,
            pickResidue: false,
            pickChain: false,
            supportsIncrementalAtomUpdate: false,
            requiresBondTopology: true,
            rendersThreeObjects: true,
        },
        defaults: {
            filter: {
                protein: true,
                nucleic: true,
                heterogen: true,
                water: false,
                unknown: false,
            },
            style: {
                colorScheme: 'element',
                opacity: 1.0,
            },
            geometry: {
                bondTopology: {},
            },
            interaction: {
                pickable: true,
                targetLevel: 'bond',
            },
        },
    });
}
