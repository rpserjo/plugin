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
        "parallelGateway"
    ];

    supportedTags.forEach(tag => {
        const elements = xml.getElementsByTagNameNS("*", tag);

        for (const el of elements) {
            const id = getAttr(el, "id");
            const name = getAttr(el, "name") || id;

            addNode(id, name, tag);
        }
    });

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

    return lines.join("\n");
}
console.log(bpmnToMermaid(bpmn));
```
