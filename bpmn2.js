class BPMNToMermaidConverter {

    constructor(options = {}) {

        this.options = {
            direction: options.direction || 'TD',
            renderPools: options.renderPools !== false,
            renderLanes: options.renderLanes !== false,
            renderDataObjects: options.renderDataObjects !== false,
            renderMessageFlows: options.renderMessageFlows !== false,
            renderAssociations: options.renderAssociations !== false,
            ...options
        };

        this.nodes = new Map();
        this.edges = [];
        this.subgraphs = [];

        this.idCounter = 0;
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    convert(xmlString) {

        this.reset();

        const xml = this.parseXML(xmlString);

        this.parseDefinitions(xml);

        return this.generateMermaid();
    }

    reset() {

        this.nodes.clear();
        this.edges = [];
        this.subgraphs = [];
        this.idCounter = 0;
    }

    // =====================================================
    // XML
    // =====================================================

    parseXML(xmlString) {

        const parser = new DOMParser();

        const xml = parser.parseFromString(
            xmlString,
            'text/xml'
        );

        const parserError = xml.querySelector('parsererror');

        if (parserError) {
            throw new Error(
                'Invalid BPMN XML: ' + parserError.textContent
            );
        }

        return xml;
    }

    // =====================================================
    // DEFINITIONS
    // =====================================================

    parseDefinitions(xml) {

        this.parseCollaboration(xml);
        this.parseProcesses(xml);
        this.parseFlows(xml);
        this.parseAssociations(xml);
    }

    // =====================================================
    // COLLABORATION / POOLS
    // =====================================================

    parseCollaboration(xml) {

        const participants = this.findAll(xml, 'participant');

        for (const participant of participants) {

            const id = this.attr(participant, 'id');
            const name = this.attr(participant, 'name') || id;
            const processRef = this.attr(participant, 'processRef');

            this.subgraphs.push({
                id,
                name,
                processRef,
                type: 'pool',
                children: []
            });
        }

        if (this.options.renderMessageFlows) {
            this.parseMessageFlows(xml);
        }
    }

    parseMessageFlows(xml) {

        const flows = this.findAll(xml, 'messageFlow');

        for (const flow of flows) {

            this.edges.push({
                id: this.attr(flow, 'id'),
                source: this.attr(flow, 'sourceRef'),
                target: this.attr(flow, 'targetRef'),
                label: this.attr(flow, 'name') || '',
                type: 'messageFlow'
            });
        }
    }

    // =====================================================
    // PROCESSES
    // =====================================================

    parseProcesses(xml) {

        const processes = this.findAll(xml, 'process');

        for (const process of processes) {

            this.parseProcess(process);
        }
    }

    parseProcess(processEl) {

        this.parseLanes(processEl);

        this.parseElements(processEl);
    }

    // =====================================================
    // LANES
    // =====================================================

    parseLanes(processEl) {

        if (!this.options.renderLanes) {
            return;
        }

        const laneSets = this.findAll(processEl, 'laneSet');

        for (const laneSet of laneSets) {

            const lanes = this.findAll(laneSet, 'lane');

            for (const lane of lanes) {

                this.subgraphs.push({
                    id: this.attr(lane, 'id'),
                    name: this.attr(lane, 'name') || 'Lane',
                    type: 'lane',
                    children: []
                });
            }
        }
    }

    // =====================================================
    // ELEMENTS
    // =====================================================

    parseElements(root) {

        const elementParsers = {

            // events
            startEvent: el => this.parseEvent(el, 'startEvent'),
            endEvent: el => this.parseEvent(el, 'endEvent'),
            intermediateThrowEvent: el => this.parseEvent(el, 'intermediateThrowEvent'),
            intermediateCatchEvent: el => this.parseEvent(el, 'intermediateCatchEvent'),
            boundaryEvent: el => this.parseEvent(el, 'boundaryEvent'),

            // tasks
            task: el => this.parseTask(el, 'task'),
            userTask: el => this.parseTask(el, 'userTask'),
            serviceTask: el => this.parseTask(el, 'serviceTask'),
            scriptTask: el => this.parseTask(el, 'scriptTask'),
            businessRuleTask: el => this.parseTask(el, 'businessRuleTask'),
            manualTask: el => this.parseTask(el, 'manualTask'),
            receiveTask: el => this.parseTask(el, 'receiveTask'),
            sendTask: el => this.parseTask(el, 'sendTask'),

            // subprocess
            subProcess: el => this.parseSubProcess(el),
            transaction: el => this.parseSubProcess(el, 'transaction'),
            callActivity: el => this.parseCallActivity(el),

            // gateways
            exclusiveGateway: el => this.parseGateway(el, 'exclusiveGateway'),
            inclusiveGateway: el => this.parseGateway(el, 'inclusiveGateway'),
            parallelGateway: el => this.parseGateway(el, 'parallelGateway'),
            eventBasedGateway: el => this.parseGateway(el, 'eventBasedGateway'),
            complexGateway: el => this.parseGateway(el, 'complexGateway'),

            // data
            dataObject: el => this.parseDataObject(el),
            dataObjectReference: el => this.parseDataObject(el),
            dataStoreReference: el => this.parseDataStore(el),

            // artifacts
            group: el => this.parseGroup(el),
            textAnnotation: el => this.parseTextAnnotation(el)
        };

        for (const [tag, parser] of Object.entries(elementParsers)) {

            const elements = this.findAll(root, tag);

            for (const element of elements) {
                parser(element);
            }
        }
    }

    // =====================================================
    // EVENTS
    // =====================================================

    parseEvent(el, type) {

        const eventDefinition = this.detectEventDefinition(el);

        this.addNode({
            id: this.attr(el, 'id'),
            label: this.attr(el, 'name') || type,
            type,
            eventDefinition,
            attachedToRef: this.attr(el, 'attachedToRef')
        });
    }

    detectEventDefinition(el) {

        const defs = [
            'messageEventDefinition',
            'timerEventDefinition',
            'signalEventDefinition',
            'errorEventDefinition',
            'escalationEventDefinition',
            'conditionalEventDefinition',
            'compensateEventDefinition',
            'terminateEventDefinition',
            'linkEventDefinition'
        ];

        for (const def of defs) {
            if (this.find(el, def)) {
                return def;
            }
        }

        return null;
    }

    // =====================================================
    // TASKS
    // =====================================================

    parseTask(el, type) {

        this.addNode({
            id: this.attr(el, 'id'),
            label: this.attr(el, 'name') || type,
            type
        });
    }

    // =====================================================
    // SUBPROCESS
    // =====================================================

    parseSubProcess(el, subtype = 'subProcess') {

        const id = this.attr(el, 'id');

        this.addNode({
            id,
            label: this.attr(el, 'name') || subtype,
            type: subtype
        });

        const children = [];

        const childFlowElements = this.findAll(el, '*');

        for (const child of childFlowElements) {

            if (child === el) {
                continue;
            }

            const childId = this.attr(child, 'id');

            if (childId) {
                children.push(childId);
            }
        }

        this.subgraphs.push({
            id: `subgraph_${id}`,
            name: this.attr(el, 'name') || 'SubProcess',
            type: 'subprocess',
            children
        });

        this.parseElements(el);
    }

    // =====================================================
    // CALL ACTIVITY
    // =====================================================

    parseCallActivity(el) {

        this.addNode({
            id: this.attr(el, 'id'),
            label: this.attr(el, 'name') || 'Call Activity',
            type: 'callActivity',
            calledElement: this.attr(el, 'calledElement')
        });
    }

    // =====================================================
    // GATEWAYS
    // =====================================================

    parseGateway(el, type) {

        this.addNode({
            id: this.attr(el, 'id'),
            label: this.attr(el, 'name') || type,
            type
        });
    }

    // =====================================================
    // DATA
    // =====================================================

    parseDataObject(el) {

        if (!this.options.renderDataObjects) {
            return;
        }

        this.addNode({
            id: this.attr(el, 'id'),
            label: this.attr(el, 'name') || 'Data',
            type: 'dataObject'
        });
    }

    parseDataStore(el) {

        this.addNode({
            id: this.attr(el, 'id'),
            label: this.attr(el, 'name') || 'Store',
            type: 'dataStore'
        });
    }

    // =====================================================
    // ARTIFACTS
    // =====================================================

    parseGroup(el) {

        this.addNode({
            id: this.attr(el, 'id'),
            label: this.attr(el, 'name') || 'Group',
            type: 'group'
        });
    }

    parseTextAnnotation(el) {

        const textEl = this.find(el, 'text');

        this.addNode({
            id: this.attr(el, 'id'),
            label: textEl ? textEl.textContent : 'Annotation',
            type: 'textAnnotation'
        });
    }

    // =====================================================
    // FLOWS
    // =====================================================

    parseFlows(xml) {

        const flows = this.findAll(xml, 'sequenceFlow');

        for (const flow of flows) {

            this.edges.push({
                id: this.attr(flow, 'id'),
                source: this.attr(flow, 'sourceRef'),
                target: this.attr(flow, 'targetRef'),
                label: this.attr(flow, 'name') || '',
                type: 'sequenceFlow'
            });
        }

        this.parseDataAssociations(xml);
    }

    parseDataAssociations(xml) {

        const inputAssociations = this.findAll(
            xml,
            'dataInputAssociation'
        );

        for (const assoc of inputAssociations) {

            const sourceRefs = this.findAll(assoc, 'sourceRef');
            const targetRefs = this.findAll(assoc, 'targetRef');

            for (const source of sourceRefs) {
                for (const target of targetRefs) {

                    this.edges.push({
                        source: source.textContent.trim(),
                        target: target.textContent.trim(),
                        type: 'dataAssociation'
                    });
                }
            }
        }

        const outputAssociations = this.findAll(
            xml,
            'dataOutputAssociation'
        );

        for (const assoc of outputAssociations) {

            const sourceRefs = this.findAll(assoc, 'sourceRef');
            const targetRefs = this.findAll(assoc, 'targetRef');

            for (const source of sourceRefs) {
                for (const target of targetRefs) {

                    this.edges.push({
                        source: source.textContent.trim(),
                        target: target.textContent.trim(),
                        type: 'dataAssociation'
                    });
                }
            }
        }
    }

    // =====================================================
    // ASSOCIATIONS
    // =====================================================

    parseAssociations(xml) {

        if (!this.options.renderAssociations) {
            return;
        }

        const associations = this.findAll(xml, 'association');

        for (const assoc of associations) {

            this.edges.push({
                source: this.attr(assoc, 'sourceRef'),
                target: this.attr(assoc, 'targetRef'),
                type: 'association'
            });
        }
    }

    // =====================================================
    // NODE STORAGE
    // =====================================================

    addNode(node) {

        this.nodes.set(node.id, node);
    }

    // =====================================================
    // MERMAID
    // =====================================================

    generateMermaid() {

        const lines = [];

        lines.push(`flowchart ${this.options.direction}`);
        lines.push('');

        this.renderSubgraphs(lines);
        this.renderStandaloneNodes(lines);

        lines.push('');

        this.renderEdges(lines);

        return lines.join('\n');
    }

    renderSubgraphs(lines) {

        for (const subgraph of this.subgraphs) {

            lines.push(`subgraph ${subgraph.id}["${this.escape(subgraph.name)}"]`);

            for (const childId of subgraph.children || []) {

                const node = this.nodes.get(childId);

                if (!node) {
                    continue;
                }

                lines.push(`    ${this.renderNode(node)}`);
            }

            lines.push('end');
            lines.push('');
        }
    }

    renderStandaloneNodes(lines) {

        for (const node of this.nodes.values()) {

            if (this.isNodeInsideSubgraph(node.id)) {
                continue;
            }

            lines.push(this.renderNode(node));
        }
    }

    isNodeInsideSubgraph(nodeId) {

        return this.subgraphs.some(sub =>
            (sub.children || []).includes(nodeId)
        );
    }

    renderNode(node) {

        const label = this.escape(node.label);

        switch (node.type) {

            // =================================================
            // EVENTS
            // =================================================

            case 'startEvent':
                return `${node.id}(([${label}]))`;

            case 'endEvent':
                return `${node.id}(((${label})))`;

            case 'intermediateThrowEvent':
            case 'intermediateCatchEvent':
                return `${node.id}((${label}))`;

            case 'boundaryEvent':
                return `${node.id}((${label}))`;

            // =================================================
            // TASKS
            // =================================================

            case 'task':
            case 'userTask':
            case 'serviceTask':
            case 'scriptTask':
            case 'businessRuleTask':
            case 'manualTask':
            case 'receiveTask':
            case 'sendTask':
                return `${node.id}[${label}]`;

            // =================================================
            // SUBPROCESS
            // =================================================

            case 'subProcess':
            case 'transaction':
                return `${node.id}[[${label}]]`;

            case 'callActivity':
                return `${node.id}[[CALL: ${label}]]`;

            // =================================================
            // GATEWAYS
            // =================================================

            case 'exclusiveGateway':
                return `${node.id}{${label}}`;

            case 'inclusiveGateway':
                return `${node.id}{OR ${label}}`;

            case 'parallelGateway':
                return `${node.id}{{${label}}}`;

            case 'eventBasedGateway':
                return `${node.id}{EVENT ${label}}`;

            case 'complexGateway':
                return `${node.id}{COMPLEX ${label}}`;

            // =================================================
            // DATA
            // =================================================

            case 'dataObject':
                return `${node.id}[/ ${label} /]`;

            case 'dataStore':
                return `${node.id}[( ${label} )]`;

            // =================================================
            // ARTIFACTS
            // =================================================

            case 'group':
                return `${node.id}[GROUP: ${label}]`;

            case 'textAnnotation':
                return `${node.id}>${label}]`;

            default:
                return `${node.id}[${label}]`;
        }
    }

    renderEdges(lines) {

        for (const edge of this.edges) {

            const source = edge.source;
            const target = edge.target;

            if (!source || !target) {
                continue;
            }

            const label = edge.label
                ? `|${this.escape(edge.label)}|`
                : '';

            switch (edge.type) {

                case 'sequenceFlow':
                    lines.push(`${source} -->${label} ${target}`);
                    break;

                case 'messageFlow':
                    lines.push(`${source} -.${label}.-> ${target}`);
                    break;

                case 'dataAssociation':
                    lines.push(`${source} -.-> ${target}`);
                    break;

                case 'association':
                    lines.push(`${source} --- ${target}`);
                    break;

                default:
                    lines.push(`${source} --> ${target}`);
            }
        }
    }

    // =====================================================
    // XML HELPERS
    // =====================================================

    find(root, localName) {

        return root.getElementsByTagNameNS('*', localName)[0] || null;
    }

    findAll(root, localName) {

        return Array.from(
            root.getElementsByTagNameNS('*', localName)
        );
    }

    attr(el, name) {

        return el.getAttribute(name);
    }

    escape(str) {

        return String(str)
            .replace(/\n/g, ' ')
            .replace(/"/g, "'")
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}

