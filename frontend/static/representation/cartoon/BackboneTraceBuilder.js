import {SSEType} from "../../domain/protein/ProteinConstants.js";
import {createStructureFilter} from "../../domain/protein/StructureFilter.js";

function clonePosition(p) {
    return p ? [Number(p[0]), Number(p[1]), Number(p[2])] : null;
}

function sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
}

function length(v) {
    return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function normalize(v) {
    const len = length(v);
    if (len < 1e-8) return null;
    return [v[0] / len, v[1] / len, v[2] / len];
}

function residueCentroid(model, residue) {
    const out = [0, 0, 0];
    let n = 0;

    for (const atomId of residue.atomIds || []) {
        const p = model.getAtomPosition(atomId);
        if (!p) continue;
        out[0] += p[0];
        out[1] += p[1];
        out[2] += p[2];
        n += 1;
    }

    if (n === 0) return null;
    return [out[0] / n, out[1] / n, out[2] / n];
}

function findAtomByName(model, residue, names) {
    const wanted = new Set(names.map((name) => String(name).toUpperCase()));
    for (const atomId of residue.atomIds || []) {
        const atom = model.getAtom(atomId);
        if (atom && wanted.has(String(atom.name || '').toUpperCase())) return atom;
    }
    return null;
}

function atomPosition(model, residue, names) {
    const atom = findAtomByName(model, residue, names);
    const p = atom ? model.getAtomPosition(atom.id) : null;
    return {atom, position: clonePosition(p)};
}

function traceAtomForResidue(model, residue) {
    if (!residue) return null;
    if (residue.isProtein) return findAtomByName(model, residue, ['CA']);
    if (residue.isNucleic) return findAtomByName(model, residue, ['P', "C4'", 'C4*']);
    return null;
}

function normalHintForResidue(model, residue, tracePosition) {
    if (!residue || !tracePosition) return null;

    if (residue.isProtein) {
        const o = atomPosition(model, residue, ['O', 'OXT']);
        if (o.position) {
            const v = normalize(sub(o.position, tracePosition));
            if (v) return v;
        }

        const n = atomPosition(model, residue, ['N']);
        const c = atomPosition(model, residue, ['C']);
        if (n.position && c.position) {
            const v1 = sub(n.position, tracePosition);
            const v2 = sub(c.position, tracePosition);
            const plane = normalize(cross(v1, v2));
            if (plane) return plane;
        }
    }

    if (residue.isNucleic) {
        const c4 = atomPosition(model, residue, ["C4'", 'C4*']);
        if (c4.position) {
            const v = normalize(sub(c4.position, tracePosition));
            if (v) return v;
        }
    }

    return null;
}

function sseForResidue(model, residue) {
    return model.secondary?.getResidueSSE?.(residue.id) || residue.sse || SSEType.LOOP;
}

function chainResidues(model, chain) {
    return (chain.residueIds || [])
        .map((residueId) => model.residues.get(residueId))
        .filter(Boolean)
        .sort((a, b) => {
            if (a.order !== b.order) return a.order - b.order;
            if (a.seqNum !== b.seqNum) return a.seqNum - b.seqNum;
            return String(a.insCode || '').localeCompare(String(b.insCode || ''));
        });
}

function atomIdsForResidues(model, residueIds) {
    const out = [];
    for (const residueId of residueIds || []) {
        const residue = model.residues.get(residueId);
        if (residue?.atomIds?.length) out.push(...residue.atomIds);
    }
    return out;
}

function splitSegments(points) {
    const segments = [];
    let current = [];

    function finish() {
        if (!current.length) return;
        const first = current[0];
        const last = current[current.length - 1];
        segments.push({
            chainId: first.chainId,
            sse: first.sse,
            startIndex: first.index,
            endIndex: last.index,
            points: current,
            residueIds: current.map((p) => p.residueId),
            atomIds: [],
            singleton: current.length === 1,
        });
        current = [];
    }

    for (const point of points) {
        const previous = current[current.length - 1];
        if (!previous || previous.chainId === point.chainId && previous.sse === point.sse) {
            current.push(point);
            continue;
        }
        finish();
        current.push(point);
    }

    finish();
    return segments;
}

export function buildBackboneTrace(model, {
    filter: filterOptions = {},
    includeFallbackCentroid = true,
} = {}) {
    if (!model) return {proteinId: '', chains: [], points: [], segments: [], summary: null};

    const filter = createStructureFilter(filterOptions);
    const chains = [];
    const allPoints = [];
    const allSegments = [];

    for (const [chainId, chain] of model.chains.entries()) {
        const points = [];

        for (const residue of chainResidues(model, chain)) {
            if (!filter.acceptResidue(residue)) continue;

            let position = null;
            const traceAtom = traceAtomForResidue(model, residue);
            if (traceAtom) position = clonePosition(model.getAtomPosition(traceAtom.id));
            if (!position && includeFallbackCentroid) position = residueCentroid(model, residue);
            if (!position) continue;

            const point = {
                proteinId: model.id,
                chainId,
                index: points.length,
                residueId: residue.id,
                residueName: residue.name,
                residueLabel: residue.label,
                residueKind: residue.kind,
                atomId: traceAtom?.id ?? null,
                atomName: traceAtom?.name ?? 'centroid',
                sse: sseForResidue(model, residue),
                position,
                normalHint: normalHintForResidue(model, residue, position),
            };

            points.push(point);
            allPoints.push(point);
        }

        const segments = splitSegments(points).map((segment) => ({
            ...segment,
            atomIds: atomIdsForResidues(model, segment.residueIds),
        }));

        chains.push({chainId, points, segments});
        allSegments.push(...segments);
    }

    const bySSE = {};
    for (const segment of allSegments) bySSE[segment.sse] = (bySSE[segment.sse] || 0) + 1;

    return {
        proteinId: model.id,
        chains,
        points: allPoints,
        segments: allSegments,
        summary: {
            proteinId: model.id,
            chains: chains.length,
            points: allPoints.length,
            segments: allSegments.length,
            bySSE,
        },
    };
}
