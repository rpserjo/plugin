// md-parse.js
// Usage: node md-parse.js path/to/file.md
// Output: prints JSON with tree of sections; each node: { title, level, content, tables, children }

const fs = require('fs');
const path = require('path');

function readLines(filename) {
  return fs.readFileSync(filename, 'utf8').replace(/\r\n/g, '\n').split('\n');
}

// detect ATX heading: up to 3 leading spaces allowed per CommonMark
const headingRE = /^\s{0,3}(#{1,6})\s+(.*?)(\s+#+\s*)?$/;

// detect start of fenced code: ``` or ~~~ possibly with language
const fenceStartRE = /^(\s{0,3})(`{3,}|~{3,})(.*)$/;

// detect table separator line (e.g. |---|:---:| --- | ---: )
const tableSepRE = /^\s*\|?(?:\s*[:\-]+[:\s]*\|)+\s*$/;

// decide if a line looks like a table row (has pipe chars or is TSV style)
// we'll treat pipe-containing lines as candidate table rows
const tableRowRE = /.*\|.*/;

function parseMarkdownToSections(lines) {
  const root = { title: null, level: 0, contentLines: [], tables: [], children: [] };
  const stack = [root];
  let inFence = false;
  let currentFenceMarker = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fence handling
    const fenceMatch = line.match(fenceStartRE);
    if (fenceMatch) {
      const marker = fenceMatch[2];
      if (!inFence) {
        inFence = true;
        currentFenceMarker = marker;
      } else if (marker[0] === currentFenceMarker[0] && marker.length >= currentFenceMarker.length) {
        // closing fence (basic check)
        inFence = false;
        currentFenceMarker = null;
      }
      // push line into current section content and continue
      stack[stack.length - 1].contentLines.push(line);
      i++;
      continue;
    }

    if (!inFence) {
      const m = line.match(headingRE);
      if (m) {
        const level = m[1].length;
        const title = m[2].trim();

        // create node
        const node = { title, level, contentLines: [], tables: [], children: [] };

        // find parent: the nearest stack item with level < node.level
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }
        stack[stack.length - 1].children.push(node);
        stack.push(node);

        i++;
        continue;
      }
    }

    // otherwise append to current section content
    stack[stack.length - 1].contentLines.push(line);
    i++;
  }

  return root;
}

// find tables inside contentLines (skip fenced code inside section)
function extractTablesFromContent(contentLines) {
  const tables = [];
  let inFence = false;
  let currentFenceMarker = null;

  let i = 0;
  while (i < contentLines.length) {
    const line = contentLines[i];

    // fence handling
    const fenceMatch = line.match(fenceStartRE);
    if (fenceMatch) {
      const marker = fenceMatch[2];
      if (!inFence) {
        inFence = true;
        currentFenceMarker = marker;
      } else if (marker[0] === currentFenceMarker[0] && marker.length >= currentFenceMarker.length) {
        inFence = false;
        currentFenceMarker = null;
      }
      i++;
      continue;
    }

    // only detect tables when not in fenced code
    if (!inFence) {
      // look ahead: need at least two lines: header row and separator row
      if (i + 1 < contentLines.length) {
        const line1 = contentLines[i];
        const line2 = contentLines[i + 1];

        // both lines should look like table candidate: header contains '|' and second line is separator
        if (tableRowRE.test(line1) && tableSepRE.test(line2)) {
          // collect table until a non-table-row line
          const start = i;
          let j = i + 2;
          while (j < contentLines.length && tableRowRE.test(contentLines[j])) {
            j++;
          }
          const tableLines = contentLines.slice(start, j);
          tables.push({
            from: start,
            to: j - 1,
            markdown: tableLines.join('\n')
          });
          i = j;
          continue;
        }
      }
    }

    i++;
  }

  return tables;
}

function buildTreeWithTables(root) {
  // post-order traversal: for each node, extract tables and also convert contentLines to single content string
  function visit(node) {
    // extract tables
    node.tables = extractTablesFromContent(node.contentLines);
    node.content = node.contentLines.join('\n').trim();
    // remove contentLines to keep output cleaner
    delete node.contentLines;
    node.children.forEach(visit);
  }
  visit(root);
  return root;
}

// CLI
if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('Usage: node md-parse.js path/to/file.md');
    process.exit(2);
  }
  const fname = argv[0];
  if (!fs.existsSync(fname)) {
    console.error('File not found:', fname);
    process.exit(3);
  }
  const lines = readLines(fname);
  const root = parseMarkdownToSections(lines);
  const tree = buildTreeWithTables(root);

  // Pretty-print JSON. You can change to writing to file if needed.
  console.log(JSON.stringify(tree, null, 2));
}

module.exports = { parseMarkdownFromString: (s) => {
  const lines = s.replace(/\r\n/g, '\n').split('\n');
  const root = parseMarkdownToSections(lines);
  return buildTreeWithTables(root);
} };
