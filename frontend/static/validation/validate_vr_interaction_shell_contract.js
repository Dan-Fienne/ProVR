import {ArmedTool, DockPages, ScaleTarget, ShellMode} from '../vr/shell/ShellActions.js';
import {ShellState} from '../vr/shell/ShellState.js';
import {ProteinScalePreset} from '../vr/workspace/VRProteinWorkbench.js';

export function validateVRInteractionShellContract() {
    const issues = [];

    const state = new ShellState();
    state.go(ShellMode.HOME);
    state.arm(ArmedTool.MOVE);
    state.scaleTarget = ScaleTarget.PROTEIN;

    if (state.mode !== ShellMode.HOME) issues.push('ShellState mode failed');
    if (state.armedTool !== ArmedTool.MOVE) issues.push('ShellState armed tool failed');
    if (state.scaleTarget !== ScaleTarget.PROTEIN) issues.push('Scale target failed');

    for (const mode of [ShellMode.START, ShellMode.HOME, ShellMode.VIEW, ShellMode.SURFACE, ShellMode.EDIT, ShellMode.SYSTEM]) {
        if (!Array.isArray(DockPages[mode]) || !DockPages[mode].length) issues.push(`Dock page missing: ${mode}`);
    }

    if (!(ProteinScalePreset.atom > ProteinScalePreset.residue)) issues.push('Protein scale presets invalid');

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            shellState: state.toJSON(),
            pageCount: Object.keys(DockPages).length,
            proteinScalePreset: ProteinScalePreset,
            note: 'Batch 2.4 uses WristDock + ContextInspector + ActionRing, not old flat menu patches.',
        },
    };
}

if (typeof window !== 'undefined') {
    window.validateVRInteractionShellContract = validateVRInteractionShellContract;
}
