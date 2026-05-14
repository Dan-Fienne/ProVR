import {CartoonRepresentation} from './CartoonRepresentation.js';

export function registerCartoonRepresentation(registryOrManager) {
    registryOrManager.register('cartoon', {
        factory: ({spec, context}) => new CartoonRepresentation({spec, context}),
        family: 'trace',
        capabilities: {
            pickAtom: true,
            pickBond: false,
            pickResidue: true,
            pickResidueRange: true,
            pickChain: true,
            supportsIncrementalAtomUpdate: false,
            requiresBackboneTrace: true,
            requiresSSE: true,
            rendersThreeObjects: true,
            supportsCartoonPickProxies: true,
            visualMeshPickableByDefault: true,
            usesLegacyDrawingMethod: true,
            usesLegacyZigzagFix: true,
            usesLoopOwnedAllPointSpline: true,
            usesSecondaryBoundaryHermiteTube: true,
            usesRangeSafeDrawing: true,
        },
        defaults: {
            filter: {
                protein: true,
                nucleic: true,
                heterogen: false,
                water: false,
                unknown: false,
            },
            style: {
                colorScheme: 'chain',
                opacity: 1.0,
                scale: 1.0,
                roughness: 0.30,
                metalness: 0.0,

                smoothSegment: 19,
                smoothCurvature: 0.8,

                loopRadius: 0.18,
                loopRadialSegments: 10,

                helixEllipseRadius: 0.21,
                helixEllipseWidthMultiple: 5.0,
                helixEllipseSegments: 20,

                sheetBodyWidth: 2.0,
                sheetThickness: 0.4,
                sheetArrowBaseWidth: 3.6,
                sheetArrowTipWidth: 0.4,
                sheetArrowHeight: 0.4,

                // Range safety: visual SSE geometry is not allowed to expand into neighboring segments.
                segmentPaddingResidues: 0,

                // Boundary continuity is handled by loop-owned splines and direct SSE-SSE tubes, not overlapping SSE meshes.
                transitionTubeEnabled: false,
                transitionHalfResidue: 0.35,
                transitionTubeRadiusScale: 0.85,
                boundaryConnectorEnabled: false,
                boundaryConnectorContextResidues: 2,
                boundaryConnectorRadiusScale: 1.0,
                boundaryTubeHalfResidue: 0.55,
                loopVisibleHalfResidue: 0.58,
                loopIntervalMergeGap: 0.08,

                endpointBridgeEnabled: true,
                endpointBridgeSamples: 12,
                endpointBridgeTangentScale: 0.85,
                endpointBridgeRadiusScale: 1.0,
                endpointBridgeContextResidues: 1,
                endpointBridgeUseContextTangents: true,

                pickProxyRadius: 0.90,
                pickProxyOpacity: 0.0,
            },
            geometry: {
                curveType: 'legacyHermite',
                livePreview: false,
            },
            interaction: {
                pickable: true,
                pickProxies: true,
                visualMeshPickable: true,
                targetLevel: 'residueRange',
            },
        },
    });
}
