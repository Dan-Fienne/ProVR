import {ProteinSystem} from '../domain/protein/ProteinSystem.js';
import {validateProteinModel, validateProteinSystem} from '../domain/protein/ProteinModelValidator.js';
import {classifyResidue} from '../domain/protein/StructureClassifier.js';

export function validateDomainProteinContract() {
    const issues = [];
    const system = new ProteinSystem({initialAtomCapacity: 16});
    const model = system.createProtein('contract_test');

    const cls = classifyResidue({recordType: 'ATOM', resName: 'ALA'});
    const residue = model.addResidue({chainId: 'A', seqNum: 1, name: 'ALA', recordType: 'ATOM', ...cls});
    model.addAtom({atomId: 1, serial: 1, atomName: 'N', element: 'N', residueId: residue.id, x: 0, y: 0, z: 0});
    model.addAtom({atomId: 2, serial: 2, atomName: 'CA', element: 'C', residueId: residue.id, x: 1.45, y: 0, z: 0});
    model.bondGraph.addBond(1, 2, {kind: 'test'});

    if (system.listProteinIds()[0] !== 'contract_test') issues.push('ProteinSystem.listProteinIds failed');
    if (!model.getAtomPosition(1)) issues.push('ProteinModel.getAtomPosition failed');
    model.setAtomPosition(1, 0.2, 0.3, 0.4);
    const p = model.getAtomPosition(1);
    if (Math.abs(p[0] - 0.2) > 1e-5) issues.push('ProteinModel.setAtomPosition failed');

    const modelCheck = validateProteinModel(model);
    const systemCheck = validateProteinSystem(system);
    issues.push(...modelCheck.issues, ...systemCheck.issues);

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            model: model.summary(),
            system: system.summary(),
            validation: modelCheck,
        },
    };
}

if (typeof window !== 'undefined') {
    window.validateDomainProteinContract = validateDomainProteinContract;
}
