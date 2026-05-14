import * as THREE from "../../libs/three.module.js";

function pushVec3(out, v) {
    out.push(v.x, v.y, v.z);
}

function addTri(indices, a, b, c) {
    indices.push(a, b, c);
}

function addQuad(indices, a, b, c, d) {
    indices.push(a, b, d, b, c, d);
}

function finalizeGeometry(positions, indices) {
    if (!positions.length || !indices.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
}

function validFrames(frames) {
    return (frames || []).filter((f) => f?.position && f?.normal && f?.binormal && f?.tangent);
}

function safeUnit(v, fallback = new THREE.Vector3(1, 0, 0)) {
    if (!v || v.length() < 1e-8) return fallback.clone().normalize();
    return v.clone().normalize();
}

function projectPerpendicular(v, axis) {
    return v.clone().addScaledVector(axis, -v.dot(axis));
}

function capFan(indices, start, count, reverse = false) {
    if (count < 3) return;
    for (let i = 1; i < count - 1; i += 1) {
        if (reverse) addTri(indices, start, start + i + 1, start + i);
        else addTri(indices, start, start + i, start + i + 1);
    }
}

function sweepClosedSections(sections, {capStart = true, capEnd = true} = {}) {
    if (!sections?.length) return null;
    const size = sections[0].length;
    if (size < 3) return null;

    const positions = [];
    const indices = [];

    for (const section of sections) {
        if (!section || section.length !== size) return null;
        for (const p of section) pushVec3(positions, p);
    }

    for (let i = 0; i < sections.length - 1; i += 1) {
        const row = i * size;
        const next = (i + 1) * size;

        for (let j = 0; j < size; j += 1) {
            const a = row + j;
            const b = row + ((j + 1) % size);
            const c = next + ((j + 1) % size);
            const d = next + j;
            addQuad(indices, a, b, c, d);
        }
    }

    if (capStart) capFan(indices, 0, size, true);
    if (capEnd) capFan(indices, (sections.length - 1) * size, size, false);

    return finalizeGeometry(positions, indices);
}

function circleSection(frame, radius, segments) {
    const out = [];
    for (let i = 0; i < segments; i += 1) {
        const theta = (i / segments) * Math.PI * 2;
        out.push(
            frame.position.clone()
                .addScaledVector(frame.normal, Math.cos(theta) * radius)
                .addScaledVector(frame.binormal, Math.sin(theta) * radius)
        );
    }
    return out;
}

function ellipseSection(frame, rx, ry, segments) {
    const out = [];
    for (let i = 0; i < segments; i += 1) {
        const theta = (i / segments) * Math.PI * 2;
        out.push(
            frame.position.clone()
                .addScaledVector(frame.normal, Math.cos(theta) * rx)
                .addScaledVector(frame.binormal, Math.sin(theta) * ry)
        );
    }
    return out;
}

/**
 * Old drawTube equivalent:
 * a smooth tube following the Hermite-generated path.
 */
export function createLegacyLoopTubeGeometry(framesInput, {
    radius = 0.18,
    radialSegments = 10,
    capStart = true,
    capEnd = true,
} = {}) {
    const frames = validFrames(framesInput);
    if (frames.length < 2) return null;
    return sweepClosedSections(
        frames.map((f) => circleSection(f, radius, radialSegments)),
        {capStart, capEnd}
    );
}

/**
 * Old drawEllipse equivalent:
 * old code used EllipseCurve(5 * radius, radius) and ExtrudeGeometry along path.
 */
export function createLegacyHelixEllipseGeometry(framesInput, {
    radius = 0.21,
    widthMultiple = 5.0,
    segments = 20,
} = {}) {
    const frames = validFrames(framesInput);
    if (frames.length < 2) return null;

    const rx = radius * widthMultiple;
    const ry = radius;
    return sweepClosedSections(frames.map((f) => ellipseSection(f, rx, ry, segments)));
}

function fitVec(coeffs, basis) {
    const out = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < coeffs.length; i += 1) out.addScaledVector(coeffs[i], basis[i] || 0);
    return out;
}

