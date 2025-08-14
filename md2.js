const fs = require('fs');

const parseAttributes = (attrs) => {
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

const nodeToMarkdown = (node, indentLevel = 0, listType = null, listIndex = 0) => {
    if (!Array.isArray(node)) return '';

    const tag = node[3];
    const content = node[5];
    const attrs = node[7];
    const attrObj = parseAttributes(attrs);

    let contentMd = '';
    if (content && content[0] === 18) {
        let currentListIndex = listIndex;
        for (let i = 1; i < content.length; i++) {
            const child = content[i];
            if (typeof child === 'string') {
                contentMd += child;
            } else if (Array.isArray(child)) {
                contentMd += nodeToMarkdown(child, indentLevel + (tag === 'ul' || tag === 'ol' ? 1 : 0), tag === 'ul' || tag === 'ol' ? tag : listType, tag === 'ol' ? ++currentListIndex : currentListIndex);
            }
        }
    }

    switch (tag) {
        case 'body':
            return contentMd;

        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
            const level = parseInt(tag.substring(1));
            const hashes = '#'.repeat(level);
            return `${hashes} ${contentMd.trim().replace(/\n+/g, ' ')}\n\n`;

        case 'p':
            if (attrObj['class'] === 'auto-cursor-target') {
                return contentMd.trim().replace(/\n+/g, '\n') + '\n';
            }
            return contentMd.trim().replace(/\n+/g, '\n') + '\n\n';

        case 'br':
        return '\n';

        case 'a':
            const href = attrObj['href'] || '#';
            return `[${contentMd.trim().replace(/\n+/g, ' ')}](${href})`;

        case 'strong':
            return `**${contentMd.trim().replace(/\n+/g, ' ')}**`;

        case 'img':
            const src = attrObj['data-image-src'] || attrObj['src'] || '';
            const alt = attrObj['alt'] || 'image';
            return `![${alt}](${src})\n\n`;

        case 'code':
            if (contentMd.includes('\n')) {
                return `\`\`\`\n${contentMd.trim()}\n\`\`\`\n\n`;
            } else {
                return `\`${contentMd.trim()}\``;
            }

        case 'ul':
            return contentMd + '\n';

        case 'ol':
            return contentMd + '\n';

        case 'li':
            const indent = '  '.repeat(indentLevel);
            if (listType === 'ul') {
                return `${indent}- ${contentMd.trim().replace(/\n+/g, ' ')}\n`;
            } else if (listType === 'ol') {
                return `${indent}${listIndex}. ${contentMd.trim().replace(/\n+/g, ' ')}\n`;
            }
            return contentMd;

        case 'table':
            if (attrObj['class'] && attrObj['class'].includes('wysiwyg-macro')) {
                const macroName = attrObj['data-macro-name'];
                if (macroName === 'code') {
                    const language = attrObj['data-macro-parameters']?.match(/language=([^|]+)/)?.[1] || '';
                return `\`\`\`${language}\n${contentMd.trim()}\n\`\`\`\n\n`;
                } else {
                    const macroTitle = attrObj['data-macro-parameters']?.split('title=')[1] || 'Expand';
                    return `<details><summary>${macroTitle}</summary>\n\n${contentMd}\n</details>\n\n`;
                }
            } else {
                return tableToMarkdown(content, indentLevel) + '\n';
            }

        default:
            return contentMd;
    }
}

const tableToMarkdown = (tableContent, indentLevel = 0) => {
    if (!tableContent || tableContent[0] !== 18) return '';

    let rows = [];

    let theadContent = null;
    let tbodyContent = null;
    for (let i = 1; i < tableContent.length; i++) {
        const child = tableContent[i];
        if (Array.isArray(child)) {
            if (child[3] === 'thead') {
                theadContent = child[5];
            } else if (child[3] === 'tbody') {
                tbodyContent = child[5];
            }
        }
    }

    if (theadContent) {
        for (let i = 1; i < theadContent.length; i++) {
            const tr = theadContent[i];
            if (Array.isArray(tr) && tr[3] === 'tr') {
                rows.push(processTableRow(tr, indentLevel));
            }
        }
    }

    if (tbodyContent) {
        for (let i = 1; i < tbodyContent.length; i++) {
            const tr = tbodyContent[i];
            if (Array.isArray(tr) && tr[3] === 'tr') {
                rows.push(processTableRow(tr, indentLevel));
            }
        }
    }

    if (rows.length === 0) return '';

    const maxColumns = Math.max(...rows.map(row => row.length));

    rows = rows.map(row => {
        while (row.length < maxColumns) {
            row.push('');
        }
        return row;
    });

    let mdTable = '';
    const header = rows[0] || [];
    mdTable += '| ' + header.join(' | ') + ' |\n';
    mdTable += '| ' + header.map(() => '---').join(' | ') + ' |\n';

    for (let r = 1; r < rows.length; r++) {
        mdTable += '| ' + rows[r].join(' | ') + ' |\n';
    }

    return mdTable;
}

const processTableRow = (tr, indentLevel) => {
    const trContent = tr[5];
    let row = [];
    for (let j = 1; j < trContent.length; j++) {
        const cell = trContent[j];
        if (Array.isArray(cell)) {
            const cellTag = cell[3];
            const cellContent = cell[5];
            const cellAttrs = parseAttributes(cell[7]);
            let cellMd = '';
            for (let k = 1; k < cellContent.length; k++) {
                const subChild = cellContent[k];
                if (typeof subChild === 'string') {
                    cellMd += subChild;
                } else if (Array.isArray(subChild)) {
                    cellMd += nodeToMarkdown(subChild, indentLevel + 1);
                }
            }
            const colspan = parseInt(cellAttrs['colspan']) || 1;
            for (let c = 0; c < colspan; c++) {
                row.push(cellMd.trim().replace(/\n+/g, ' '));
            }
        }
    }
    return row;
}

const inputFile = process.argv[2];
let outputFile = process.argv[3];

if (!inputFile || inputFile.length < 1) return;
if (!fs.existsSync(inputFile)) return;

outputFile = (!outputFile || outputFile.length < 1) ? [...inputFile.split('.').slice(0, -1), 'md'].join('.') : outputFile;
console.log(`Processing ${inputFile} -->> ${outputFile}`);

try {
    const rawData = fs.readFileSync(inputFile, 'utf8');
    const jsonData = JSON.parse(rawData);
    const root = jsonData.state.value;
    const markdown = nodeToMarkdown(root);

    fs.writeFileSync(outputFile, markdown, 'utf8');
} catch (e) {
    console.log(e);
}
