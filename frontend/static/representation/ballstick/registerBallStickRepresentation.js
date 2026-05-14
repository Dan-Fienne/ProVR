import {BallStickRepresentation} from './BallStickRepresentation.js';

export function registerBallStickRepresentation(registry) {
    registry.register('ballstick', {
        factory: ({spec, context}) => new BallStickRepresentation({spec, context}),
        family: 'atomic',
        capabilities: {
            pickAtom: true,
            pickBond: true,
            pickResidue: false,
            pickResidueRange: false,
            pickChain: false,
            supportsIncrementalAtomUpdate: true,
            supportsPreviewTransform: true,
            requiresBondGraph: true,
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
                atomRadiusScale: 1.0,
                minAtomRadius: 0.12,
                maxAtomRadius: 0.42,
                bondRadius: 0.075,
                halfBondColor: true,
                bondInsetRatio: 0.62,
                opacity: 1.0,
                atomMetallic: 0.02,
                atomRoughness: 0.36,
                bondMetallic: 0.0,
                bondRoughness: 0.48,
            },
            geometry: {
                atomSegments: 20,
                bondSegments: 12,
                minBondSegmentLength: 1e-4,
                stretchedBondFactor: 2.25,
                bondTopology: {
                    force: false,
                    inferIfExistingBonds: true,
                    inferProteinInternal: true,
                    inferProteinPeptide: true,
                    inferNucleicInternal: true,
                    inferNucleicBackbone: true,
                    inferHeterogenInternal: true,
                    includeHydrogen: true,
                },
            },
            interaction: {
                pickable: true,
                pickAtoms: true,
                pickBonds: true,
                targetLevel: 'atom',
            },
        },
    });
}