function lineFitVec(n, p0, p1) {
    const c0 = p0.clone();
    const c1 = p1.clone().sub(p0);
    const out = [];
    for (let i = 0; i <= n; i += 1) {
        const u = i / n;
        out.push({
            position: fitVec([c0, c1], [1, u]),
            tangent: c1.clone(),
        });
    }
    return out;
}

function quadFitVec(n, p0, pm, p1) {
    // Same matrix as old math.quadFit:
    // c0=p0; c1=-3p0+4pm-p1; c2=2p0-4pm+2p1
    const c0 = p0.clone();
    const c1 = p0.clone().multiplyScalar(-3).addScaledVector(pm, 4).addScaledVector(p1, -1);
    const c2 = p0.clone().multiplyScalar(2).addScaledVector(pm, -4).addScaledVector(p1, 2);

    const out = [];
    for (let i = 0; i <= n; i += 1) {
        const u = i / n;
        out.push({
            position: fitVec([c0, c1, c2], [1, u, u * u]),
            tangent: fitVec([c1, c2], [1, 2 * u]),
        });
    }
    return out;
}

function cubeFit4partsVec(n, p0, p1, p2, p3) {
    // Same matrix as old math.cubeFit4parts:
    // 0, 0.25, 0.75, 1 anchor positions.
    const c0 = p0.clone();
    const c1 = p0.clone().multiplyScalar(-6.33).addScaledVector(p1, 8).addScaledVector(p2, -2.67).addScaledVector(p3, 1);
    const c2 = p0.clone().multiplyScalar(10.67).addScaledVector(p1, -18.67).addScaledVector(p2, 13.33).addScaledVector(p3, -5.33);
    const c3 = p0.clone().multiplyScalar(-5.33).addScaledVector(p1, 10.67).addScaledVector(p2, -10.67).addScaledVector(p3, 5.33);

    const out = [];
    for (let i = 0; i <= n; i += 1) {
        const u = i / n;
        out.push({
            position: fitVec([c0, c1, c2, c3], [1, u, u * u, u * u * u]),
            tangent: fitVec([c1, c2, c3], [1, 2 * u, 3 * u * u]),
        });
    }
    return out;
}

