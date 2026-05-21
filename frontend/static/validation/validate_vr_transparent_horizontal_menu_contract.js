import {VRDesignTokens} from '../vr/ui/VRDesignTokens.js';
import {VRMenuSystem} from '../vr/menu/VRMenuSystem.js';
import {createCanonicalMenuTree} from '../vr/menu/VRMenuDefinitions.js';

export function validateVRTransparentHorizontalMenuContract() {
    const issues = [];
    const tree = createCanonicalMenuTree({pdbIds: ['1CWA'], loadedProteins: [], activeProteinId: null});
    if (!tree.root) issues.push('Missing root menu.');
    if (!tree.root.buttons.some((b) => b.page === 'load')) issues.push('Missing Load button.');
    if (!tree.root.buttons.some((b) => b.page === 'proteins')) issues.push('Missing Proteins button.');

    if (!VRDesignTokens.color.glassA.includes('rgba')) issues.push('Panel background should be transparent rgba.');
    if (VRDesignTokens.color.glassA.includes('34,184,255')) issues.push('Panel background still uses blue.');

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            layout: VRDesignTokens.layout,
            rootButtons: tree.root.buttons.map((b) => b.title),
            note: 'Horizontal transparent menu uses left-side Back/Root/Move/Close nav and tidy 4-column content grid.',
        },
    };
}

if (typeof window !== 'undefined') window.validateVRTransparentHorizontalMenuContract = validateVRTransparentHorizontalMenuContract;
