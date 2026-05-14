import * as THREE from "../../libs/three.module.js";

import {SSEType} from "../../domain/protein/ProteinConstants.js";

function isSecondarySSE(sse) {
    return sse === SSEType.HELIX || sse === SSEType.SHEET;
}

function safeUnit(vec, fallback = new THREE.Vector3(1, 0, 0)) {
    if (!vec || vec.length() < 1e-8) return fallback.clone().normalize();
    return vec.clone().normalize();
}

function projectPerpendicular(vec, tangent) {
    return vec.clone().addScaledVector(tangent, -vec.dot(tangent));
}

function fallbackNormal(tangent) {
    const candidates = [
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 1),
    ];

    let best = candidates[0];
    let bestDot = Math.abs(best.dot(tangent));
    for (const candidate of candidates.slice(1)) {
        const dot = Math.abs(candidate.dot(tangent));
        if (dot < bestDot) {
            best = candidate;
            bestDot = dot;
        }
    }

    return projectPerpendicular(best, tangent).normalize();
}

function normalizeFrame({position, tangent, normal, sourcePoint = null, sourceIndexFloat = 0, t = 0}) {
    const fixedTangent = safeUnit(tangent);
    let fixedNormal = normal?.clone?.() || fallbackNormal(fixedTangent);
    fixedNormal = projectPerpendicular(fixedNormal, fixedTangent);
    if (fixedNormal.length() < 1e-8) fixedNormal = fallbackNormal(fixedTangent);
    else fixedNormal.normalize();

    let binormal = new THREE.Vector3().crossVectors(fixedTangent, fixedNormal);
    if (binormal.length() < 1e-8) binormal = fallbackNormal(fixedTangent);
    else binormal.normalize();

    fixedNormal = new THREE.Vector3().crossVectors(binormal, fixedTangent).normalize();

    return {
        position,
        tangent: fixedTangent,
        normal: fixedNormal,
        binormal,
        sourcePoint,
        sourceIndexFloat,
        residueId: sourcePoint?.residueId || null,
        chainId: sourcePoint?.chainId || '',
        sse: sourcePoint?.sse || SSEType.LOOP,
        t,
    };
}

function hermitePoint(p0, p1, m0, m1, t) {
    const tt = t * t;
    const ttt = tt * t;

    const h00 = 2 * ttt - 3 * tt + 1;
    const h10 = ttt - 2 * tt + t;
    const h01 = -2 * ttt + 3 * tt;
    const h11 = ttt - tt;

    return p0.clone().multiplyScalar(h00)
        .add(m0.clone().multiplyScalar(h10))
        .add(p1.clone().multiplyScalar(h01))
        .add(m1.clone().multiplyScalar(h11));
}

function hermiteTangent(p0, p1, m0, m1, t) {
    const tt = t * t;

    const dh00 = 6 * tt - 6 * t;
    const dh10 = 3 * tt - 4 * t + 1;
    const dh01 = -6 * tt + 6 * t;
    const dh11 = 3 * tt - 2 * t;

    return p0.clone().multiplyScalar(dh00)
        .add(m0.clone().multiplyScalar(dh10))
        .add(p1.clone().multiplyScalar(dh01))
        .add(m1.clone().multiplyScalar(dh11));
}

function clampVectorLength(vec, maxLength) {
    const out = vec.clone();
    if (Number.isFinite(maxLength) && maxLength > 1e-8 && out.length() > maxLength) out.setLength(maxLength);
    return out;
}

function frameAtResidueContext(record, side, contextResidues, smoothSegment) {
    const frames = record?.visualFrames || [];
    if (!frames.length) return null;
    const step = Math.max(1, Math.floor(contextResidues || 1)) * Math.max(1, Math.floor(smoothSegment || 20));

    if (side === 'beforeLast') {
        return frames[Math.max(0, frames.length - 1 - step)] || null;
    }

    if (side === 'afterFirst') {
        return frames[Math.min(frames.length - 1, step)] || null;
    }

    return null;
}

function endpointSourcePoint(record, side) {
    const points = record?.segment?.points || [];
    if (!points.length) return null;
    return side === 'left' ? points[points.length - 1] : points[0];
}

function syntheticBoundaryPoint(record, side, frame) {
    const source = endpointSourcePoint(record, side);
    return {
        proteinId: source?.proteinId || '',
        chainId: source?.chainId || record?.chain?.chainId || '',
        index: Number.isFinite(source?.index) ? source.index : 0,
        residueId: source?.residueId || null,
        residueName: source?.residueName || '',
        residueLabel: source?.residueLabel || '',
        residueKind: source?.residueKind || '',
        atomId: null,
        atomName: 'cartoon_secondary_boundary_endpoint',
        sse: SSEType.LOOP,
        position: [frame.position.x, frame.position.y, frame.position.z],
        normalHint: [frame.normal.x, frame.normal.y, frame.normal.z],
        cartoonVirtualPoint: true,
        cartoonEndpointRole: side === 'left' ? 'leftSecondaryVisualEndpoint' : 'rightSecondaryVisualEndpoint',
        cartoonBoundarySSE: record?.sse || record?.segment?.sse || null,
        cartoonBoundarySegmentIndex: record?.segmentIndex ?? null,
    };
}