export function fitFramesByLegacyZigzag(framesInput, smoothSegment = 19) {
    const path = validFrames(framesInput);
    if (path.length < 3) return path;

    const n = smoothSegment % 2 ? smoothSegment + 1 : smoothSegment;
    const oriLen = Math.floor((path.length - 1) / (n + 1)) + 1;
    const ori = [];

    for (let i = 0; i < oriLen; i += 1) {
        const idx = Math.min(path.length - 1, i * (n + 1));
        ori.push(path[idx]);
    }

    if (ori.length < 2) return path;

    const curveLen = (ori.length - 1) * n + 1;
    const curveN = Math.max(1, curveLen - 1);

    let curveXYZ = [];
    let curveNormal = [];

    if (ori.length < 5) {
        curveXYZ = lineFitVec(curveN, ori[0].position, ori[ori.length - 1].position);
        curveNormal = lineFitVec(curveN, ori[0].normal, ori[ori.length - 1].normal);
    } else if (ori.length < 8) {
        const midPos = ori.length % 2
            ? ori[(ori.length - 1) / 2].position
            : ori[ori.length / 2 - 1].position.clone().add(ori[ori.length / 2].position).multiplyScalar(0.5);
        const midNorm = ori.length % 2
            ? ori[(ori.length - 1) / 2].normal
            : ori[ori.length / 2 - 1].normal.clone().add(ori[ori.length / 2].normal).multiplyScalar(0.5);

        curveXYZ = quadFitVec(curveN, ori[0].position, midPos, ori[ori.length - 1].position);
        curveNormal = quadFitVec(curveN, ori[0].normal, midNorm, ori[ori.length - 1].normal);
    } else {
        const p25 = ori[Math.floor(0.25 * ori.length)];
        const p75 = ori[Math.floor(0.75 * ori.length)];

        curveXYZ = cubeFit4partsVec(curveN, ori[0].position, p25.position, p75.position, ori[ori.length - 1].position);
        curveNormal = cubeFit4partsVec(curveN, ori[0].normal, p25.normal, p75.normal, ori[ori.length - 1].normal);
    }

    const fixed = [];

    function makeFrameFromCurve(i, base) {
        const xyz = curveXYZ[i].position.clone();
        const tan = safeUnit(curveXYZ[i].tangent, base.tangent);
        let normalTmp = safeUnit(curveNormal[i].position, base.normal);
        normalTmp = projectPerpendicular(normalTmp, tan);
        if (normalTmp.length() < 1e-8) normalTmp = projectPerpendicular(base.normal, tan);
        if (normalTmp.length() < 1e-8) normalTmp = base.normal.clone();
        normalTmp.normalize();

        let binormal = new THREE.Vector3().crossVectors(tan, normalTmp);
        if (binormal.length() < 1e-8) binormal = base.binormal.clone();
        else binormal.normalize();

        const normal = new THREE.Vector3().crossVectors(binormal, tan).normalize();

        return {
            ...base,
            position: xyz,
            tangent: tan,
            normal,
            binormal,
        };
    }

    for (let i = 0; i < curveLen; i += 1) {
        const offset = fixed.length;
        const base = path[Math.min(path.length - 1, offset)];
        fixed.push(makeFrameFromCurve(i, base));

        // Old zigzagFix duplicates the frame at the half-residue switch point.
        if ((i - n / 2) % n === 0) {
            const base2 = path[Math.min(path.length - 1, offset + 1)] || base;
            fixed.push(makeFrameFromCurve(i, base2));
        }
    }

    return fixed;
}

function cubeOddSection(frame, width, height) {
    const w2 = width / 2;
    const h2 = height / 2;

    // Old cubeShell emits 8 points, but arrowFiller extracts k=1,3,5,7.
    // These are exactly those four odd points:
    const e1 = frame.normal;
    const e2 = frame.binormal;

    const e1pe2 = e1.clone().multiplyScalar(w2).add(e2.clone().multiplyScalar(h2));
    const e1me2 = e1.clone().multiplyScalar(w2).add(e2.clone().multiplyScalar(-h2));

    return [
        frame.position.clone().add(e1pe2),     // shell[1]
        frame.position.clone().sub(e1me2),     // shell[3]
        frame.position.clone().sub(e1pe2),     // shell[5]
        frame.position.clone().add(e1me2),     // shell[7]
    ];
}

function legacyArrowT(i, l) {
    if (l <= 2) return i / Math.max(1, l - 1);
    return i * 2 > l - 1 ? (i - 1) / (l - 2) : i / (l - 2);
}

function arrowheadOddSection(frame, index, length, {
    widthMax = 3.6,
    widthMin = 0.4,
    height = 0.4,
} = {}) {
    const tRaw = legacyArrowT(index, length);
    const t = Math.max(0, Math.min(1, Number.isFinite(tRaw) ? tRaw : 0));

    // Fixed df/w3m-style arrowhead width rule.  Do not expose this as a mode:
    // this is now the only beta-sheet arrow form used by CartoonRepresentation.
    const width = (1 - t) * widthMax + widthMin;

    return cubeOddSection(frame, width, height);
}

