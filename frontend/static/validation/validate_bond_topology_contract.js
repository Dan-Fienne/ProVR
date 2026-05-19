import {ProteinSystem} from '../domain/protein/ProteinSystem.js';
import {classifyResidue} from '../domain/protein/StructureClassifier.js';
import {buildBondTopology, getBondTopologyRecords} from '../representation/geometry/BondTopologyBuilder.js';
import {createStructureFilter} from '../domain/protein/StructureFilter.js';

export function validateBondTopologyContract() {
    const issues = [];

    const system = new ProteinSystem({initialAtomCapacity: 16});
    const model = system.createProtein('bond_contract');

    const cls = classifyResidue({recordType: 'ATOM', resName: 'ALA'});
    const residue = model.addResidue({chainId: 'A', seqNum: 1, name: 'ALA', recordType: 'ATOM', ...cls});
    model.addAtom({atomId: 1, serial: 1, atomName: 'N', element: 'N', residueId: residue.id, x: 0, y: 0, z: 0});
    model.addAtom({atomId: 2, serial: 2, atomName: 'CA', element: 'C', residueId: residue.id, x: 1.45, y: 0, z: 0});

    const built = buildBondTopology(model);
    const records = getBondTopologyRecords(model);

    if (!built.records.length) issues.push('buildBondTopology produced no records');
    if (!records.length) issues.push('getBondTopologyRecords returned no records');
    if (!records[0]?.atomIds?.length) issues.push('record.atomIds missing');
    if (!('atomAId' in records[0]) || !('atomBId' in records[0])) issues.push('record atomAId/atomBId missing');

    const filter = createStructureFilter({});
    if (typeof filter.acceptBond !== 'function') issues.push('StructureFilter.acceptBond missing');
    if (!filter.acceptBond(model.getAtom(1), model.getAtom(2), model)) issues.push('StructureFilter.acceptBond rejected valid bond');

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            built,
            records,
        },
    };
}

if (typeof window !== 'undefined') {
    window.validateBondTopologyContract = validateBondTopologyContract;
}
