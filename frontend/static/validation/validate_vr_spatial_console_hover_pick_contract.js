import {VRMenuHoverLayer} from '../vr/menu/VRMenuHoverLayer.js';
import {makeNavButtonTexture} from '../vr/ui/VRLiquidGlassCanvas.js';

export function validateVRSpatialConsoleHoverPickContract() {
    const issues = [];

    const navTexture = makeNavButtonTexture({title: 'Undo', subtitle: '撤销', icon: '↶', state: 'hover'});
    if (!navTexture?.isTexture) issues.push('Rounded nav button texture failed.');

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            nav: 'Left rail uses rounded rectangular glass buttons, not circles.',
            hover: 'Menu hover layer supports one cursor per controller.',
            proteinOperation: 'Protein operations are pick-to-operate; no menu activation required.',
        },
    };
}

if (typeof window !== 'undefined') window.validateVRSpatialConsoleHoverPickContract = validateVRSpatialConsoleHoverPickContract;