function makeEndpointTangent({endpoint, context, fallbackDirection, scale, maxLength}) {
    let tangent = null;
    if (endpoint?.position && context?.position && endpoint.position.distanceTo(context.position) > 1e-6) {
        tangent = endpoint.position.clone().sub(context.position);
    } else {
        tangent = fallbackDirection.clone();
    }

    if (tangent.length() < 1e-8) tangent = fallbackDirection.clone();
    tangent.multiplyScalar(scale);
    return clampVectorLength(tangent, maxLength);
}

/**
 * Build a tube for the case where two secondary-structure segments touch with
 * no explicit LOOP segment between them, for example HELIX -> SHEET.
 *
 * This is intentionally NOT a residue-range expansion.  It is a visual boundary
 * tube from the left SSE visual endpoint to the right SSE visual endpoint, with
 * endpoint tangents inferred from the two SSE interiors.
 */
export function buildSecondaryBoundaryTubeFrames({leftRecord, rightRecord, style} = {}) {
    if (!style?.secondaryBoundaryTubeEnabled) return {frames: [], meta: {enabled: false}};
    if (!isSecondarySSE(leftRecord?.sse) || !isSecondarySSE(rightRecord?.sse)) return {frames: [], meta: {enabled: false}};
    if (leftRecord?.chain?.chainId !== rightRecord?.chain?.chainId) return {frames: [], meta: {enabled: false}};

    const leftEndpoint = leftRecord.lastFrame;
    const rightEndpoint = rightRecord.firstFrame;
    if (!leftEndpoint?.position || !rightEndpoint?.position) return {frames: [], meta: {enabled: false}};

    const p0 = leftEndpoint.position.clone();
    const p1 = rightEndpoint.position.clone();
    const chord = p0.distanceTo(p1);
    if (chord < 1e-5) return {frames: [], meta: {enabled: false, reason: 'coincident-endpoints'}};

    const leftContext = frameAtResidueContext(
        leftRecord,
        'beforeLast',
        style.secondaryBoundaryTubeContextResidues,
        style.smoothSegment
    );
    const rightContext = frameAtResidueContext(
        rightRecord,
        'afterFirst',
        style.secondaryBoundaryTubeContextResidues,
        style.smoothSegment
    );

    const fallback = p1.clone().sub(p0);
    const maxLength = chord * Math.max(0.1, style.secondaryBoundaryTubeMaxTangentFactor || 1.2);
    const scale = Number.isFinite(style.secondaryBoundaryTubeTangentScale)
        ? style.secondaryBoundaryTubeTangentScale
        : 0.75;

    const m0 = makeEndpointTangent({
        endpoint: leftEndpoint,
        context: leftContext,
        fallbackDirection: fallback,
        scale,
        maxLength,
    });

    // End derivative must point in the parametric direction of the curve
    // (left endpoint -> right endpoint), so it follows the beginning of the
    // right secondary structure: rightEndpoint -> rightContext.
    let m1 = null;
    if (rightContext?.position && rightEndpoint.position.distanceTo(rightContext.position) > 1e-6) {
        m1 = rightContext.position.clone().sub(rightEndpoint.position).multiplyScalar(scale);
    } else {
        m1 = fallback.clone().multiplyScalar(scale);
    }
    m1 = clampVectorLength(m1, maxLength);

    const n0 = leftEndpoint.normal?.clone?.() || fallbackNormal(safeUnit(m0, fallback));
    let n1 = rightEndpoint.normal?.clone?.() || n0.clone();
    if (n1.dot(n0) < 0) n1.multiplyScalar(-1);

    const source0 = syntheticBoundaryPoint(leftRecord, 'left', leftEndpoint);
    const source1 = syntheticBoundaryPoint(rightRecord, 'right', rightEndpoint);
    const samples = Math.max(4, Math.floor(style.secondaryBoundaryTubeSamples || 12));
    const frames = [];

    for (let i = 0; i <= samples; i += 1) {
        const t = i / samples;
        const position = hermitePoint(p0, p1, m0, m1, t);
        let tangent = hermiteTangent(p0, p1, m0, m1, t);
        if (tangent.length() < 1e-8) tangent = fallback.clone();
        const normal = n0.clone().lerp(n1, t);
        const sourcePoint = t < 0.5 ? source0 : source1;
        const sourceIndexFloat = (source0.index || 0) + ((source1.index || source0.index || 0) - (source0.index || 0)) * t;

        frames.push(normalizeFrame({position, tangent, normal, sourcePoint, sourceIndexFloat, t}));
    }

    return {
        frames,
        meta: {
            enabled: true,
            mode: 'sse-sse-boundary-hermite-tube',
            leftSSE: leftRecord.sse,
            rightSSE: rightRecord.sse,
            leftSegmentIndex: leftRecord.segmentIndex,
            rightSegmentIndex: rightRecord.segmentIndex,
            leftResidueId: source0.residueId,
            rightResidueId: source1.residueId,
            hasLeftContext: !!leftContext,
            hasRightContext: !!rightContext,
            sampleCount: frames.length,
            tangentPolicy: 'secondary-interior-context-to-secondary-visual-endpoint',
        },
    };
}
