const fs = require('fs');

// Load the JSON file
const rawData = fs.readFileSync('test2.json', 'utf8');
const jsonData = JSON.parse(rawData);
const root = jsonData.state.value; // The root node array

// Function to parse attributes array into an object
function parseAttributes(attrs) {
  const attrObj = {};
  if (attrs && attrs[0] === 3) {
    for (let i = 1; i < attrs.length; i += 2) {
      const key = attrs[i];
      const value = attrs[i + 1];
      attrObj[key] = value;
    }
  }
  return attrObj;
}

// Recursive function to convert a node array to Markdown
function nodeToMarkdown(node) {
  if (!Array.isArray(node)) return '';

  // Parse node structure: [4, 17, 0, tag, 1, contentArray, 2, attrsArray]
  const tag = node[3];
  const content = node[5]; // [18, ...subnodes or strings]
  const attrs = node[7]; // [3, key, val, ...]
  const attrObj = parseAttributes(attrs);

  // Parse content
  let contentMd = '';
  if (content && content[0] === 18) {
    for (let i = 1; i < content.length; i++) {
      const child = content[i];
      if (typeof child === 'string') {
        contentMd += child;
      } else if (Array.isArray(child)) {
        contentMd += nodeToMarkdown(child);
      }
    }
  }

  // Handle specific tags
  switch (tag) {
    case 'body':
      // Root body: just process children
      return contentMd;

    case 'h1':
      return `# ${contentMd.trim()}\n\n`;

    case 'p':
      if (attrObj['class'] === 'auto-cursor-target') {
        return contentMd.trim() + '\n'; // Minimal formatting for special paragraphs
      }
      return contentMd.trim() + '\n\n';

    case 'br':
      return '\n';

    case 'a':
      const href = attrObj['href'] || '#';
      return `[${contentMd.trim()}](${href})`;

    case 'strong':
      return `**${contentMd.trim()}**`;

    case 'img':
      const src = attrObj['data-image-src'] || attrObj['src'] || '';
      const alt = attrObj['alt'] || 'image';
      return `![${alt}](${src})\n\n`;

    case 'table':
      // Check if it's a macro (like expand)
      if (attrObj['class'] && attrObj['class'].includes('wysiwyg-macro')) {
        const macroName = attrObj['data-macro-name'];
        const macroTitle = attrObj['data-macro-parameters']?.split('title=')[1] || 'Expand';
        // Treat as collapsible section in Markdown (using <details>)
        // Note: Markdown doesn't natively support collapsible, but we can use HTML for it
        return `<details><summary>${macroTitle}</summary>\n\n${contentMd}\n</details>\n\n`;
      } else {
        // Regular table
        return tableToMarkdown(content) + '\n';
      }

    default:
      // For unknown tags, just return content (e.g., colgroup, col, etc.)
      return contentMd;
  }
}

// Function to convert table content to Markdown table
function tableToMarkdown(tableContent) {
  if (!tableContent || tableContent[0] !== 18) return '';

  let rows = [];
  let isFirstRow = true;

  // Find tbody
  let tbodyContent;
  for (let i = 1; i < tableContent.length; i++) {
    const child = tableContent[i];
    if (Array.isArray(child) && child[3] === 'tbody') {
      tbodyContent = child[5]; // tbody content [18, ...tr]
      break;
    }
  }

  if (!tbodyContent) return '';

  // Process tr in tbody
  for (let i = 1; i < tbodyContent.length; i++) {
    const tr = tbodyContent[i];
    if (Array.isArray(tr) && tr[3] === 'tr') {
      const trContent = tr[5]; // [18, ...th/td]
      let row = [];
      for (let j = 1; j < trContent.length; j++) {
        const cell = trContent[j];
        if (Array.isArray(cell)) {
          const cellTag = cell[3]; // th or td
          const cellContent = cell[5]; // [18, ...]
          let cellMd = '';
          for (let k = 1; k < cellContent.length; k++) {
            const subChild = cellContent[k];
            if (typeof subChild === 'string') {
              cellMd += subChild;
            } else if (Array.isArray(subChild)) {
              cellMd += nodeToMarkdown(subChild);
            }
          }
          row.push(cellMd.trim());
        }
      }
      rows.push(row);
    }
  }

  if (rows.length === 0) return '';

  // Build Markdown table
  let mdTable = '';
  const header = rows[0];
  mdTable += '| ' + header.join(' | ') + ' |\n';
  mdTable += '| ' + header.map(() => '---').join(' | ') + ' |\n';

  for (let r = 1; r < rows.length; r++) {
    mdTable += '| ' + rows[r].join(' | ') + ' |\n';
  }

  return mdTable;
}

// Convert the root node
const markdown = nodeToMarkdown(root);

// Output to console or file
console.log(markdown);
fs.writeFileSync('output.md', markdown, 'utf8');
