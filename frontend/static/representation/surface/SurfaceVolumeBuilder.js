import * as THREE from '../../libs/three.module.js';

const CORNERS = Object.freeze([
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
]);

// Cube decomposition into tetrahedra. It is less pretty than a full marching-cubes
// table, but it is compact, deterministic, and good enough for validation and
// interactive range-scoped surfaces.
const TETS = Object.freeze([
    [0, 5, 1, 6],
    [0, 1, 2, 6],
    [0, 2, 3, 6],
    [0, 3, 7, 6],
    [0, 7, 4, 6],
    [0, 4, 5, 6],
]);

function extent(bounds) {
    return {
        x: Math.max(0.001, bounds.max.x - bounds.min.x),
        y: Math.max(0.001, bounds.max.y - bounds.min.y),
        z: Math.max(0.001, bounds.max.z - bounds.min.z),
    };
}

function clampGridSpacing(bounds, requestedSpacing, maxGridPoints) {
    const e = extent(bounds);
    let spacing = Math.max(0.35, Number(requestedSpacing) || 0.80);
    for (let iter = 0; iter < 24; iter += 1) {
        const nx = Math.ceil(e.x / spacing) + 1;
        const ny = Math.ceil(e.y / spacing) + 1;
        const nz = Math.ceil(e.z / spacing) + 1;
        if (nx * ny * nz <= maxGridPoints) return {spacing, nx, ny, nz, adjusted: iter > 0};
        spacing *= 1.18;
    }
    const nx = Math.ceil(e.x / spacing) + 1;
    const ny = Math.ceil(e.y / spacing) + 1;
    const nz = Math.ceil(e.z / spacing) + 1;
    return {spacing, nx, ny, nz, adjusted: true};
}

function gridIndex(x, y, z, nx, ny) {
    return x + nx * (y + ny * z);
}

function pointAt(bounds, spacing, x, y, z) {
    return [bounds.min.x + x * spacing, bounds.min.y + y * spacing, bounds.min.z + z * spacing];
}

function evaluateFieldAt(point, atoms) {
    let bestValue = -Infinity;
    let bestAtom = null;

    for (const atom of atoms) {
        const dx = point[0] - atom.coord.x;
        const dy = point[1] - atom.coord.y;
        const dz = point[2] - atom.coord.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const value = (atom.radius || 1.7) - dist;
        if (value > bestValue) {
            bestValue = value;
            bestAtom = atom;
        }
    }

    return {value: bestValue, owner: bestAtom};
}

function ownerFields(owner) {
    return {
        atomId: owner?.atomId ?? null,
        residueId: owner?.residueId ?? null,
        residueKey: owner?.residueKey ?? null,
        residueNumber: owner?.residueNumber ?? null,
        residueNumberCandidates: owner?.residueNumberCandidates ?? [],
        residueIdCandidates: owner?.residueIdCandidates ?? [],
        residueKeyCandidates: owner?.residueKeyCandidates ?? [],
        chainId: owner?.chainId ?? null,
        chainIdCandidates: owner?.chainIdCandidates ?? [],
    };
}

function interpolate(a, b) {
    const denom = a.value - b.value;
    const t = Math.abs(denom) < 1e-8 ? 0.5 : a.value / denom;
    const clamped = Math.max(0, Math.min(1, t));
    const inv = 1 - clamped;
    const owner = Math.abs(a.value) <= Math.abs(b.value) ? a.owner : b.owner;
    return {
        position: [
            a.position[0] * inv + b.position[0] * clamped,
            a.position[1] * inv + b.position[1] * clamped,
            a.position[2] * inv + b.position[2] * clamped,
        ],
        ...ownerFields(owner),
    };
}

function edgePoint(a, b) {
    return a.inside === b.inside ? null : interpolate(a, b);
}

function pushVertex(out, point) {
    out.positions.push(point.position[0], point.position[1], point.position[2]);
    out.vertexAtomIds.push(point.atomId);
    out.vertexResidueIds.push(point.residueId);
    out.vertexResidueKeys.push(point.residueKey);
    out.vertexResidueNumbers.push(point.residueNumber);
    out.vertexResidueNumberCandidates.push(point.residueNumberCandidates || []);
    out.vertexResidueIdCandidates.push(point.residueIdCandidates || []);
    out.vertexResidueKeyCandidates.push(point.residueKeyCandidates || []);
    out.vertexChainIds.push(point.chainId);
    out.vertexChainIdCandidates.push(point.chainIdCandidates || []);
    return out.positions.length / 3 - 1;
}

function pushTriangle(out, a, b, c) {
    const ia = pushVertex(out, a);
    const ib = pushVertex(out, b);
    const ic = pushVertex(out, c);
    out.indices.push(ia, ib, ic);
}

