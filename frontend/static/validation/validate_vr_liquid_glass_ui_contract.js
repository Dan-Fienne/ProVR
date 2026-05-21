import {VRDesignTokens} from '../vr/ui/VRDesignTokens.js';
import {VRRayVisualState} from '../vr/ui/VRLiquidRay.js';
import {VRMenuButton} from '../vr/menu/VRMenuButton.js';

export function validateVRLiquidGlassUIContract() {
    const issues = [];

    if (!VRDesignTokens.color.glassA) issues.push('Missing liquid glass color tokens.');
    if (!VRRayVisualState.UI_HOVER) issues.push('Missing UI hover ray state.');
    if (!VRRayVisualState.MOLECULE_HOVER) issues.push('Missing molecule hover ray state.');

    const button = new VRMenuButton({
        action: {id: 'test', title: 'Hover Test', subtitle: 'liquid', kind: 'immediate'},
    });
    button.setHover(true);
    if (button.state !== 'hover') issues.push('Button hover state failed.');
    button.setPressed(true);
    if (button.state !== 'pressed') issues.push('Button pressed state failed.');
    button.dispose();

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            tokens: VRDesignTokens.layout,
            rayStates: VRRayVisualState,
            vendorNote: 'Official controller/generic-hand models are optional; fallback models are built in.',
        },
    };
}

if (typeof window !== 'undefined') window.validateVRLiquidGlassUIContract = validateVRLiquidGlassUIContract;
