import * as THREE from "../../libs/three.webgpu.js";

function v3(a, fallback = [0, 0, 0]) {
    const p = a || fallback;
    return new THREE.Vector3(Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0);
}

function safeUnit(vec, fallback = new THREE.Vector3(1, 0, 0)) {
    if (!vec || vec.length() < 1e-8) return fallback.clone().normalize();
    return vec.clone().normalize();
}

function projectPerpendicular(v, tangent) {
    return v.clone().addScaledVector(tangent, -v.dot(tangent));
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

function hermite(p0, p1, m0, m1, t) {
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

function computeTangents(positions, curvature) {
    const len = positions.length;
    const out = [];

    if (len === 1) return [new THREE.Vector3(1, 0, 0)];
    if (len === 2) {
        const d = positions[1].clone().sub(positions[0]).multiplyScalar(curvature);
        return [d.clone(), d.clone()];
    }

    for (let i = 0; i < len; i += 1) {
        if (i === 0) {
            // Old w3m endpoint style:
            // k * (p1 - p0) - k/4 * (p2 - p0)
            out.push(
                positions[1].clone().sub(positions[0]).multiplyScalar(curvature)
                    .add(positions[2].clone().sub(positions[0]).multiplyScalar(-curvature / 4))
            );
        } else if (i === len - 1) {
            // k * (pn - p(n-1)) - k/4 * (pn - p(n-2))
            out.push(
                positions[i].clone().sub(positions[i - 1]).multiplyScalar(curvature)
                    .add(positions[i].clone().sub(positions[i - 2]).multiplyScalar(-curvature / 4))
            );
        } else {
            out.push(
                positions[i + 1].clone().sub(positions[i - 1]).multiplyScalar(curvature)
            );
        }
    }

    return out;
}

function computeResidueNormals(points, positions, tangents) {
    const normals = [];
    let last = null;

    for (let i = 0; i < points.length; i += 1) {
        let tangent = safeUnit(tangents[i]);
        let normal = points[i]?.normalHint ? v3(points[i].normalHint) : null;

        if (!normal || normal.length() < 1e-8) {
            normal = last ? last.clone() : fallbackNormal(tangent);
        }

        normal = projectPerpendicular(normal, tangent);
        if (normal.length() < 1e-8) normal = fallbackNormal(tangent);
        else normal.normalize();

        // old code's beta-sheet normal turnover fix:
        // if current normal is opposite to last normal, flip it.
        if (last && normal.dot(last) < 0) normal.multiplyScalar(-1);

        normals.push(normal);
        last = normal.clone();
    }

    return normals;
}

/**
 * Legacy-inspired natural frame.
 *
 * This intentionally follows the old df/w3m idea:
 * - Hermite smoothing between CA/main-chain guide points;
 * - tangent from Hermite derivative;
 * - normal linearly stepped between residue normals;
 * - binormal = tangent x normal_tmp;
 * - normal = binormal x tangent.
 */
export function buildBackboneFrames(points, {
    smoothSegment = 20,
    smoothCurvature = 0.8,
    sourceIndexOffset = 0,
} = {}) {
    if (!points?.length) return [];

    const n = smoothSegment % 2 ? smoothSegment + 1 : smoothSegment;
    const positions = points.map((p) => v3(p.position));
    const tangents = computeTangents(positions, smoothCurvature);
    const residueNormals = computeResidueNormals(points, positions, tangents);

    if (points.length === 1) {
        const tangent = safeUnit(tangents[0]);
        const normal = residueNormals[0] || fallbackNormal(tangent);
        const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
        const fixedNormal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();
        return [{
            position: positions[0],
            tangent,
            normal: fixedNormal,
            binormal,
            sourcePoint: points[0],
            sourceIndexFloat: sourceIndexOffset,
            residueId: points[0].residueId,
            chainId: points[0].chainId,
            sse: points[0].sse,
            t: 0,
        }];
    }

    const frames = [];

    function pushFrame(position, tangentInput, normalInput, sourcePoint, sourceIndexFloat, t) {
        const tangent = safeUnit(tangentInput);
        let normalTmp = projectPerpendicular(normalInput, tangent);
        if (normalTmp.length() < 1e-8) normalTmp = fallbackNormal(tangent);
        else normalTmp.normalize();

        const binormal = new THREE.Vector3().crossVectors(tangent, normalTmp);
        if (binormal.length() < 1e-8) binormal.copy(fallbackNormal(tangent));
        else binormal.normalize();

        const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();

        frames.push({
            position,
            tangent,
            normal,
            binormal,
            sourcePoint,
            sourceIndexFloat,
            residueId: sourcePoint?.residueId || null,
            chainId: sourcePoint?.chainId || '',
            sse: sourcePoint?.sse || '',
            t,
        });
    }

    // Old naturalFrame explicitly seeds the first residue.
    pushFrame(
        positions[0].clone(),
        tangents[0],
        residueNormals[0],
        points[0],
        sourceIndexOffset,
        0
    );

    for (let i = 1; i < points.length; i += 1) {
        const p0 = positions[i - 1];
        const p1 = positions[i];
        const m0 = tangents[i - 1];
        const m1 = tangents[i];
        const n0 = residueNormals[i - 1];
        const n1 = residueNormals[i];

        for (let ii = 1; ii <= n; ii += 1) {
            const t = ii / n;
            const xyz = hermite(p0, p1, m0, m1, t);
            const tan = hermiteTangent(p0, p1, m0, m1, t);

            const normalTmp = n0.clone().lerp(n1, t);
            const sourcePoint = ii <= n / 2 ? points[i - 1] : points[i];
            const sourceIndexFloat = sourceIndexOffset + (i - 1 + t);

            pushFrame(xyz, tan, normalTmp, sourcePoint, sourceIndexFloat, t);

            // Old code switches id/color at half segment and also pushes an extra frame.
            if (ii === n / 2) {
                pushFrame(xyz.clone(), tan.clone(), normalTmp.clone(), points[i], sourceIndexOffset + i, t);
            }
        }
    }

    return frames;
}

export function paddedSegmentPoints(chainPoints, segment, pad = 1) {
    const start = Math.max(0, segment.startIndex - pad);
    const end = Math.min(chainPoints.length - 1, segment.endIndex + pad);
    return chainPoints.slice(start, end + 1);
}
