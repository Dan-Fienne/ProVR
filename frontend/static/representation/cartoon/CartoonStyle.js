import {SSEType} from "../../domain/protein/ProteinConstants.js";

export const CartoonMeshKind = Object.freeze({
    LOOP: 'cartoonLegacyLoopTube',
    HELIX: 'cartoonLegacyHelixEllipse',
    SHEET: 'cartoonLegacySheetArrow',
    TRANSITION: 'cartoonLegacyTransitionTube',
    PICK_PROXY: 'cartoonPickProxy',
});

// Chain color: first chain defaults to green, matching the screenshot-style chain coloring.
const CHAIN_PALETTE = Object.freeze([
    0x22c55e, 0x3b82f6, 0xf97316, 0xa855f7, 0xef4444,
    0x14b8a6, 0xeab308, 0xec4899, 0x64748b, 0x84cc16,
]);

// SSE color: keep secondary-structure colors distinct.
// This is NOT the all-green screenshot mode; choose colorScheme='sse' to use these.
const SSE_COLORS = Object.freeze({
    [SSEType.HELIX]: 0xe15759,
    [SSEType.SHEET]: 0xedc948,
    [SSEType.LOOP]: 0xb8c0cc,
});

const RESIDUE_KIND_COLORS = Object.freeze({
    PROTEIN: 0x4e79a7,
    NUCLEIC: 0xb07aa1,
    HETEROGEN: 0xf28e2b,
    WATER: 0x74b9ff,
    UNKNOWN: 0x9ca3af,
});

export const DefaultCartoonStyle = Object.freeze({
    // Default is chain color, so one-chain structures look uniformly green.
    colorScheme: 'chain',
    opacity: 1.0,
    roughness: 0.30,
    metalness: 0.0,
    scale: 1.0,

    // old df/w3m-like smoothing
    smoothSegment: 19,
    smoothCurvature: 0.8,

    // old drawTube-like loop
    loopRadius: 0.18,
    loopRadialSegments: 10,

    // old drawEllipse: EllipseCurve(5 * radius, radius)
    helixEllipseRadius: 0.21,
    helixEllipseWidthMultiple: 5.0,
    helixEllipseSegments: 20,

    // old arrowFiller + drawArrowByPaths-like sheet arrow
    // These are now aligned with the actual old w3m config:
    // geom_cube_width=2.0, geom_cube_height=0.4,
    // geom_arrowhead_lower=3.6, geom_arrowhead_upper=0.4, geom_arrow_height=0.4.
    sheetBodyWidth: 2.0,
    sheetThickness: 0.4,
    sheetArrowBaseWidth: 3.6,
    sheetArrowTipWidth: 0.4,
    sheetArrowHeight: 0.4,

    // Like painter.showRibbon* concat previous residue's last path point
    segmentPaddingResidues: 0,

    // old HEAD/FOOT transition behavior:
    // At secondary-structure boundaries the old painter draws part of the boundary residue as tube.
    transitionTubeEnabled: false,
    transitionHalfResidue: 0.35,
    transitionTubeRadiusScale: 0.85,
    boundaryConnectorEnabled: false,
    boundaryConnectorContextResidues: 2,
    boundaryConnectorRadiusScale: 1.0,
    boundaryTubeHalfResidue: 0.55,
    loopVisibleHalfResidue: 0.58,
    loopIntervalMergeGap: 0.08,

    // Final boundary logic: solve LOOP as one Hermite tube whose optional
    // start/end anchors are neighboring helix/sheet visual endpoints.
    // These old endpointBridge* names stay for validation/UI compatibility,
    // but this version no longer creates separate connector meshes.
    endpointBridgeEnabled: true,
    endpointBridgeSamples: 12,
    endpointBridgeTangentScale: 0.85,
    endpointBridgeRadiusScale: 1.0,
    endpointBridgeContextResidues: 1,
    endpointBridgeUseContextTangents: true,

    // LOOP-owned all-point spline controls.  The old endpointBridge* UI names
    // remain, but these are the actual loop curve controls.
    loopSplineSamplesPerResidue: 19,
    loopSplineTangentScale: 0.80,
    loopSplineMaxTangentFactor: 1.35,

    // If two secondary structures are consecutive with no explicit LOOP segment
    // between them, draw a short Hermite tube between their visual endpoints.
    secondaryBoundaryTubeEnabled: true,
    secondaryBoundaryTubeSamples: 14,
    secondaryBoundaryTubeRadiusScale: 1.0,
    secondaryBoundaryTubeContextResidues: 1,
    secondaryBoundaryTubeTangentScale: 0.75,
    secondaryBoundaryTubeMaxTangentFactor: 1.20,

    pickProxyRadius: 0.90,
    pickProxyOpacity: 0.0,
});

function finiteNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function hashString(value = '') {
    let hash = 0;
    for (const ch of String(value || 'A')) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return Math.abs(hash);
}

export function chainColor(chainId = '') {
    return CHAIN_PALETTE[hashString(chainId || 'A') % CHAIN_PALETTE.length];
}

export function cartoonColor({
                                 chainId = '',
                                 sse = SSEType.LOOP,
                                 residueKind = '',
                                 colorScheme = 'chain',
                             } = {}) {
    switch (colorScheme) {
        case 'sse':
            return SSE_COLORS[sse] ?? SSE_COLORS[SSEType.LOOP];
        case 'kind':
        case 'residueKind':
            return RESIDUE_KIND_COLORS[residueKind] ?? RESIDUE_KIND_COLORS.UNKNOWN;
        case 'chain':
        default:
            return chainColor(chainId);
    }
}

export function resolveCartoonStyle(style = {}) {
    return {
        colorScheme: style.colorScheme || DefaultCartoonStyle.colorScheme,
        opacity: finiteNumber(style.opacity, DefaultCartoonStyle.opacity),
        roughness: finiteNumber(style.roughness, DefaultCartoonStyle.roughness),
        metalness: finiteNumber(style.metalness, DefaultCartoonStyle.metalness),
        scale: finiteNumber(style.scale ?? style.radiusScale, DefaultCartoonStyle.scale),

        smoothSegment: Math.max(4, Math.floor(finiteNumber(style.smoothSegment, DefaultCartoonStyle.smoothSegment))),
        smoothCurvature: finiteNumber(style.smoothCurvature, DefaultCartoonStyle.smoothCurvature),

        loopRadius: finiteNumber(style.loopRadius, DefaultCartoonStyle.loopRadius),
        loopRadialSegments: Math.max(6, Math.floor(finiteNumber(style.loopRadialSegments, DefaultCartoonStyle.loopRadialSegments))),

        helixEllipseRadius: finiteNumber(style.helixEllipseRadius, DefaultCartoonStyle.helixEllipseRadius),
        helixEllipseWidthMultiple: finiteNumber(style.helixEllipseWidthMultiple, DefaultCartoonStyle.helixEllipseWidthMultiple),
        helixEllipseSegments: Math.max(8, Math.floor(finiteNumber(style.helixEllipseSegments, DefaultCartoonStyle.helixEllipseSegments))),

        sheetBodyWidth: finiteNumber(style.sheetBodyWidth ?? style.sheetWidth, DefaultCartoonStyle.sheetBodyWidth),
        sheetThickness: finiteNumber(style.sheetThickness, DefaultCartoonStyle.sheetThickness),
        sheetArrowBaseWidth: finiteNumber(style.sheetArrowBaseWidth ?? style.sheetArrowWidth, DefaultCartoonStyle.sheetArrowBaseWidth),
        sheetArrowTipWidth: finiteNumber(style.sheetArrowTipWidth, DefaultCartoonStyle.sheetArrowTipWidth),
        sheetArrowHeight: finiteNumber(style.sheetArrowHeight, DefaultCartoonStyle.sheetArrowHeight),

        segmentPaddingResidues: Math.max(0, Math.floor(finiteNumber(style.segmentPaddingResidues, DefaultCartoonStyle.segmentPaddingResidues))),

        transitionTubeEnabled: style.transitionTubeEnabled ?? DefaultCartoonStyle.transitionTubeEnabled,
        transitionHalfResidue: Math.max(0.10, Math.min(0.95, finiteNumber(style.transitionHalfResidue, DefaultCartoonStyle.transitionHalfResidue))),
        transitionTubeRadiusScale: finiteNumber(style.transitionTubeRadiusScale, DefaultCartoonStyle.transitionTubeRadiusScale),
        boundaryConnectorEnabled: style.boundaryConnectorEnabled ?? DefaultCartoonStyle.boundaryConnectorEnabled,
        boundaryConnectorContextResidues: Math.max(1, Math.floor(finiteNumber(style.boundaryConnectorContextResidues, DefaultCartoonStyle.boundaryConnectorContextResidues))),
        boundaryConnectorRadiusScale: finiteNumber(style.boundaryConnectorRadiusScale, DefaultCartoonStyle.boundaryConnectorRadiusScale),
        boundaryTubeHalfResidue: Math.max(0.25, Math.min(0.95, finiteNumber(style.boundaryTubeHalfResidue, DefaultCartoonStyle.boundaryTubeHalfResidue))),
        loopVisibleHalfResidue: Math.max(0.25, Math.min(0.95, finiteNumber(style.loopVisibleHalfResidue, DefaultCartoonStyle.loopVisibleHalfResidue))),
        loopIntervalMergeGap: finiteNumber(style.loopIntervalMergeGap, DefaultCartoonStyle.loopIntervalMergeGap),

        endpointBridgeEnabled: style.endpointBridgeEnabled !== false,
        endpointBridgeSamples: Math.max(4, Math.floor(finiteNumber(style.endpointBridgeSamples, DefaultCartoonStyle.endpointBridgeSamples))),
        endpointBridgeTangentScale: finiteNumber(style.endpointBridgeTangentScale, DefaultCartoonStyle.endpointBridgeTangentScale),
        endpointBridgeRadiusScale: finiteNumber(style.endpointBridgeRadiusScale, DefaultCartoonStyle.endpointBridgeRadiusScale),
        endpointBridgeContextResidues: Math.max(1, Math.floor(finiteNumber(style.endpointBridgeContextResidues, DefaultCartoonStyle.endpointBridgeContextResidues))),
        endpointBridgeUseContextTangents: style.endpointBridgeUseContextTangents !== false,

        loopSplineSamplesPerResidue: Math.max(4, Math.floor(finiteNumber(style.loopSplineSamplesPerResidue ?? style.endpointBridgeSamples, DefaultCartoonStyle.loopSplineSamplesPerResidue))),
        loopSplineTangentScale: finiteNumber(style.loopSplineTangentScale ?? style.endpointBridgeTangentScale ?? style.smoothCurvature, DefaultCartoonStyle.loopSplineTangentScale),
        loopSplineMaxTangentFactor: finiteNumber(style.loopSplineMaxTangentFactor, DefaultCartoonStyle.loopSplineMaxTangentFactor),

        secondaryBoundaryTubeEnabled: style.secondaryBoundaryTubeEnabled !== false,
        secondaryBoundaryTubeSamples: Math.max(4, Math.floor(finiteNumber(style.secondaryBoundaryTubeSamples, DefaultCartoonStyle.secondaryBoundaryTubeSamples))),
        secondaryBoundaryTubeRadiusScale: finiteNumber(style.secondaryBoundaryTubeRadiusScale, DefaultCartoonStyle.secondaryBoundaryTubeRadiusScale),
        secondaryBoundaryTubeContextResidues: Math.max(1, Math.floor(finiteNumber(style.secondaryBoundaryTubeContextResidues, DefaultCartoonStyle.secondaryBoundaryTubeContextResidues))),
        secondaryBoundaryTubeTangentScale: finiteNumber(style.secondaryBoundaryTubeTangentScale, DefaultCartoonStyle.secondaryBoundaryTubeTangentScale),
        secondaryBoundaryTubeMaxTangentFactor: finiteNumber(style.secondaryBoundaryTubeMaxTangentFactor, DefaultCartoonStyle.secondaryBoundaryTubeMaxTangentFactor),

        pickProxyRadius: finiteNumber(style.pickProxyRadius, DefaultCartoonStyle.pickProxyRadius),
        pickProxyOpacity: finiteNumber(style.pickProxyOpacity, DefaultCartoonStyle.pickProxyOpacity),
    };
}

export function scaled(value, style) {
    return value * style.scale;
}
