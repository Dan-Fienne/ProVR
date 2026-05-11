import {logRepresentationValidation} from '/src/core/validation/RepresentationSystemValidator.js';

function ensureProVR() {
  if (!window.provr) {
    console.warn('[ProVR Representation] window.provr not found. Load validate_load.js first.');
    return null;
  }
  return window.provr;
}

function runRepresentationValidation() {
  const provr = ensureProVR();
  if (!provr) return null;
  const model = provr.getModel?.() || provr.last?.model;
  if (!model) {
    console.warn('[ProVR Representation] 还没有加载结构。先上传 PDB/mmCIF。');
    return null;
  }
  const report = logRepresentationValidation(model, {
    proteinSystem: provr.proteinSystem,
  });
  window.provr.rep.last = report;
  updateRepSummaryBox(report);
  return report;
}

function printRepresentationSpecs() {
  const report = window.provr?.rep?.last || runRepresentationValidation();
  if (!report) return [];
  console.table(report.representationSpecs);
  return report.representationSpecs;
}

function printPickTargets(kind = null, limit = 50) {
  const report = window.provr?.rep?.last || runRepresentationValidation();
  if (!report) return [];
  const rows = report.pickTargetRows.filter((row) => !kind || row.kind === kind).slice(0, limit);
  console.table(rows);
  return rows;
}

function printPickSummary() {
  const report = window.provr?.rep?.last || runRepresentationValidation();
  if (!report) return null;
  console.log('[ProVR Representation] summary:', report.summary);
  console.table(report.summary.pickTargetsByKind);
  console.table(report.summary.pickTargetsByRepresentation);
  return report.summary;
}

function updateRepSummaryBox(report) {
  const box = document.querySelector('#representationSummaryBox');
  const status = document.querySelector('#representationStatus');
  if (box) box.textContent = JSON.stringify({summary: report.summary, issues: report.issues}, null, 2);
  if (status) {
    status.innerHTML = report.ok
      ? `<span class="ok">OK</span>：Representation 系统验证通过。请看 Console 的表格。`
      : `<span class="bad">Issues found</span>：Representation 系统存在问题，请看 Console。`;
  }
}

function install() {
  const provr = ensureProVR();
  if (!provr) return;
  provr.rep = {
    validate: runRepresentationValidation,
    printSummary: printPickSummary,
    printSpecs: printRepresentationSpecs,
    printTargets: printPickTargets,
    last: null,
  };

  document.querySelector('#btnRepValidate')?.addEventListener('click', () => runRepresentationValidation());
  document.querySelector('#btnRepSummary')?.addEventListener('click', () => printPickSummary());
  document.querySelector('#btnRepSpecs')?.addEventListener('click', () => printRepresentationSpecs());
  document.querySelector('#btnRepAtomTargets')?.addEventListener('click', () => printPickTargets('atom', 50));
  document.querySelector('#btnRepResidueTargets')?.addEventListener('click', () => printPickTargets('residue', 50));
  document.querySelector('#btnRepBondTargets')?.addEventListener('click', () => printPickTargets('bond', 50));

  console.log('[ProVR Representation] ready. Load a structure, then run:');
  console.log('provr.rep.validate()');
  console.log('provr.rep.printSummary()');
  console.log("provr.rep.printTargets('atom', 20)");
  console.log("provr.rep.printTargets('residue', 20)");
}

install();
