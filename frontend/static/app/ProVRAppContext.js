import {EventBus} from '../core/event/EventBus.js';
import {ProteinSystem} from '../domain/protein/ProteinSystem.js';
import {StructureLoader} from '../domain/io/StructureLoader.js';
import {CommandManager} from '../core/command/CommandManager.js';
import {ProjectSession} from '../core/project/ProjectSession.js';
import {RepresentationManager} from '../representation/common/RepresentationManager.js';
import {RepresentationRegistry} from '../representation/common/RepresentationRegistry.js';
import {RepresentationContext} from '../representation/common/RepresentationContext.js';
import {DesignIntentStore} from '../domain/design/DesignIntent.js';

import {registerBallStickRepresentation} from '../representation/ballstick/registerBallStickRepresentation.js';
import {registerCartoonRepresentation} from '../representation/cartoon/registerCartoonRepresentation.js';
import {registerLineRepresentation} from '../representation/line/registerLineRepresentation.js';
import {registerSurfaceRepresentation} from '../representation/surface/registerSurfaceRepresentation.js';


export class ProVRAppContext {
    constructor({
                    scene = null,
                    renderer = null,
                    projectName = 'Untitled ProVR Project',
                    registerDefaultRepresentations = true,
                    eventBus = null,
                    proteinSystem = null,
                    commandManager = null,
                    projectSession = null,
                    representationManager = null,
                } = {}) {
        this.eventBus = eventBus || new EventBus({
            allowUnknownEvents: false,
            catchListenerErrors: false,
            maxHistory: 500,
        });

        this.proteinSystem = proteinSystem || new ProteinSystem({initialAtomCapacity: 600000});
        this.structureLoader = new StructureLoader({proteinSystem: this.proteinSystem});
        this.projectSession = projectSession || new ProjectSession({name: projectName});

        this.commandManager = commandManager || new CommandManager({
            eventBus: this.eventBus,
            context: {
                proteinSystem: this.proteinSystem,
                eventBus: this.eventBus,
                projectSession: this.projectSession,
            },
        });

        this.representationRegistry = new RepresentationRegistry();

        this.representationContext = new RepresentationContext({
            proteinSystem: this.proteinSystem,
            eventBus: this.eventBus,
            scene,
            renderer,
        });

        this.representationManager = representationManager || new RepresentationManager({
            context: this.representationContext,
            registry: this.representationRegistry,
            eventBus: this.eventBus,
            projectSession: this.projectSession,
            autoBindEvents: true,
        });

        if (registerDefaultRepresentations) this.registerDefaultRepresentations();

        this.designIntentStore = new DesignIntentStore({
            eventBus: this.eventBus,
            projectSession: this.projectSession,
        });

        this.features = new Map();
        this.services = new Map();
    }

    registerDefaultRepresentations() {
        registerBallStickRepresentation(this.representationManager);
        registerCartoonRepresentation(this.representationManager);
        registerLineRepresentation(this.representationManager);
        registerSurfaceRepresentation(this.representationManager);
    }

    setScene(scene, {renderer = null} = {}) {
        this.representationContext.scene = scene;
        if (renderer) this.representationContext.renderer = renderer;
    }

    registerFeature(name, feature) {
        if (!name || !feature) throw new Error('[ProVRAppContext] name and feature are required');
        this.features.set(name, feature);
        feature.attach?.(this);
        return feature;
    }

    getFeature(name) {
        return this.features.get(name) || null;
    }

    registerService(name, service) {
        if (!name || !service) throw new Error('[ProVRAppContext] name and service are required');
        this.services.set(name, service);
        return service;
    }

    getService(name) {
        return this.services.get(name) || null;
    }

    get activeProteinId() {
        return this.projectSession.activeProteinId;
    }

    get activeModel() {
        return this.activeProteinId ? this.proteinSystem.getProtein(this.activeProteinId) : null;
    }

    summary() {
        return {
            project: this.projectSession.toJSON(),
            eventBus: this.eventBus.summary(),
            commandHistory: this.commandManager.historySummary(),
            representations: this.representationManager.summary(),
            designIntents: this.designIntentStore.summary(),
            proteins: this.proteinSystem.listProteinIds?.() || [],
        };
    }
}
