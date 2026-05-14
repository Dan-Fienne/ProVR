import * as THREE from "../../libs/three.module.js";

import {SSEType} from "../../domain/protein/ProteinConstants.js";
import {buildBackboneFrames} from "./BackboneFrameBuilder.js";
import {fitFramesByLegacyZigzag} from "./CartoonGeometryBuilder.js";

function isSecondarySSE(sse) {
    return sse === SSEType.HELIX || sse === SSEType.SHEET;
}

function vecToArray(v) {
    if (!v) return [0, 0, 0];
    if (Array.isArray(v)) return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
    return [Number(v.x) || 0, Number(v.y) || 0, Number(v.z) || 0];
}

function v3(value, fallback = [0, 0, 0]) {
    const p = vecToArray(value || fallback);
    return new THREE.Vector3(p[0], p[1], p[2]);
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
    for (const c of candidates.slice(1)) {
        const d = Math.abs(c.dot(tangent));
        if (d < bestDot) {
            best = c;
            bestDot = d;
        }
    }

    return projectPerpendicular(best, tangent).normalize();
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

function cloneNormalHint(point) {
    return point?.normalHint ? vecToArray(point.normalHint) : null;
}

function cloneTracePoint(point, patch = {}) {
    return {
        proteinId: point?.proteinId || '',
        chainId: point?.chainId || '',
        index: Number.isFinite(point?.index) ? point.index : 0,
        residueId: point?.residueId || null,
        residueName: point?.residueName || '',
        residueLabel: point?.residueLabel || '',
        residueKind: point?.residueKind || '',
        atomId: point?.atomId ?? null,
        atomName: point?.atomName || 'CA',
        sse: point?.sse || SSEType.LOOP,
        position: vecToArray(point?.position),
        normalHint: cloneNormalHint(point),
        ...patch,
    };
}

function samePosition(a, b, eps = 1e-5) {
    if (!a || !b) return false;
    const pa = vecToArray(a.position);
    const pb = vecToArray(b.position);
    return Math.abs(pa[0] - pb[0]) <= eps
        && Math.abs(pa[1] - pb[1]) <= eps
        && Math.abs(pa[2] - pb[2]) <= eps;
}

function pushUnique(out, point) {
    if (!point) return;
    const last = out[out.length - 1];
    if (last && samePosition(last, point)) return;
    out.push(point);
}

function pointFromFrame(frame, templatePoint, {
    role,
    index,
    boundarySSE,
    boundarySegmentIndex,
    contextOnly = false,
} = {}) {
    if (!frame?.position) return null;

    return cloneTracePoint(templatePoint, {
        chainId: templatePoint?.chainId || frame.chainId || '',
        index: Number.isFinite(index) ? index : (Number.isFinite(frame.sourceIndexFloat) ? frame.sourceIndexFloat : 0),
        residueId: contextOnly ? null : (frame.residueId || templatePoint?.residueId || null),
        residueLabel: `${role}:${frame.residueId || templatePoint?.residueLabel || ''}`,
        atomId: null,
        atomName: contextOnly ? 'cartoon_context' : 'cartoon_endpoint',
        sse: SSEType.LOOP,
        position: vecToArray(frame.position),
        normalHint: vecToArray(frame.normal),
        cartoonVirtualPoint: true,
        cartoonContextOnly: contextOnly,
        cartoonEndpointRole: role,
        cartoonBoundarySSE: boundarySSE,
        cartoonBoundarySegmentIndex: boundarySegmentIndex,
    });
}

function residueNormal(point, tangent, previousNormal = null) {
    let normal = point?.normalHint ? v3(point.normalHint) : null;
    if (!normal || normal.length() < 1e-8) normal = previousNormal ? previousNormal.clone() : fallbackNormal(tangent);

    normal = projectPerpendicular(normal, tangent);
    if (normal.length() < 1e-8) normal = previousNormal ? projectPerpendicular(previousNormal, tangent) : fallbackNormal(tangent);
    if (normal.length() < 1e-8) normal = fallbackNormal(tangent);
    else normal.normalize();

    if (previousNormal && normal.dot(previousNormal) < 0) normal.multiplyScalar(-1);
    return normal;
}

function normalizeFrame({position, tangent, normal, sourcePoint, sourceIndexFloat, t}) {
    const fixedTangent = safeUnit(tangent);
    let fixedNormal = projectPerpendicular(normal || fallbackNormal(fixedTangent), fixedTangent);
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

function clampVectorLength(vec, maxLength) {
    const out = vec.clone();
    if (Number.isFinite(maxLength) && maxLength > 1e-8 && out.length() > maxLength) out.setLength(maxLength);
    return out;
}

function tangentAtRenderAnchor(renderPositions, guidePositions, guideOffset, i, curvature, maxTangentFactor) {
    const p = renderPositions[i];
    const guideIndex = i + guideOffset;
    const prev = guidePositions[guideIndex - 1] || renderPositions[i - 1] || null;
    const next = guidePositions[guideIndex + 1] || renderPositions[i + 1] || null;

    let tangent = null;
    if (prev && next && prev.distanceTo(next) > 1e-8) {
        tangent = next.clone().sub(prev).multiplyScalar(0.5 * curvature);
    } else if (next && p.distanceTo(next) > 1e-8) {
        tangent = next.clone().sub(p).multiplyScalar(curvature);
    } else if (prev && p.distanceTo(prev) > 1e-8) {
        tangent = p.clone().sub(prev).multiplyScalar(curvature);
    } else {
        tangent = new THREE.Vector3(1, 0, 0);
    }

    const leftDistance = i > 0
        ? p.distanceTo(renderPositions[i - 1])
        : (prev ? p.distanceTo(prev) : 0);
    const rightDistance = i < renderPositions.length - 1
        ? p.distanceTo(renderPositions[i + 1])
        : (next ? p.distanceTo(next) : 0);
    const localSpan = Math.max(leftDistance, rightDistance, (leftDistance + rightDistance) * 0.5, 0.001);
    return clampVectorLength(tangent, localSpan * maxTangentFactor);
}

/**
 * Build Hermite frames for a loop as one multi-anchor curve.
 *
 * Important: the secondary-structure endpoint is only the boundary anchor.  All
 * real loop residue CA/backbone points remain as control anchors between the
 * two ends.  Neighbor frames just outside the rendered interval are used only to
 * estimate endpoint tangents; they are not rendered and they do not expand the
 * helix/sheet residue range.
 */
function buildMultiAnchorLoopFrames({
                                        anchors,
                                        leftContext = null,
                                        rightContext = null,
                                        smoothSegment = 20,
                                        smoothCurvature = 0.8,
                                        maxTangentFactor = 1.35,
                                    } = {}) {
    if (!anchors?.length) return [];
    if (anchors.length < 2) return [];

    const n = Math.max(4, Math.floor(smoothSegment));
    const renderPositions = anchors.map((point) => v3(point.position));
    const guidePoints = [];
    if (leftContext) pushUnique(guidePoints, leftContext);
    for (const anchor of anchors) pushUnique(guidePoints, anchor);
    if (rightContext) pushUnique(guidePoints, rightContext);

    const guideOffset = leftContext && samePosition(guidePoints[0], leftContext) ? 1 : 0;
    const guidePositions = guidePoints.map((point) => v3(point.position));

    const tangents = renderPositions.map((_, i) => tangentAtRenderAnchor(
        renderPositions,
        guidePositions,
        guideOffset,
        i,
        smoothCurvature,
        maxTangentFactor
    ));

    const normals = [];
    for (let i = 0; i < anchors.length; i += 1) {
        normals.push(residueNormal(anchors[i], safeUnit(tangents[i]), normals[i - 1] || null));
    }

    const frames = [];
    frames.push(normalizeFrame({
        position: renderPositions[0].clone(),
        tangent: tangents[0],
        normal: normals[0],
        sourcePoint: anchors[0],
        sourceIndexFloat: anchors[0]?.index || 0,
        t: 0,
    }));

    for (let i = 0; i < anchors.length - 1; i += 1) {
        const p0 = renderPositions[i];
        const p1 = renderPositions[i + 1];
        const chord = Math.max(0.001, p0.distanceTo(p1));

        // Clamp per-segment tangents so a short boundary gap cannot pull the
        // whole loop into a straight or kinked connector.  The curve still sees
        // all loop anchors, but each Hermite span is locally stable.
        const m0 = clampVectorLength(tangents[i], chord * maxTangentFactor);
        const m1 = clampVectorLength(tangents[i + 1], chord * maxTangentFactor);

        const n0 = normals[i];
        const n1 = normals[i + 1].dot(n0) < 0 ? normals[i + 1].clone().multiplyScalar(-1) : normals[i + 1];

        for (let ii = 1; ii <= n; ii += 1) {
            const t = ii / n;
            const position = hermitePoint(p0, p1, m0, m1, t);
            let tangent = hermiteTangent(p0, p1, m0, m1, t);
            if (tangent.length() < 1e-8) tangent = p1.clone().sub(p0);

            const normal = n0.clone().lerp(n1, t);
            const sourcePoint = t < 0.5 ? anchors[i] : anchors[i + 1];
            const sourceIndexFloat = (anchors[i]?.index || 0) + ((anchors[i + 1]?.index || anchors[i]?.index || 0) - (anchors[i]?.index || 0)) * t;

            frames.push(normalizeFrame({
                position,
                tangent,
                normal,
                sourcePoint,
                sourceIndexFloat,
                t,
            }));
        }
    }

    return frames;
}

export function visualFramesForCartoonSegment(segment, style) {
    if (!segment?.points?.length) return [];

    const rawFrames = buildBackboneFrames(segment.points, {
        smoothSegment: style.smoothSegment,
        smoothCurvature: style.smoothCurvature,
        sourceIndexOffset: segment.points[0]?.index || 0,
    });

    if (segment.sse === SSEType.SHEET) {
        return fitFramesByLegacyZigzag(rawFrames, style.smoothSegment);
    }

    return rawFrames;
}

function neighborFrames(segment, style) {
    return visualFramesForCartoonSegment(segment, style);
}

function boundaryFrame(frames, side) {
    if (!frames?.length) return null;
    return side === 'first' ? frames[0] : frames[frames.length - 1];
}

function contextFrame(frames, side, contextResidues = 1, smoothSegment = 20) {
    if (!frames?.length) return null;
    // One context residue roughly corresponds to one smoothed residue span, not
    // half of a long helix/sheet.  Using a local neighbor preserves the incoming
    // direction without pulling the loop toward the middle of the SSE segment.
    const stepFrames = Math.max(1, Math.floor(contextResidues)) * Math.max(1, Math.floor(smoothSegment));

    if (side === 'beforeLast') {
        return frames[Math.max(0, frames.length - 1 - stepFrames)] || null;
    }

    if (side === 'afterFirst') {
        return frames[Math.min(frames.length - 1, stepFrames)] || null;
    }

    return null;
}

/**
 * Build one continuous LOOP-owned tube path.
 *
 * Correct mental model:
 *   [left helix/sheet visual endpoint]
 *        -> every LOOP CA/backbone point, in residue order
 *        -> [right helix/sheet visual endpoint]
 *
 * The endpoint points do not replace the loop. They only provide the precise
 * visual boundary where the tube must enter/leave secondary structure.  The
 * loop itself is still controlled by every loop residue point.
 */
export function buildEndpointAwareLoopFrames({
                                                 chain,
                                                 segment,
                                                 segmentIndex,
                                                 style,
                                             } = {}) {
    if (!segment?.points?.length) return {frames: [], anchors: [], meta: {endpointAware: false}};

    const loopPoints = segment.points.map((point) => cloneTracePoint(point, {sse: SSEType.LOOP}));
    const anchors = [];
    const left = chain?.segments?.[segmentIndex - 1] || null;
    const right = chain?.segments?.[segmentIndex + 1] || null;

    let startSecondaryEndpoint = null;
    let endSecondaryEndpoint = null;
    let leftTangentContext = null;
    let rightTangentContext = null;

    if (style.endpointBridgeEnabled && isSecondarySSE(left?.sse)) {
        const frames = neighborFrames(left, style);
        const endpoint = boundaryFrame(frames, 'last');
        const context = contextFrame(frames, 'beforeLast', style.endpointBridgeContextResidues, style.smoothSegment);

        startSecondaryEndpoint = pointFromFrame(endpoint, loopPoints[0], {
            role: 'startSecondaryVisualEndpoint',
            index: left.endIndex,
            boundarySSE: left.sse,
            boundarySegmentIndex: segmentIndex - 1,
        });

        if (context && endpoint && context.position.distanceTo(endpoint.position) > 1e-5) {
            leftTangentContext = pointFromFrame(context, loopPoints[0], {
                role: 'leftTangentContextOnly',
                index: Math.max(0, left.endIndex - 1),
                boundarySSE: left.sse,
                boundarySegmentIndex: segmentIndex - 1,
                contextOnly: true,
            });
        }

        pushUnique(anchors, startSecondaryEndpoint);
    }

    for (const point of loopPoints) pushUnique(anchors, point);

    if (style.endpointBridgeEnabled && isSecondarySSE(right?.sse)) {
        const frames = neighborFrames(right, style);
        const endpoint = boundaryFrame(frames, 'first');
        const context = contextFrame(frames, 'afterFirst', style.endpointBridgeContextResidues, style.smoothSegment);

        endSecondaryEndpoint = pointFromFrame(endpoint, loopPoints[loopPoints.length - 1], {
            role: 'endSecondaryVisualEndpoint',
            index: right.startIndex,
            boundarySSE: right.sse,
            boundarySegmentIndex: segmentIndex + 1,
        });

        if (context && endpoint && context.position.distanceTo(endpoint.position) > 1e-5) {
            rightTangentContext = pointFromFrame(context, loopPoints[loopPoints.length - 1], {
                role: 'rightTangentContextOnly',
                index: right.startIndex + 1,
                boundarySSE: right.sse,
                boundarySegmentIndex: segmentIndex + 1,
                contextOnly: true,
            });
        }

        pushUnique(anchors, endSecondaryEndpoint);
    }

    const frames = buildMultiAnchorLoopFrames({
        anchors,
        leftContext: style.endpointBridgeUseContextTangents ? leftTangentContext : null,
        rightContext: style.endpointBridgeUseContextTangents ? rightTangentContext : null,
        smoothSegment: style.loopSplineSamplesPerResidue || style.smoothSegment,
        smoothCurvature: style.loopSplineTangentScale || style.smoothCurvature,
        maxTangentFactor: style.loopSplineMaxTangentFactor || 1.35,
    });

    return {
        frames,
        anchors,
        meta: {
            endpointAware: !!(startSecondaryEndpoint || endSecondaryEndpoint),
            mode: 'loop-owned-multi-anchor-hermite-spline-all-loop-points',
            anchorCount: anchors.length,
            renderAnchorCount: anchors.length,
            loopResidueAnchorCount: loopPoints.length,
            usesAllLoopResidueAnchors: true,
            startUsesSecondaryEndpoint: !!startSecondaryEndpoint,
            endUsesSecondaryEndpoint: !!endSecondaryEndpoint,
            startBoundarySSE: startSecondaryEndpoint ? left?.sse || null : null,
            endBoundarySSE: endSecondaryEndpoint ? right?.sse || null : null,
            startBoundarySegmentIndex: startSecondaryEndpoint ? segmentIndex - 1 : null,
            endBoundarySegmentIndex: endSecondaryEndpoint ? segmentIndex + 1 : null,
            leftTangentContextOnly: !!leftTangentContext,
            rightTangentContextOnly: !!rightTangentContext,
            tangentPolicy: style.endpointBridgeUseContextTangents
                ? 'neighbor-context-plus-all-loop-anchors'
                : 'all-loop-anchors-only',
            separateConnectorMeshes: false,
        },
    };
}