function polygonizeTet(out, tetCorners) {
    const inside = tetCorners.filter((c) => c.inside);
    const outside = tetCorners.filter((c) => !c.inside);
    if (inside.length === 0 || inside.length === 4) return;

    if (inside.length === 1) {
        const p0 = edgePoint(inside[0], outside[0]);
        const p1 = edgePoint(inside[0], outside[1]);
        const p2 = edgePoint(inside[0], outside[2]);
        if (p0 && p1 && p2) pushTriangle(out, p0, p1, p2);
        return;
    }

    if (inside.length === 3) {
        const p0 = edgePoint(outside[0], inside[0]);
        const p1 = edgePoint(outside[0], inside[2]);
        const p2 = edgePoint(outside[0], inside[1]);
        if (p0 && p1 && p2) pushTriangle(out, p0, p1, p2);
        return;
    }

    const p0 = edgePoint(inside[0], outside[0]);
    const p1 = edgePoint(inside[0], outside[1]);
    const p2 = edgePoint(inside[1], outside[0]);
    const p3 = edgePoint(inside[1], outside[1]);
    if (p0 && p1 && p2) pushTriangle(out, p0, p1, p2);
    if (p2 && p1 && p3) pushTriangle(out, p2, p1, p3);
}

export function buildSurfaceMeshData({atoms, bounds, style}) {
    if (!atoms?.length) {
        return {
            positions: [], indices: [], vertexAtomIds: [], vertexResidueIds: [], vertexResidueKeys: [], vertexResidueNumbers: [], vertexResidueNumberCandidates: [], vertexResidueIdCandidates: [], vertexResidueKeyCandidates: [], vertexChainIds: [], vertexChainIdCandidates: [],
            stats: {atoms: 0, vertices: 0, faces: 0, empty: true, grid: null},
        };
    }

    const grid = clampGridSpacing(bounds, style.gridSpacing, style.maxGridPoints);
    const total = grid.nx * grid.ny * grid.nz;
    const values = new Float32Array(total);
    const owners = new Array(total);

    for (let z = 0; z < grid.nz; z += 1) {
        for (let y = 0; y < grid.ny; y += 1) {
            for (let x = 0; x < grid.nx; x += 1) {
                const idx = gridIndex(x, y, z, grid.nx, grid.ny);
                const evaluated = evaluateFieldAt(pointAt(bounds, grid.spacing, x, y, z), atoms);
                values[idx] = evaluated.value;
                owners[idx] = evaluated.owner;
            }
        }
    }

    const out = {
        positions: [],
        indices: [],
        vertexAtomIds: [],
        vertexResidueIds: [],
        vertexResidueKeys: [],
        vertexResidueNumbers: [],
        vertexResidueNumberCandidates: [],
        vertexResidueIdCandidates: [],
        vertexResidueKeyCandidates: [],
        vertexChainIds: [],
        vertexChainIdCandidates: [],
    };

    for (let z = 0; z < grid.nz - 1; z += 1) {
        for (let y = 0; y < grid.ny - 1; y += 1) {
            for (let x = 0; x < grid.nx - 1; x += 1) {
                const cube = CORNERS.map(([ox, oy, oz]) => {
                    const gx = x + ox;
                    const gy = y + oy;
                    const gz = z + oz;
                    const idx = gridIndex(gx, gy, gz, grid.nx, grid.ny);
                    const value = values[idx];
                    return {
                        position: pointAt(bounds, grid.spacing, gx, gy, gz),
                        value,
                        inside: value >= 0,
                        owner: owners[idx],
                    };
                });
                for (const tet of TETS) polygonizeTet(out, tet.map((cornerIndex) => cube[cornerIndex]));
            }
        }
    }

    return {
        ...out,
        stats: {
            atoms: atoms.length,
            grid: {spacing: grid.spacing, nx: grid.nx, ny: grid.ny, nz: grid.nz, points: total, adjustedSpacing: grid.adjusted},
            vertices: out.positions.length / 3,
            faces: out.indices.length / 3,
            empty: out.positions.length === 0,
        },
    };
}

export function createSurfaceBufferGeometry(meshData, {colors = null} = {}) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.positions || [], 3));
    if (colors?.length) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(meshData.indices || []);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.userData = {
        ...(geometry.userData || {}),
        surfaceVertexAtomIds: meshData.vertexAtomIds || [],
        surfaceVertexResidueIds: meshData.vertexResidueIds || [],
        surfaceVertexResidueKeys: meshData.vertexResidueKeys || [],
        surfaceVertexResidueNumbers: meshData.vertexResidueNumbers || [],
        surfaceVertexResidueNumberCandidates: meshData.vertexResidueNumberCandidates || [],
        surfaceVertexResidueIdCandidates: meshData.vertexResidueIdCandidates || [],
        surfaceVertexResidueKeyCandidates: meshData.vertexResidueKeyCandidates || [],
        surfaceVertexChainIds: meshData.vertexChainIds || [],
        surfaceVertexChainIdCandidates: meshData.vertexChainIdCandidates || [],
        surfaceStats: meshData.stats || {},
    };
    return geometry;
}
