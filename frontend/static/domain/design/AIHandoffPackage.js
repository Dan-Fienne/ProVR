function uid(prefix = 'handoff') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function clonePlain(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clonePlain);
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = clonePlain(v);
    return out;
}

/**
 * AIHandoffPackage represents a structured handoff from VR design intent
 * to backend computational modules:
 * docking, align, sequence design, structure prediction, scoring, etc.
 */
export class AIHandoffPackage {
    constructor({
                    id = null,
                    workflowId = null,
                    toolId = null,
                    proteinIds = [],
                    activeProteinId = null,
                    targets = [],
                    designIntents = [],
                    constraints = [],
                    artifacts = [],
                    parameters = {},
                    metadata = {},
                    createdAt = null,
                } = {}) {
        this.id = id || uid('handoff');
        this.workflowId = workflowId;
        this.toolId = toolId;
        this.proteinIds = [...proteinIds];
        this.activeProteinId = activeProteinId || proteinIds[0] || null;
        this.targets = clonePlain(targets);
        this.designIntents = clonePlain(designIntents);
        this.constraints = clonePlain(constraints);
        this.artifacts = clonePlain(artifacts);
        this.parameters = clonePlain(parameters);
        this.metadata = clonePlain(metadata);
        this.createdAt = createdAt || new Date().toISOString();
    }

    toJSON() {
        return {
            id: this.id,
            workflowId: this.workflowId,
            toolId: this.toolId,
            proteinIds: [...this.proteinIds],
            activeProteinId: this.activeProteinId,
            targets: clonePlain(this.targets),
            designIntents: clonePlain(this.designIntents),
            constraints: clonePlain(this.constraints),
            artifacts: clonePlain(this.artifacts),
            parameters: clonePlain(this.parameters),
            metadata: clonePlain(this.metadata),
            createdAt: this.createdAt,
        };
    }
}

export class AIHandoffPackageBuilder {
    constructor({projectSession = null, designIntentStore = null} = {}) {
        this.projectSession = projectSession;
        this.designIntentStore = designIntentStore;
    }

    build({
              workflowId,
              toolId,
              proteinIds = null,
              activeProteinId = null,
              targets = [],
              constraints = [],
              artifacts = [],
              parameters = {},
              metadata = {},
              intentFilter = {},
          } = {}) {
        const session = this.projectSession;
        const ids = proteinIds || session?.proteinIds || [];
        const active = activeProteinId || session?.activeProteinId || ids[0] || null;
        const intents = this.designIntentStore?.list?.(intentFilter) || session?.designIntents || [];

        return new AIHandoffPackage({
            workflowId,
            toolId,
            proteinIds: ids,
            activeProteinId: active,
            targets,
            designIntents: intents.map((intent) => intent.toJSON?.() || intent),
            constraints,
            artifacts,
            parameters,
            metadata,
        });
    }
}
