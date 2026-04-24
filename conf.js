const escapeHtml = (str = '') => {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

const parseAttributes = (attrString = '') => {
	const attrs = {};
	const regex = /([\w:-]+)="([^"]*)"/g;

	let match;
	while ((match = regex.exec(attrString))) {
		attrs[match[1]] = match[2];
	}

	return attrs;
}

const tokenize = (xml) => {
	const tokens = [];
	const regex = /<\/?[\w:-]+(?:\s+[^>]*?)?\/?>|[^<]+/g;

	let match;
	while ((match = regex.exec(xml))) {
		const value = match[0];

		if (value.startsWith('</')) {
			tokens.push({
				type: 'close',
				tag: value.slice(2, -1).trim()
			});
		} else if (value.startsWith('<')) {
			const selfClosing = value.endsWith('/>');
			const tagMatch = value.match(/^<([\w:-]+)/);

			const tag = tagMatch?.[1] || '';

			const attrString = value.slice(tag.length + 1, selfClosing ? -2 : -1);

			tokens.push({
				type: selfClosing ? 'self' : 'open',
				tag,
				attrs: parseAttributes(attrString)
			});
		} else {
			tokens.push({
				type: 'text',
				value
			});
		}
	}

	return tokens;
}

const tokenize2 = (xml) => {
	const tokens = [];
	let i = 0;

	while (i < xml.length) {
		// CDATA
		if (xml.startsWith('<![CDATA[', i)) {
			const end = xml.indexOf(']]>', i);

			if (end === -1) {
				throw new Error('Unclosed CDATA section');
			}

			const value = xml.slice(i + 9, end);

			tokens.push({
				type: 'text',
				value,
				cdata: true
			});

			i = end + 3;
			continue;
		}

		// normal tag
		if (xml[i] === '<') {
			const end = xml.indexOf('>', i);

			if (end === -1) {
				throw new Error('Unclosed tag');
			}

			const raw = xml.slice(i, end + 1);

			if (raw.startsWith('</')) {
				tokens.push({
				type: 'close',
				tag: raw.slice(2, -1).trim()
				});
			} else {
				const selfClosing = raw.endsWith('/>');
				const tagMatch = raw.match(/^<([\w:-]+)/);

				const tag = tagMatch?.[1] || '';

				const attrString =
				raw.slice(tag.length + 1, selfClosing ? -2 : -1);

				tokens.push({
					type: selfClosing ? 'self' : 'open',
					tag,
					attrs: parseAttributes(attrString)
				});
			}

			i = end + 1;
			continue;
		}

		// plain text
		let next = xml.indexOf('<', i);
		if (next === -1) next = xml.length;

		const value = xml.slice(i, next);

		if (value.trim()) {
			tokens.push({
				type: 'text',
				value
			});
		}

		i = next;
	}

	return tokens;
}

const buildAst = (tokens) => {
	const root = { type: 'root', children: [] };
	const stack = [root];

	for (const token of tokens) {
		const current = stack[stack.length - 1];

		if (token.type === 'text') {
			current.children.push({
				type: 'text',
				value: token.value
			});
		}

		else if (token.type === 'self') {
			current.children.push({
				type: 'tag',
				name: token.tag,
				attrs: token.attrs,
				children: []
			});
		}

		else if (token.type === 'open') {
			const node = {
				type: 'tag',
				name: token.tag,
				attrs: token.attrs,
				children: []
			};

			current.children.push(node);
			stack.push(node);
		}

		else if (token.type === 'close') {
			stack.pop();
		}
	}

	return root;
}

const renderNode = (node) => {
	if (node.type === 'text') {
		return node.value;
	}

	if (node.type === 'root') {
		return node.children.map(renderNode).join('');
	}

	const children = node.children.map(renderNode).join('');

	switch (node.name) {
		case 'p':
		case 'h1':
		case 'h2':
		case 'h3':
		case 'ul':
		case 'ol':
		case 'li':
		case 'strong':
		case 'em':
		case 'table':
		case 'tr':
		case 'td':
		case 'th':
			return `<${node.name}>${children}</${node.name}>`;

		case 'ac:layout':
			return `<div class="layout">${children}</div>`;

		case 'ac:layout-section':
			return `<div class="layout-section">${children}</div>`;

		case 'ac:layout-cell':
			return `<div class="layout-cell">${children}</div>`;

		case 'ac:rich-text-body':
			return children;

		case 'ac:image':
			return renderImage(node);

		case 'ac:link':
			return renderLink(node);

		case 'ac:structured-macro':
			return renderMacro(node);

		case 'ac:task-list':
			return `<ul class="task-list">${children}</ul>`;

		case 'ac:task':
			return `<li>${children}</li>`;

		case 'ac:task-status':
			return node.children[0]?.value?.trim() === 'complete'
				? '<input type="checkbox" checked disabled>'
				: '<input type="checkbox" disabled>';

		case 'ac:task-body':
			return children;

		default:
			return children;
	}
}

const renderImage = (node) => {
	const attachment = findNode(node, 'ri:attachment');
	const url = findNode(node, 'ri:url');

	if (attachment) {
		const file = attachment.attrs['ri:filename'];
		return `<img src="./attachments/${file}" alt="${file}">`;
	}

	if (url) {
		return `<img src="${url.attrs['ri:value']}">`;
	}

	return '';
}

const renderLink = (node) => {
	const page = findNode(node, 'ri:page');
	const url = findNode(node, 'ri:url');

	const text = extractText(node);

	if (page) {
		const title = page.attrs['ri:content-title'];
		return `<a href="${slugify(title)}.html">${text || title}</a>`;
	}

	if (url) {
		const href = url.attrs['ri:value'];
		return `<a href="${href}">${text || href}</a>`;
	}

	return text;
}

const renderMacro = (node) => {
	const name = node.attrs['ac:name'];
	const body = node.children.map(renderNode).join('');

	switch (name) {
		case 'warning':
			return `<div class="macro warning">${body}</div>`;

		case 'info':
			return `<div class="macro info">${body}</div>`;

		case 'note':
			return `<div class="macro note">${body}</div>`;

		case 'code':
			return `<pre class="code">${escapeHtml(extractText(node))}</pre>`;

		case 'panel':
			return `<div class="macro panel">${body}</div>`;

		default:
			return `<div class="macro macro-${name}">${body}</div>`;
	}
}

const findNode = (node, tagName) => {
	if (node.name === tagName) return node;

	for (const child of node.children || []) {
		const found = findNode(child, tagName);
		if (found) return found;
	}

	return null;
}

const extractText = (node) => {
	if (node.type === 'text') return node.value;

	return (node.children || []).map(extractText).join('');
}

const slugify = (str = '') => {
	return str.toLowerCase().replace(/[^\wа-яё]+/gi, '-').replace(/^-+|-+$/g, '');
}

const renderConfluenceXml = (xml) => {
	const tokens = tokenize(xml);
	const ast = buildAst(tokens);
	const html = renderNode(ast);
	return html;
}
