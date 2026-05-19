function bpmnToMermaid(bpmnXml) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(bpmnXml, "text/xml");

    const nodes = new Map();
    const flows = [];

    // ----------------------------
    // helpers
    // ----------------------------

    function getAttr(el, name) {
        return el.getAttribute(name);
    }

    function addNode(id, label, type) {
        nodes.set(id, {
            id,
            label: label || id,
            type
        });
    }

    // ----------------------------
    // parse BPMN nodes
    // ----------------------------

    const supportedTags = [
        "startEvent",
        "endEvent",
        "task",
        "userTask",
        "serviceTask",
        "exclusiveGateway",
        "parallelGateway",

        // NEW
        "dataObjectReference"
    ];

    supportedTags.forEach(tag => {
        const elements = xml.getElementsByTagNameNS("*", tag);

        for (const el of elements) {
            const id = getAttr(el, "id");
            const name = getAttr(el, "name") || id;

            addNode(id, name, tag);
        }
    });

    const associations = [];

    // dataInputAssociation
    const inputAssociations =
        xml.getElementsByTagNameNS("*", "dataInputAssociation");

    for (const assoc of inputAssociations) {

        const sources =
            assoc.getElementsByTagNameNS("*", "sourceRef");

        const targets =
            assoc.getElementsByTagNameNS("*", "targetRef");

        for (const s of sources) {
            for (const t of targets) {

                associations.push({
                    source: s.textContent.trim(),
                    target: t.textContent.trim(),
                    type: "data"
                });
            }
        }
    }

    // dataOutputAssociation
    const outputAssociations =
        xml.getElementsByTagNameNS("*", "dataOutputAssociation");

    for (const assoc of outputAssociations) {

        const sources =
            assoc.getElementsByTagNameNS("*", "sourceRef");

        const targets =
            assoc.getElementsByTagNameNS("*", "targetRef");

        for (const s of sources) {
            for (const t of targets) {

                associations.push({
                    source: s.textContent.trim(),
                    target: t.textContent.trim(),
                    type: "data"
                });
            }
        }
    }

    // generic association
    const genericAssociations =
        xml.getElementsByTagNameNS("*", "association");

    for (const assoc of genericAssociations) {

        associations.push({
            source: assoc.getAttribute("sourceRef"),
            target: assoc.getAttribute("targetRef"),
            type: "association"
        });
    }

    // ----------------------------
    // parse sequence flows
    // ----------------------------

    const sequenceFlows = xml.getElementsByTagNameNS("*", "sequenceFlow");

    for (const flow of sequenceFlows) {
        flows.push({
            id: getAttr(flow, "id"),
            source: getAttr(flow, "sourceRef"),
            target: getAttr(flow, "targetRef"),
            label: getAttr(flow, "name") || ""
        });
    }

    // ----------------------------
    // Mermaid node renderer
    // ----------------------------

    // function renderNode(node) {
    //     const label = escapeLabel(node.label);

    //     switch (node.type) {
    //         case "startEvent":
    //             return `${node.id}([${label}])`;

    //         case "endEvent":
    //             return `${node.id}([${label}])`;

    //         case "exclusiveGateway":
    //             return `${node.id}{${label}}`;

    //         case "parallelGateway":
    //             return `${node.id}{{${label}}}`;

    //         default:
    //             return `${node.id}[${label}]`;
    //     }
    // }

    function renderNode(node) {

        const label = escapeLabel(node.label);

        switch (node.type) {

            case "startEvent":
                return `${node.id}([${label}])`;

            case "endEvent":
                return `${node.id}([${label}])`;

            case "exclusiveGateway":
                return `${node.id}{${label}}`;

            case "parallelGateway":
                return `${node.id}{{${label}}}`;

            // NEW
            case "dataObjectReference":
                return `${node.id}[/ ${label} /]`;

            default:
                return `${node.id}[${label}]`;
        }
    }

    

    function escapeLabel(text) {
        return text
            .replace(/"/g, "'")
            .replace(/\n/g, " ");
    }

    // ----------------------------
    // generate Mermaid
    // ----------------------------

    const lines = [];

    lines.push("flowchart TD");
    lines.push("");

    // nodes
    for (const node of nodes.values()) {
        lines.push(`    ${renderNode(node)}`);
    }

    lines.push("");

    // flows
    for (const flow of flows) {
        const label = flow.label
            ? `|${escapeLabel(flow.label)}|`
            : "";

        lines.push(
            `    ${flow.source} -->${label} ${flow.target}`
        );
    }

    for (const assoc of associations) {

        // dotted line for data relation
        lines.push(
            `    ${assoc.source} -.-> ${assoc.target}`
        );
    }

    return lines.join("\n");
}
