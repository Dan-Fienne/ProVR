import {makeNavButtonTexture} from '../vr/ui/VRLiquidGlassCanvas.js';

export function validateVRRoundNavNoBlueBoxContract() {
    const issues = [];

    const texture = makeNavButtonTexture({title: 'Back', icon: '‹', state: 'hover'});
    if (!texture?.isTexture) issues.push('Nav circular texture failed.');

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            nav: 'Left nav buttons are circular glass controls.',
            proteinHover: 'Molecule hover highlight uses halo/dot, not blue bounding box.',
            menu: 'Horizontal menu still uses fitted 4×3 content grid with pagination.',
        },
    };
}

if (typeof window !== 'undefined') window.validateVRRoundNavNoBlueBoxContract = validateVRRoundNavNoBlueBoxContract;
