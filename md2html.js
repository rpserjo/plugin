export const md2html = (markdown) => {
    // Guard: ensure input is a string
    if (typeof markdown !== 'string') markdown = String(markdown ?? '');
    const state = createState(markdown);
    const blocks = parseBlocks(state);
    const html = renderBlocks(blocks, state);
    return html.trim();
}

// =============== Utilities ===============
const normalizeInput = (src) => {
    return src.replace(/\r\n?|\u2028|\u2029/g, "\n");
}

const detab = (s) => {
    return s.replace(/\t/g, "    ");
}

const escapeHtml = (s) => {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;");
}

const isBlank = (line) => {
    return /^\s*$/.test(line); 
}

const trimIndent = (s, n) => {
    if (n <=0 ) return s; 
    let i=0, removed=0; 
    while (i < s.length && removed < n) {
        if (s[i] === ' ') {
            i++;
            removed++;
        } else {
            break;
        }
    }
    return s.slice(i);
}

const unescapeBackslash = (str) => { 
    return str.replace(/\\([!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])/g, "$1");
}

const createState = (src) => { 
    const text = detab(normalizeInput(src)); 
    const lines = text.split("\n"); 
    const linkRefs = collectLinkReferences(lines); 
    return { lines, linkRefs }; 
}

// =============== Link Reference Definitions ===============
const collectLinkReferences = (lines) => {
  const refs = new Map();
  for (let i=0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*\[([^\]]+)\]:\s*(\S+)(?:\s+("[^"]*"|'[^']*'|\([^)]*\)))?\s*$/);
    if (m) {
        const label = normalizeLabel(m[1]);
        let dest = m[2]; 
        let title = m[3] || null;
        if (dest.startsWith("<") && dest.endsWith(">")) {
            dest = dest.slice(1,-1);
        }
        if (title) {
            if ((title.startsWith('"') && title.endsWith('"')) || (title.startsWith("'") && title.endsWith("'")) || (title.startsWith('(') && title.endsWith(')'))) {
                title = title.slice(1,-1);
            }
        }
        refs.set(label, {dest,title});
        lines[i] = "";
    }
  }
  return refs;
}

const normalizeLabel = (label) => {
    return label.trim().replace(/\s+/g,' ').toLowerCase();
}

