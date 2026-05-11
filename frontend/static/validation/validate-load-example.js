import {ProteinSystem} from '../domain/protein/ProteinSystem.js';
import {StructureLoader} from '../domain/io/StructureLoader.js';
import {validateLoadedStructure, logLoadValidation} from './StructureLoadValidator.js';


const proteinSystem = new ProteinSystem();
const loader = new StructureLoader({proteinSystem});

const state = {
    proteinSystem,
    loader,
    last: {
        file: null,
        proteinId: null,
        format: null,
        model: null,
        report: null,
    },
};

function toArray(mapOrIterable) {
    if (!mapOrIterable) return [];
    if (mapOrIterable instanceof Map) return [...mapOrIterable.values()];
    return [...mapOrIterable];
}

function residueRow(model, r) {
    return {
        id: r.id,
        name: r.name,
        chainId: r.chainId,
        label: r.label,
        seqNum: r.seqNum,
        insCode: r.insCode,
        kind: r.kind,
        chainType: r.chainType,
        recordType: r.recordType,
        isProtein: r.isProtein,
        isNucleic: r.isNucleic,
        isHeterogen: r.isHeterogen,
        isWater: r.isWater,
        atomCount: r.atomIds?.length ?? 0,
        firstAtoms: (r.atomIds || []).slice(0, 6).join(','),
    };
}

function atomRow(model, a) {
    const r = model.residues.get(a.residueId);
    const p = model.getAtomPosition(a.id);
    return {
        id: a.id,
        serial: a.serial,
        name: a.name,
        element: a.element,
        recordType: a.recordType,
        altLoc: a.altLoc,
        residueId: a.residueId,
        residue: r ? `${r.name} ${r.chainId}${r.label}` : '',
        residueKind: r?.kind,
        x: p?.[0],
        y: p?.[1],
        z: p?.[2],
        occupancy: a.occupancy,
        bFactor: a.bFactor,
    };
}

function bondRows(model, limit = 50) {
    const rows = [];
    const seen = new Set();
    for (const [a, neighbors] of model.bondGraph._adj.entries()) {
        for (const b of neighbors) {
            const key = Number(a) < Number(b) ? `${a}-${b}` : `${b}-${a}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const atomA = model.atoms.get(a);
            const atomB = model.atoms.get(b);
            const resA = atomA ? model.residues.get(atomA.residueId) : null;
            const resB = atomB ? model.residues.get(atomB.residueId) : null;
            rows.push({
                a,
                b,
                atomA: atomA ? `${atomA.name}/${atomA.element}` : '',
                atomB: atomB ? `${atomB.name}/${atomB.element}` : '',
                residueA: resA ? `${resA.name} ${resA.chainId}${resA.label}` : '',
                residueB: resB ? `${resB.name} ${resB.chainId}${resB.label}` : '',
            });
            if (rows.length >= limit) return rows;
        }
    }
    return rows;
}

function getModel() {
    if (!state.last.model) {
        console.warn('[ProVR] 还没有加载文件。先在页面上上传 PDB / mmCIF。');
        return null;
    }
    return state.last.model;
}

function printSummary() {
    const model = getModel();
    if (!model) return null;
    const report = validateLoadedStructure(model, {sampleSize: 10});
    console.log('[ProVR] summary object:', report.summary);
    console.table(report.summary.residueKinds);
    console.table(report.summary.atomRecordTypes);
    return report.summary;
}

function printChains() {
    const model = getModel();
    if (!model) return [];
    const rows = [...model.chains.values()].map((c) => ({
        id: c.id,
        type: c.type,
        residueCount: c.residueIds?.length ?? 0,
        previewTransform: !!c.previewTransform,
    }));
    console.table(rows);
    return rows;
}

function printResidues(kind = null, limit = 50) {
    const model = getModel();
    if (!model) return [];
    const rows = [];
    for (const r of model.residues.values()) {
        if (kind && r.kind !== kind) continue;
        rows.push(residueRow(model, r));
        if (rows.length >= limit) break;
    }
    console.table(rows);
    return rows;
}

function printAtoms(limit = 50) {
    const model = getModel();
    if (!model) return [];
    const rows = toArray(model.atoms).slice(0, limit).map((a) => atomRow(model, a));
    console.table(rows);
    return rows;
}

function printBonds(limit = 50) {
    const model = getModel();
    if (!model) return [];
    const rows = bondRows(model, limit);
    console.table(rows);
    return rows;
}

function updateSummaryBox(report) {
    const box = document.querySelector('#summaryBox');
    const status = document.querySelector('#status');
    box.textContent = JSON.stringify(report, null, 2);
    const ok = report.ok;
    status.innerHTML = ok
        ? `<span class="ok">OK</span>：加载成功。请打开浏览器 Console 查看完整对象。`
        : `<span class="bad">Issues found</span>：加载了，但有问题。请看 Console 的 warnings。`;
}

async function handleFile(file) {
    console.clear();
    console.log('[ProVR] start loading file:', file.name, file.type, file.size, 'bytes');

    const {model, format, proteinId} = await loader.loadFile(file, {replace: true});
    const report = logLoadValidation(model, {sampleSize: 12});

    state.last = {file, proteinId, format, model, report};
    window.provr.last = state.last;

    updateSummaryBox(report);

    console.log('[ProVR] raw ProteinModel:', model);
    console.log('[ProVR] maps:', {
        chains: model.chains,
        residues: model.residues,
        atoms: model.atoms,
        bondGraph: model.bondGraph,
        coordinateStore: model.coordinateStore,
        secondary: model.secondary,
        selection: model.selection,
    });

    printSummary();
    printChains();
    printResidues(null, 20);
    printAtoms(20);

    console.log('%c[ProVR] 常用调试命令：', 'font-weight:bold;color:#2563eb');
    console.log('provr.last.model');
    console.log('provr.last.report.summary');
    console.log("provr.print.residues('HETEROGEN', 50)");
    console.log("provr.print.residues('NUCLEIC', 50)");
    console.log("provr.print.residues('WATER', 50)");
    console.log('provr.print.atoms(50)');
    console.log('provr.print.bonds(50)');

    return {model, report};
}

window.provr = {
    proteinSystem,
    loader,
    last: state.last,
    getModel,
    print: {
        summary: printSummary,
        chains: printChains,
        residues: printResidues,
        atoms: printAtoms,
        bonds: printBonds,
    },
};

const input = document.querySelector('#structureFileInput');
input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
        await handleFile(file);
    } catch (err) {
        console.error('[ProVR] load failed:', err);
        document.querySelector('#status').innerHTML = `<span class="bad">Load failed</span>：${err.message}`;
    }
});

document.querySelector('#btnSummary').addEventListener('click', () => printSummary());
document.querySelector('#btnChains').addEventListener('click', () => printChains());
document.querySelector('#btnResidues').addEventListener('click', () => printResidues(null, 50));
document.querySelector('#btnAtoms').addEventListener('click', () => printAtoms(50));
document.querySelector('#btnHeterogen').addEventListener('click', () => printResidues('HETEROGEN', 100));
document.querySelector('#btnNucleic').addEventListener('click', () => printResidues('NUCLEIC', 100));
document.querySelector('#btnWater').addEventListener('click', () => printResidues('WATER', 100));

console.log('[ProVR] Load validator page ready. Upload a PDB/mmCIF file, then inspect window.provr.');