function drawioToMermaid(xmlString) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlString, "text/xml");

  const cells = xml.getElementsByTagName("mxCell");

  const nodes = new Map();
  const edges = [];

  // 1. Собираем узлы и рёбра
  for (const cell of cells) {
    const id = cell.getAttribute("id");
    const value = cell.getAttribute("value");
    const source = cell.getAttribute("source");
    const target = cell.getAttribute("target");
    const vertex = cell.getAttribute("vertex");
    const edge = cell.getAttribute("edge");

    if (vertex === "1") {
      nodes.set(id, sanitize(value || id));
    }

    if (edge === "1") {
      edges.push({
        source,
        target,
        label: sanitize(value || "")
      });
    }
  }

  // 2. Генерация Mermaid
  let mermaid = "flowchart TD\n";

  // рёбра
  for (const e of edges) {
    const from = nodes.get(e.source) || e.source;
    const to = nodes.get(e.target) || e.target;

    if (e.label) {
      mermaid += `  ${from} -->|${e.label}| ${to}\n`;
    } else {
      mermaid += `  ${from} --> ${to}\n`;
    }
  }

  return mermaid;
}

// очистка строк под Mermaid id
function sanitize(str) {
  return str
    .replace(/<[^>]*>/g, "")     // убрать HTML
    .replace(/[^\w\u0400-\u04FF]+/g, "_") // всё в безопасный id
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .trim() || "node";
}
