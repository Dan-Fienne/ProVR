import * as THREE from '../../libs/three.webgpu.js';

function finiteNumber(value, fallback = null) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function transformedPointFromAttribute(mesh, attr, index, target = new THREE.Vector3()) {
    target.set(attr.getX(index), attr.getY(index), attr.getZ(index));
    mesh.updateWorldMatrix?.(true, false);
    return target.applyMatrix4(mesh.matrixWorld);
}

function boundsFromMesh(mesh) {
    const attr = mesh?.geometry?.getAttribute?.('position');
    if (!attr || attr.count <= 0) return null;
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const tmp = new THREE.Vector3();
    mesh.updateWorldMatrix?.(true, false);

    for (let i = 0; i < attr.count; i += 1) {
        transformedPointFromAttribute(mesh, attr, i, tmp);
        min.min(tmp);
        max.max(tmp);
    }

    return Number.isFinite(min.x) ? {min, max} : null;
}

function boundsDistance(a, b) {
    if (!a || !b) return Infinity;
    const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
    const dy = Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y);
    const dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function sampledPoints(mesh, maxSamples) {
    const attr = mesh?.geometry?.getAttribute?.('position');
    if (!attr || attr.count <= 0) return [];
    const count = attr.count;
    const limit = Math.max(1, Math.min(count, Math.floor(maxSamples || 1000)));
    const step = Math.max(1, Math.floor(count / limit));
    const out = [];
    const tmp = new THREE.Vector3();
    mesh.updateWorldMatrix?.(true, false);
    for (let i = 0; i < count && out.length < limit; i += step) {
        transformedPointFromAttribute(mesh, attr, i, tmp);
        out.push(tmp.clone());
    }
    return out;
}

function distance2(a, b) {
    return a.distanceToSquared(b);
}

function layerId(mesh) {
    return mesh?.userData?.layerId || mesh?.userData?.rangeId || mesh?.name || 'unknown_layer';
}

function layerName(mesh) {
    return mesh?.userData?.layerName || mesh?.userData?.rangeName || layerId(mesh);
}

function analyzePair(meshA, meshB, options) {
    const contactThreshold = finiteNumber(options.contactThreshold, 1.2);
    const clashThreshold = finiteNumber(options.clashThreshold, 0.35);
    const maxSamples = finiteNumber(options.maxSamplesPerLayer, 1000);
    const boundsA = boundsFromMesh(meshA);
    const boundsB = boundsFromMesh(meshB);
    const bbDistance = boundsDistance(boundsA, boundsB);

    if (bbDistance > contactThreshold) {
        return {
            layerA: layerId(meshA),
            layerB: layerId(meshB),
            layerNameA: layerName(meshA),
            layerNameB: layerName(meshB),
            boundingBoxDistance: bbDistance,
            minDistance: bbDistance,
            nearVertexPairs: 0,
            clashVertexPairs: 0,
            contact: false,
            clash: false,
            sampledA: 0,
            sampledB: 0,
            transformAware: true,
        };
    }

    const a = sampledPoints(meshA, maxSamples);
    const b = sampledPoints(meshB, maxSamples);
    const contact2 = contactThreshold * contactThreshold;
    const clash2 = clashThreshold * clashThreshold;
    let minD2 = Infinity;
    let nearVertexPairs = 0;
    let clashVertexPairs = 0;

    for (const pa of a) {
        for (const pb of b) {
            const d2 = distance2(pa, pb);
            if (d2 < minD2) minD2 = d2;
            if (d2 <= contact2) nearVertexPairs += 1;
            if (d2 <= clash2) clashVertexPairs += 1;
        }
    }

    const minDistance = Math.sqrt(minD2);
    return {
        layerA: layerId(meshA),
        layerB: layerId(meshB),
        layerNameA: layerName(meshA),
        layerNameB: layerName(meshB),
        boundingBoxDistance: bbDistance,
        minDistance,
        nearVertexPairs,
        clashVertexPairs,
        contact: nearVertexPairs > 0,
        clash: clashVertexPairs > 0,
        sampledA: a.length,
        sampledB: b.length,
        transformAware: true,
    };
}

export function analyzeSurfaceLayerContacts(meshes = [], style = {}) {
    const visible = meshes.filter((mesh) => mesh?.visible && mesh.geometry?.getAttribute?.('position')?.count > 0);
    const pairs = [];
    for (let i = 0; i < visible.length; i += 1) {
        for (let j = i + 1; j < visible.length; j += 1) {
            pairs.push(analyzePair(visible[i], visible[j], {
                contactThreshold: style.contactThreshold,
                clashThreshold: style.clashThreshold,
                maxSamplesPerLayer: style.maxContactSamplesPerLayer,
            }));
        }
    }

    const contactPairs = pairs.filter((pair) => pair.contact);
    const clashPairs = pairs.filter((pair) => pair.clash);
    const minDistance = pairs.length ? Math.min(...pairs.map((pair) => pair.minDistance).filter(Number.isFinite)) : null;

    return {
        pairCount: pairs.length,
        contactPairCount: contactPairs.length,
        clashPairCount: clashPairs.length,
        minDistance: Number.isFinite(minDistance) ? minDistance : null,
        transformAware: true,
        policy: 'contact-analysis-uses-current-mesh-world-matrices-no-surface-rebuild-needed-for-rigid-layer-drag',
        pairs,
    };
}
