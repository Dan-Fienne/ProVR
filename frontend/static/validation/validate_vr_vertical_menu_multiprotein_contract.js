import {createCanonicalMenuTree} from '../vr/menu/VRMenuDefinitions.js';
import {VRProteinCollection} from '../vr/workspace/VRProteinCollection.js';

export function validateVRVerticalMenuMultiProteinContract() {
    const issues = [];

    const tree = createCanonicalMenuTree({
        pdbIds: ['1CWA', '2ABC'],
        loadedProteins: [
            {proteinId: '1cwa', pdbId: '1CWA', visible: true},
            {proteinId: '2abc', pdbId: '2ABC', visible: true},
        ],
        activeProteinId: '1cwa',
    });

    if (!tree.root.buttons.find((b) => b.page === 'proteins')) issues.push('Root menu missing Proteins page.');
    if (!tree.proteins.buttons.find((b) => b.id === 'protein:active:1cwa')) issues.push('Proteins page missing active protein buttons.');
    if (!tree.load.buttons.find((b) => b.id === 'load:download-pdb')) issues.push('Load menu missing Download from PDB.');

    const fakeContext = {activeProteinId: null, activeModel: null};
    const fakeRep = {setVisible(){}};
    const collection = new VRProteinCollection({context: fakeContext, representationFeature: fakeRep});
    collection.addProtein({model: {id: 'a'}, pdbId: 'A', repIds: {}});
    collection.addProtein({model: {id: 'b'}, pdbId: 'B', repIds: {}});
    collection.setActive('a');

    if (collection.activeProteinId !== 'a') issues.push('Protein collection active selection failed.');
    if (collection.list().length !== 2) issues.push('Protein collection list failed.');

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            rootButtons: tree.root.buttons.map((b) => b.title),
            proteinsButtons: tree.proteins.buttons.map((b) => b.title),
            collection: collection.summary(),
            note: 'Vertical liquid-glass menu and multi-protein active selection are available.',
        },
    };
}

if (typeof window !== 'undefined') window.validateVRVerticalMenuMultiProteinContract = validateVRVerticalMenuMultiProteinContract;
