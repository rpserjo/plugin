function drawioToMermaid(xmlString) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlString, "text/xml");

  const cells = [...xml.getElementsByTagName("mxCell")];

  const nodes = new Map();        // id -> node
  const edges = [];
  const containers = new Map();   // id -> children ids
  const stylesMap = new Map();    // style signature -> className

  let direction = "TD";

  // ---------------------------
  // 1. Parse cells
  // ---------------------------
  for (const cell of cells) {
    const id = cell.getAttribute("id");
    const value = cell.getAttribute("value") || id;
    const source = cell.getAttribute("source");
    const target = cell.getAttribute("target");
    const vertex = cell.getAttribute("vertex");
    const edge = cell.getAttribute("edge");
    const parent = cell.getAttribute("parent");
    const style = cell.getAttribute("style") || "";

    // detect layout hint from styles (very simplified heuristic)
    if (style.includes("horizontalFlow") || style.includes("leftToRight")) {
      direction = "LR";
    }

    // NODE
    if (vertex === "1") {
      nodes.set(id, {
        id,
        label: sanitizeLabel(value),
        style,
        parent: parent !== "1" ? parent : null
      });

      // register container relationship
      if (parent && parent !== "1") {
        if (!containers.has(parent)) containers.set(parent, []);
        containers.get(parent).push(id);
      }
    }

    // EDGE
    if (edge === "1") {
      edges.push({
        source,
        target,
        label: sanitizeLabel(value),
        style
      });
    }
  }

  // ---------------------------
  // 2. Style → classDef mapping
  // ---------------------------
  function getClass(style) {
    if (!style) return null;

    if (stylesMap.has(style)) {
      return stylesMap.get(style);
    }

    const className = "c" + (stylesMap.size + 1);

    const classDef = styleToClassDef(style);
    stylesMap.set(style, { className, classDef });

    return stylesMap.get(style);
  }

  function styleToClassDef(style) {
    // очень упрощённый парсер draw.io style string
    const fill = match(style, "fillColor");
    const stroke = match(style, "strokeColor");
    const fontColor = match(style, "fontColor");

    let def = [];

    if (fill) def.push(`fill:${fill}`);
    if (stroke) def.push(`stroke:${stroke}`);
    if (fontColor) def.push(`color:${fontColor}`);

    return def.join(",");
  }

  function match(style, key) {
    const m = style.match(new RegExp(key + "=#?([a-zA-Z0-9]+)"));
    return m ? "#" + m[1] : null;
  }

  // ---------------------------
  // 3. Build Mermaid
  // ---------------------------
  let mermaid = `flowchart ${direction}\n\n`;

  // ---------------------------
  // 3.1 Subgraphs (containers)
  // ---------------------------
  const usedAsChild = new Set();

  for (const [parent, children] of containers.entries()) {
    mermaid += `  subgraph ${sanitizeId(parent)}\n`;

    for (const child of children) {
      usedAsChild.add(child);
      const node = nodes.get(child);
      if (node) {
        mermaid += `    ${sanitizeId(node.id)}["${node.label}"]\n`;
      }
    }

    mermaid += `  end\n\n`;
  }

  // ---------------------------
  // 3.2 Standalone nodes
  // ---------------------------
  for (const node of nodes.values()) {
    if (usedAsChild.has(node.id)) continue;
    mermaid += `  ${sanitizeId(node.id)}["${node.label}"]\n`;
  }

  mermaid += "\n";

  // ---------------------------
  // 3.3 Edges + styles
  // ---------------------------
  for (const e of edges) {
    const from = sanitizeId(e.source);
    const to = sanitizeId(e.target);

    const label = e.label ? `|${e.label}|` : "";

    mermaid += `  ${from} -->${label} ${to}\n`;

    const cls = getClass(e.style);
    if (cls) {
      mermaid += `  class ${from} ${cls.className}\n`;
      mermaid += `  class ${to} ${cls.className}\n`;
    }
  }

  // ---------------------------
  // 3.4 classDef block
  // ---------------------------
  if (stylesMap.size > 0) {
    mermaid += "\n";
    for (const { className, classDef } of stylesMap.values()) {
      mermaid += `  classDef ${className} ${classDef}\n`;
    }
  }

  return mermaid;
}

// ---------------------------
// utils
// ---------------------------
function sanitizeLabel(str) {
  return str
    .replace(/<[^>]*>/g, "")
    .replace(/"/g, "'")
    .trim() || "node";
}

function sanitizeId(str) {
  return "n" + String(str).replace(/[^\w]/g, "_");
}