function legacyArrowMeshFromSections(sections) {
    if (!sections?.length || sections.length < 2) return null;

    const positions = [];
    const indices = [];
    const size = 4;

    for (const section of sections) {
        if (!section || section.length !== size) return null;
        for (const p of section) pushVec3(positions, p);
    }

    // Same topology as drawArrowByPaths:
    // every four points are one section, and neighboring sections are stitched by four sides.
    for (let i = 0; i < sections.length - 1; i += 1) {
        const a = i * 4;
        const b = (i + 1) * 4;

        addTri(indices, a + 0, b + 0, b + 1);
        addTri(indices, b + 1, a + 1, a + 0);

        addTri(indices, a + 3, b + 3, b + 2);
        addTri(indices, b + 2, a + 2, a + 3);

        addTri(indices, a + 2, b + 2, b + 1);
        addTri(indices, b + 1, a + 1, a + 2);

        addTri(indices, a + 3, b + 3, b + 0);
        addTri(indices, b + 0, a + 0, a + 3);
    }

    // front cap
    addTri(indices, 0, 3, 2);
    addTri(indices, 2, 1, 0);

    // back cap
    const s = (sections.length - 1) * 4;
    addTri(indices, s + 0, s + 1, s + 2);
    addTri(indices, s + 2, s + 3, s + 0);

    return finalizeGeometry(positions, indices);
}

/**
 * Fixed beta-sheet arrow geometry.
 *
 * This intentionally keeps one canonical sheet drawing method instead of
 * supporting multiple experimental variants.  It follows the old df/w3m drawing
 * idea that looked better visually:
 *
 * - first make a zigzagFix-style smoothed/flattened strand path;
 * - draw a regular rectangular shaft from 4-point cube sections;
 * - draw only the terminal region as a tapered arrowhead;
 * - stitch neighboring 4-point sections with the old drawArrowByPaths topology.
 *
 * Body and head are separate conceptual regions, but they are emitted as one
 * ordered section list so picking still treats one beta strand as one segment.
 * No alternate sheet modes.
 */
export function createLegacySheetArrowGeometry(framesInput, {
    bodyWidth = 2.0,
    thickness = 0.4,
    arrowBaseWidth = 3.6,
    arrowTipWidth = 0.4,
    arrowHeight = 0.4,
    smoothSegment = 19,
} = {}) {
    let frames = validFrames(framesInput);
    if (frames.length < 2) return null;

    frames = fitFramesByLegacyZigzag(frames, smoothSegment);
    if (frames.length < 2) return null;

    const len = frames.length;
    const seg = smoothSegment % 2 ? smoothSegment + 1 : smoothSegment;

    let bodyEnd = len - (seg + 1);
    let headStart = len - (seg + 2);

    // Short strands cannot satisfy the old exact slicing.  Preserve the visual
    // rule: most of the strand is a clean rectangular body, the last third is
    // the arrowhead.
    if (bodyEnd < 2 || headStart < 0) {
        headStart = Math.max(1, Math.floor(len * 0.66));
        bodyEnd = Math.max(1, headStart);
    }

    const bodyFrames = frames.slice(0, Math.max(1, bodyEnd));
    const headFrames = frames.slice(Math.max(0, headStart));

    const sections = [];

    for (const frame of bodyFrames) {
        sections.push(cubeOddSection(frame, bodyWidth, thickness));
    }

    for (let i = 0; i < headFrames.length; i += 1) {
        sections.push(arrowheadOddSection(headFrames[i], i, headFrames.length, {
            widthMax: arrowBaseWidth,
            widthMin: arrowTipWidth,
            height: arrowHeight,
        }));
    }

    return legacyArrowMeshFromSections(sections);
}

// Backward-compatible names for prior validation pages.
export const createLoopTubeGeometry = createLegacyLoopTubeGeometry;
export const createConnectorTubeGeometry = createLegacyLoopTubeGeometry;
export const createHelixRibbonGeometry = createLegacyHelixEllipseGeometry;
export const createHelixCoilGeometry = createLegacyHelixEllipseGeometry;
export const createAlphaHelixRibbonGeometry = createLegacyHelixEllipseGeometry;
export const createSheetArrowGeometry = createLegacySheetArrowGeometry;
export const createBetaStrandArrowGeometry = createLegacySheetArrowGeometry;
