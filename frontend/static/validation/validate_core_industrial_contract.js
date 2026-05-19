import {EventBus} from '../core/event/EventBus.js';
import {EventTypes} from '../core/event/EventTypes.js';
import {CommandManager} from '../core/command/CommandManager.js';
import {ProjectSession} from '../core/project/ProjectSession.js';
import {DesignIntent, DesignIntentKind, DesignIntentStore} from '../domain/design/DesignIntent.js';
import {AIHandoffPackageBuilder} from '../domain/design/AIHandoffPackage.js';

export function validateCoreIndustrialContract() {
    const issues = [];

    const eventBus = new EventBus();
    let eventHit = false;
    eventBus.on(EventTypes.PROJECT_CREATED, () => { eventHit = true; });
    eventBus.emit(EventTypes.PROJECT_CREATED, {projectId: 'test', source: 'validator'});
    if (!eventHit) issues.push('EventBus did not dispatch PROJECT_CREATED');

    const project = new ProjectSession({name: 'Validator Project'});
    project.addProtein('protein_a');
    if (project.activeProteinId !== 'protein_a') issues.push('ProjectSession activeProteinId failed');

    const intentStore = new DesignIntentStore({eventBus, projectSession: project});
    const intent = intentStore.record(new DesignIntent({
        kind: DesignIntentKind.SELECTION,
        target: {proteinId: 'protein_a', kind: 'residue', residueIds: ['r1']},
        operation: 'select',
    }));
    if (!intent.id || project.designIntents.length !== 1) issues.push('DesignIntentStore failed to record into ProjectSession');

    const handoff = new AIHandoffPackageBuilder({
        projectSession: project,
        designIntentStore: intentStore,
    }).build({
        workflowId: 'validator-workflow',
        toolId: 'validator-tool',
        targets: [{proteinId: 'protein_a', kind: 'protein'}],
    });
    if (!handoff.id || handoff.designIntents.length !== 1) issues.push('AIHandoffPackageBuilder failed');

    const manager = new CommandManager({eventBus, context: {}});
    let executed = false;
    let undone = false;
    manager.execute({
        type: 'validator-command',
        description: 'validator command',
        execute() { executed = true; return true; },
        undo() { undone = true; return true; },
    });
    manager.undo();
    if (!executed || !undone) issues.push('CommandManager execute/undo failed');

    return {
        ok: issues.length === 0,
        issues,
        summary: {
            eventBus: eventBus.summary(),
            project: project.toJSON(),
            designIntents: intentStore.summary(),
            handoff: handoff.toJSON(),
            commandHistory: manager.historySummary(),
        },
    };
}

if (typeof window !== 'undefined') {
    window.validateCoreIndustrialContract = validateCoreIndustrialContract;
}