// =============== Block Parsing ===============
const parseBlocks = (state) => {
    const { lines } = state;
    const blocks = [];
    let i = 0;

    const peek = (n = 0) => {
        return lines[i + n] ?? null;
    }

    const next = () => {
        return lines[i++] ?? null;
    }

    while(i < lines.length) {
        let line = peek();
        if (line === null) break;

        if (isBlank(line)) {
            next(); 
            blocks.push({ type: 'blank' }); 
            continue; 
        }

        if (/^\s{0,3}(?:\*\s*\*\s*\*|\-\s*\-\s*\-|_\s*_\s*_ )\s*$/.test(line)) {
        // thematic break (note: tiny regex tweak to avoid accidental match in some locales)
            next(); 
            blocks.push({ type: 'hr' }); 
            continue;
        }

        let m;
        if ((m = line.match(/^\s{0,3}(#{1,6})\s*(.*?)\s*#*\s*$/))) {
            next(); 
            blocks.push({ type: 'heading', level: m[1].length, text: m[2] });
            continue;
        }

        if ((m = line.match(/^\s{0,3}(```+|~~~+)\s*(\S+)?\s*$/))) {
            const fence = m[1][0]; 
            const fenceLen = m[1].length; 
            const info = m[2] || ''; 
            next(); 
            const content = []; 
            while (i < lines.length) {
                const l = peek();
                if (l !== null && l.match(new RegExp(`^\\s{0,3}${escapeRegex(fence.repeat(fenceLen))}\\s*$`))) {
                    next();
                    break;
                } 
                content.push(next());
            } 
            blocks.push({ type: 'code', info, text: content.join("\n") });
            continue;
        }

        if ((m = line.match(/^\s{0,3}>\s?(.*)$/))) {
            const collected = [];
            while (i < lines.length) {
                const l = peek();
                const qm = l && l.match(/^\s{0,3}>\s?(.*)$/);
                if(!qm) break; 
                collected.push(qm[1]); 
                next();
            } 
            const innerState = createState(collected.join("\n")); 
            const innerBlocks = parseBlocks(innerState); 
            blocks.push({ type: 'blockquote', children: innerBlocks });
            continue;
        }

        // List parsing: improved handling for nested lists and correct item boundaries
        if( (m = line.match(/^(\s{0,3})((?:[+\-*])|(?:\d{1,9}[.)]))\s+(.*)$/) )) {
            const startIndexLine = i;
            const listIndent = m[1].length; // spaces before the marker
            const list = { type: 'list', ordered: /\d/.test(m[2]), start: 1, items: [], tight: true };
            if (list.ordered) {
                const num = parseInt(m[2].replace(/[^0-9]/g,''), 10);
                if (!isNaN(num) && num !== 1) list.start = num;
            }

            // iterate items at the same indent level
            while (i < lines.length) {
            const potential = peek();
            const liMatch = potential && potential.match(/^(\s{0,3})((?:[+\-*])|(?:\d{1,9}[.)]))\s+(.*)$/);
            if (!liMatch || liMatch[1].length !== listIndent) break; // only same-indent markers start new items
            next(); // consume the marker line
            const markerIndent = liMatch[1].length;
            const markerToken = liMatch[2];
            const firstContent = liMatch[3];
            const markerLen = markerToken.length;
            const contentIndent = markerIndent + markerLen + 1; // column where content begins

            const itemLines = [ firstContent ];

            // collect continuation lines for this item
            while (i < lines.length) {
                const l = peek();
                if (l === null) break;
                if (/^\s*$/.test(l)) { itemLines.push(next()); continue; }

                // If there's another list marker at or before the listIndent, it's a sibling/parent -> stop
                const nextLi = l.match(/^(\s{0,3})((?:[+\-*])|(?:\d{1,9}[.)]))\s+(.*)$/);
                if (nextLi && nextLi[1].length <= listIndent) break;

                // If there's a nested list marker (indent > listIndent), treat it as continuation line
                if (nextLi && nextLi[1].length > listIndent) { 
                    itemLines.push(next()); 
                    continue;
                }

                // Indented code block inside item (4+ spaces)
                if (/^\s{4,}\S/.test(l)) { 
                    itemLines.push(trimIndent(next(), 4)); 
                    continue; 
                }

                // Normal continuation: remove contentIndent if possible, else remove markerIndent+1
                const leading = (l.match(/^(\s*)/) || ['',''])[1].length;
                if (leading >= contentIndent) {
                    itemLines.push(trimIndent(next(), contentIndent));
                } else if (leading > 0) {
                    itemLines.push(trimIndent(next(), markerIndent + 1));
                } else {
                    break; // not a continuation
                }
            }

            const itemState = createState(itemLines.join("\n"));
            const itemBlocks = parseBlocks(itemState);
            const hasBlank = itemLines.some(l => /^\s*$/.test(l));
            if (hasBlank) list.tight = false;
                list.items.push({ type: 'list_item', children: itemBlocks });
            }

            if (list.items.length === 0) { 
                i = startIndexLine; 
            } else { 
                blocks.push(list); 
                continue; 
            }
        }

        if (/^\s{4}\S/.test(line)) {
            const content = []; 
            while(i < lines.length) {
                const l = peek();
                if (l && /^\s{4}/.test(l)) {
                    content.push(trimIndent(next(),4));
                } else if (l && /^\s*$/.test(l)) {
                    content.push(next());
                } else {
                    break;
                }
            } 
            blocks.push({ type: 'code', info: '', text:content.join("\n").replace(/\n+$/,"\n") });
            continue;
        }

        // Table detection: line with '|' and next line as table separator
        if (/\|/.test(line) && peek(1) && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(peek(1))) {
            const headerLine = next();
            const alignLine = next();
            const headers = splitTableRow(headerLine);
            const aligns = splitTableRow(alignLine).map(parseAlign);
            const rows = [];
            while (i < lines.length && /\|/.test(peek())) {
                rows.push(splitTableRow(next()));
            }
            blocks.push({ type: 'table', headers, aligns, rows });
            continue;
        }

        const paraLines = [];
        while (i < lines.length && !/^\s*$/.test(peek()) && !/^\s{0,3}(#{1,6})\s/.test(peek()) && !/^\s{0,3}>\s?/.test(peek()) && !/^\s{0,3}(```+|~~~+)/.test(peek()) && !/^\s{0,3}((?:[+\-*])|(?:\d{1,9}[.)]))\s+/.test(peek())) {
            paraLines.push(next());
        }
        if (peek() && /^\s{0,3}(=+|-+)\s*$/.test(peek()) && paraLines.length > 0) { 
            const underline = next(); 
            const level = /^\s{0,3}=+/.test(underline) ? 1 : 2; 
            blocks.push({ type: 'heading', level, text: paraLines.join(' ') }); 
            continue; 
        }
        if (paraLines.length) { 
            blocks.push({ type: 'paragraph', text: paraLines.join("\n") }); 
            continue;
        }
        next();
    }

    return blocks.filter((b, idx, arr) => !(b.type === 'blank' && idx > 0 && arr[idx - 1].type === 'blank'));
}

const escapeRegex = (s) => {
    return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}
const splitTableRow = (line) => { 
    return line.trim().replace(/^\||\|$/g,'').split(/\s*\|\s*/); 
}
const parseAlign = (cell) => { 
    let c = cell.trim(); 
    let left = c.startsWith(':'); 
    let right = c.endsWith(':'); 
    if(left && right) return 'center'; 
    if(right) return 'right'; 
    if(left) return 'left'; 
    return null; 
}

// =============== Rendering ===============
const renderBlocks = (blocks, state) => {
    const out = [];
    for (const b of blocks) {
        switch (b.type) {
            case 'blank': 
                break;
            case 'hr': 
                out.push('<hr />'); 
                break;
            case 'heading': 
                out.push(`<h${b.level}>${renderInlines(b.text, state)}</h${b.level}>`); 
                break;
            case 'code':
                const info = b.info ? ` class="language-${escapeHtml(b.info.trim())}"` : ''; 
                out.push(`<pre><code${info}>${escapeHtml(b.text)}</code></pre>`); 
                break;
            case 'blockquote': 
                out.push(`<blockquote>\n${renderBlocks(b.children, state)}\n</blockquote>`); 
                break;
            case 'list':
                const tag = b.ordered ? 'ol' : 'ul'; 
                const attrs = b.ordered && b.start !== 1 ? ` start="${b.start}"` : ''; 
                const itemsHtml = b.items.map(it => {
                    let inner = renderBlocks(it.children, state); 
                    if (b.tight ){
                        inner = inner.replace(/<p>/g,'').replace(/<\/p>/g,''); 
                    }
                    return `<li>${inner}</li>`; 
                }).join("\n"); 
                out.push(`<${tag}${attrs}>\n${itemsHtml}\n</${tag}>`); 
                break;
            case 'paragraph': 
                out.push(`<p>${renderInlines(b.text, state)}</p>`); 
                break;
            case 'table':
                const headerCells = b.headers.map((h, idx) => {
                    const align = b.aligns[idx]; 
                    const a = align ? ` style=\"text-align:${align}\"` : ''; 
                    return `<th${a}>${renderInlines(h, state)}</th>`;
                }).join('');
                const headerRow = `<tr>${headerCells}</tr>`;
                const bodyRows = b.rows.map(row => {
                    const cells = row.map((c, idx) => {
                        const align = b.aligns[idx]; 
                        const a = align ? ` style=\"text-align:${align}\"` : ''; 
                        return `<td${a}>${renderInlines(c,state)}</td>`;
                    }).join(''); 
                    return `<tr>${cells}</tr>`; 
                }).join("\n");
                out.push(`<table>\n<thead>${headerRow}</thead>\n<tbody>\n${bodyRows}\n</tbody>\n</table>`);
                break;
            default: 
                break;
        }
    }
    return out.join("\n");
}

// =============== Inline Parsing ===============
const renderInlines = (text,state) => {
    // 1) Code spans (backtick runs)
    text = text.replace(/(^|[^`])(`+)([^`]*?)(?:\2)(?!`)/g, (m, pre, ticks, content) => {
        return pre + `<code>` + escapeHtml(content.replace(/\n/g, ' ')) + `</code>`;
    });

    // 2) Autolinks
    text = text.replace(/<([A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s<>]*)>/g, (m, url) => {
        return `<a href=\"${escapeHtml(url)}\">${escapeHtml(url)}</a>`;
    });
    text = text.replace(/<([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>/g, (m, email) => {
        return `<a href=\"mailto:${escapeHtml(email)}\">${escapeHtml(email)}</a>`;
    });

    // 3) Images
    text = text.replace(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+("[^"]*"|'[^']*'))?\)/g, (m, alt, dest, title) => { 
        if (title) title = title.slice(1, -1); 
        return `<img src=\"${escapeHtml(dest)}\" alt=\"${escapeHtml(unescapeBackslash(alt))}\"` + (title ? ` title=\"${escapeHtml(title)}\"` : '') + ` />`; 
    });
    text = text.replace(/!\[([^\]]*)\]\s*\[([^\]]*)\]/g, (m, alt, label) => { 
        const ref = lookupRef(label, state);
        if (!ref) return m; 
        return `<img src=\"${escapeHtml(ref.dest)}\" alt=\"${escapeHtml(unescapeBackslash(alt))}\"` + (ref.title ? ` title=\"${escapeHtml(ref.title)}\"` : '') + ` />`; 
    });

    // 4) Links
    text = text.replace(/\[([^\]]+)\]\(([^\s)]+)(?:\s+("[^"]*"|'[^']*'))?\)/g, (m, label, dest, title) => { 
        if (title) title = title.slice(1, -1); 
        return `<a href=\"${escapeHtml(dest)}\"` + (title ? ` title=\"${escapeHtml(title)}\"` : '') + `>${renderInlines(label, state)}</a>`; 
    });
    text = text.replace(/\[([^\]]+)\]\s*\[([^\]]*)\]/g, (m, label, refLabel) => { 
        const ref = lookupRef(refLabel || label, state); 
        if (!ref) return m; 
        return `<a href=\"${escapeHtml(ref.dest)}\"` + (ref.title ? ` title=\"${escapeHtml(ref.title)}\"` : '') + `>${renderInlines(label, state)}</a>`; 
    });

    // 5) Emphasis & strong — implement CommonMark-like delimiter rules for underscores
    // Strong with ** anywhere
    text = text.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, (m, content) => {
        return `<strong>${renderInlines(content, state)}</strong>`;
    });
    // Strong with __ only when not inside a word
    text = text.replace(/(^|[^A-Za-z0-9_])__((?=\S)[\s\S]*?\S)__(?=[^A-Za-z0-9_]|$)/g, (m, pre, content) => {
        return pre + `<strong>${renderInlines(content, state)}</strong>`;
    });

    // Emphasis with * (star) allowed anywhere
    text = text.replace(/\*(?=\S)([\s\S]*?\S)\*/g, (m, content) => {
        return `<em>${renderInlines(content, state)}</em>`;
    });
    // Emphasis with _ only when not inside a word (pre/post char not alnum or underscore)
    text = text.replace(/(^|[^A-Za-z0-9_])_((?=\S)[\s\S]*?\S)_(?=[^A-Za-z0-9_]|$)/g, (m, pre, content) => {
        return pre + `<em>${renderInlines(content, state)}</em>`;
    });

    // 6) Hard line breaks
    text = text.replace(/ {2,}\n/g, '<br />\n');
    text = text.replace(/\\\n/g, '<br />\n');

    // 7) Escape remaining HTML special chars, but preserve already-inserted tags
    const masks = [];
    text = text.replace(/<[^>]+>/g, (m) => { 
        masks.push(m); 
        return `\u0000${masks.length - 1}\u0000`; 
    });
    text = escapeHtml(text);
    text = text.replace(/\u0000(\d+)\u0000/g, (m, idx) => {
        return masks[Number(idx)]
    });

    // 8) Backslash unescapes
    text = unescapeBackslash(text);

    return text;
}

const lookupRef = (label, state) => {
    const norm = normalizeLabel(label || ''); 
    return state.linkRefs.get(norm) || null;
}
