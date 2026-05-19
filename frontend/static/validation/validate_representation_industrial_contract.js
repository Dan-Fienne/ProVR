import {RepresentationContext} from '../representation/common/RepresentationContext.js';
import {RepresentationRegistry} from '../representation/common/RepresentationRegistry.js';
import {RepresentationManager} from '../representation/common/RepresentationManager.js';
import {RepresentationBase} from '../representation/common/RepresentationBase.js';
import {validateRepresentationLifecycle} from '../representation/common/RepresentationLifecycleValidator.js';

export class MockScene {
    constructor() { this.children = []; }
    add(object) { this.children.push(object); }
    remove(object) { this.children = this.children.filter((child) => child !== object); }
}

class ContractDebugRepresentation extends RepresentationBase {
    build() {
        if (this._built) return;
        this.root = {
            name: `ContractDebug:${this.id}`,
            visible: this.visible,
            userData: {},
            children: [],
            clear() { this.children.length = 0; },
        };
        const target = {
            proteinId: this.proteinId,
            kind: 'atom',
            atomIds: ['a1'],
            residueIds: [],
            chainIds: [],
            metadata: {},
        };
        const object = {name: 'pickable:a1', userData: {}};
        this.registerPickable(object, target);
        this.context.scene.add(this.root);
        this._built = true;
        this._disposed = false;
    }
}

export function validateRepresentationIndustrialContract({proteinSystem, eventBus = null} = {}) {
    const issues = [];

    if (!proteinSystem) {
        issues.push('proteinSystem is required');
        return {ok: false, issues};
    }

    const scene = new MockScene();
    const context = new RepresentationContext({proteinSystem, eventBus, scene});
    const registry = new RepresentationRegistry();
    const manager = new RepresentationManager({context, registry, eventBus, autoBindEvents: false});

    registry.register('contract-debug', {
        family: 'debug',
        factory: ({spec, context}) => new ContractDebugRepresentation({spec, context}),
        capabilities: {pickAtom: true, rendersThreeObjects: false},
        defaults: {interaction: {pickable: true, targetLevel: 'atom'}},
    });

    const proteinId = proteinSystem.listProteinIds?.()[0] || [...(proteinSystem.proteins?.keys?.() || [])][0] || null;
    if (!proteinId) issues.push('proteinSystem has no protein to test');

    let repId = null;
    if (proteinId) {
        repId = manager.create({type: 'contract-debug', proteinId, id: 'contract_debug_rep'});
        const rep = manager.get(repId);
        if (!rep?.built) issues.push('representation did not build');
        if (rep?.getPickables?.().length !== 1) issues.push('representation pickables not registered');
        if ((manager.context.pickRegistry.summary().total || 0) !== 1) issues.push('PickRegistry did not register target');
        manager.setVisible(repId, false);
        if (rep.visible !== false) issues.push('setVisible failed');
        manager.remove(repId);
        if (manager.get(repId)) issues.push('remove failed');
        if (manager.context.pickRegistry.summary().total !== 0) issues.push('PickRegistry cleanup failed after remove');
    }

    const lifecycle = validateRepresentationLifecycle({manager});

    return {
        ok: issues.length === 0 && lifecycle.ok,
        issues: [...issues, ...lifecycle.issues],
        summary: {
            registry: registry.summary(),
            manager: manager.summary(),
            lifecycle,
        },
    };
}

if (typeof window !== 'undefined') {
    window.validateRepresentationIndustrialContract = validateRepresentationIndustrialContract;
}
