(function (wp) {
	'use strict';

	if (!wp) {
		return;
	}

	var MAX_FILE_SIZE = 2 * 1024 * 1024;
	var editorConfig = window.kototsugiEditorConfig || {};

	function text(value) {
		return wp.i18n && wp.i18n.__ ? wp.i18n.__(value, 'kototsugi') : value;
	}

	function escapeHtml(value) {
		return String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	function sanitizeUrl(value) {
		var url = String(value || '').trim();

		if (/^(https?:|mailto:|tel:|#|\/)/i.test(url)) {
			return url;
		}

		return '';
	}

	function renderInline(value) {
		var html = escapeHtml(value);

		html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (match, label, url) {
			var safeUrl = sanitizeUrl(url.replace(/&amp;/g, '&'));

			return safeUrl ? '<a href="' + escapeHtml(safeUrl) + '">' + label + '</a>' : label;
		});
		html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
		html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
		html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
		html = html.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
		html = html.replace(/(^|[^_])_([^_]+)_(?!_)/g, '$1<em>$2</em>');

		return html;
	}

	function plainText(value) {
		return String(value || '')
			.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			.replace(/[`*_]/g, '')
			.trim();
	}

	function isTableDivider(value) {
		return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(value);
	}

	function isTableRow(value) {
		return /^\s*\|?.+\|.+\|?\s*$/.test(value);
	}

	function splitTableRow(value) {
		var row = String(value).trim();

		if (row.charAt(0) === '|') {
			row = row.slice(1);
		}
		if (row.charAt(row.length - 1) === '|') {
			row = row.slice(0, -1);
		}

		return row.split('|').map(function (cell) {
			return cell.trim();
		});
	}

	function isBlockStart(lines, index) {
		var line = lines[index] || '';
		var next = lines[index + 1] || '';

		return !line.trim() || /^\s*#{1,6}\s+/.test(line) || /^\s*```/.test(line) ||
			/^\s*>\s*/.test(line) || /^\s*(?:[-+*])\s+/.test(line) ||
			/^\s*\d+\.\s+/.test(line) || /^\s*---+\s*$/.test(line) ||
			(isTableRow(line) && isTableDivider(next));
	}

	function renderTable(lines, startIndex) {
		var header = splitTableRow(lines[startIndex]);
		var index = startIndex + 2;
		var body = [];
		var html;

		while (index < lines.length && isTableRow(lines[index])) {
			body.push(splitTableRow(lines[index]));
			index += 1;
		}

		html = '<figure class="wp-block-table"><table><thead><tr>';
		header.forEach(function (cell) {
			html += '<th>' + renderInline(cell) + '</th>';
		});
		html += '</tr></thead><tbody>';
		body.forEach(function (row) {
			html += '<tr>';
			header.forEach(function (unused, columnIndex) {
				html += '<td>' + renderInline(row[columnIndex] || '') + '</td>';
			});
			html += '</tr>';
		});
		html += '</tbody></table></figure>';

		return { html: html, nextIndex: index };
	}

	function renderList(lines, startIndex, ordered) {
		var expression = ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-+*]\s+(.+)$/;
		var index = startIndex;
		var items = [];
		var match;

		while (index < lines.length) {
			match = lines[index].match(expression);
			if (!match) {
				break;
			}
			items.push('<li>' + renderInline(match[1]) + '</li>');
			index += 1;
		}

		return {
			html: '<' + (ordered ? 'ol' : 'ul') + '>' + items.join('') + '</' + (ordered ? 'ol' : 'ul') + '>',
			nextIndex: index
		};
	}

	function decodeFrontMatterScalar(value) {
		var scalar = String(value || '').trim();

		if (!scalar || scalar === '~' || scalar.toLowerCase() === 'null') {
			return '';
		}

		if (scalar.charAt(0) === '"' && scalar.charAt(scalar.length - 1) === '"') {
			try {
				return JSON.parse(scalar);
			} catch (error) {
				return scalar.slice(1, -1);
			}
		}

		if (scalar.charAt(0) === "'" && scalar.charAt(scalar.length - 1) === "'") {
			return scalar.slice(1, -1).replace(/''/g, "'");
		}

		return scalar;
	}

	function splitFrontMatterList(value) {
		var source = String(value || '').trim();
		var values = [];
		var current = '';
		var quote = '';
		var escaped = false;
		var index;
		var character;

		if (source.charAt(0) === '[' && source.charAt(source.length - 1) === ']') {
			source = source.slice(1, -1);
		}

		for (index = 0; index < source.length; index += 1) {
			character = source.charAt(index);
			if (escaped) {
				current += character;
				escaped = false;
				continue;
			}
			if (character === '\\' && quote === '"') {
				current += character;
				escaped = true;
				continue;
			}
			if ((character === '"' || character === "'") && (!quote || quote === character)) {
				quote = quote ? '' : character;
				current += character;
				continue;
			}
			if (character === ',' && !quote) {
				values.push(decodeFrontMatterScalar(current));
				current = '';
				continue;
			}
			current += character;
		}

		if (current.trim()) {
			values.push(decodeFrontMatterScalar(current));
		}

		return values.map(function (item) {
			return String(item || '').trim();
		}).filter(Boolean);
	}

	function emptyFrontMatterMetadata() {
		return {
			title: '',
			excerpt: '',
			slug: '',
			tags: [],
			categories: [],
			featuredImage: '',
			featuredImageAlt: ''
		};
	}

	function parseFrontMatter(source) {
		var normalized = String(source || '').replace(/\r\n?/g, '\n');
		var match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
		var result = {
			content: normalized,
			title: '',
			hasFrontMatter: false,
			metadata: emptyFrontMatterMetadata(),
			unknownFields: [],
			raw: ''
		};
		var aliases = {
			title: 'title',
			excerpt: 'excerpt',
			description: 'excerpt',
			slug: 'slug',
			tags: 'tags',
			tag: 'tags',
			categories: 'categories',
			category: 'categories',
			featured_image: 'featuredImage',
			featuredimage: 'featuredImage',
			cover_image: 'featuredImage',
			cover: 'featuredImage',
			image: 'featuredImage',
			featured_image_alt: 'featuredImageAlt',
			image_alt: 'featuredImageAlt'
		};
		var lines;
		var index;
		var lineMatch;
		var originalKey;
		var normalizedKey;
		var metadataKey;
		var rawValue;
		var blockLines;
		var listValues;
		var joinWith;

		if (!match) {
			return result;
		}

		result.hasFrontMatter = true;
		result.raw = match[1];
		result.content = normalized.slice(match[0].length);
		lines = match[1].split('\n');

		for (index = 0; index < lines.length; index += 1) {
			lineMatch = lines[index].match(/^([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
			if (!lineMatch) {
				continue;
			}

			originalKey = lineMatch[1];
			normalizedKey = originalKey.toLowerCase().replace(/-/g, '_');
			metadataKey = aliases[normalizedKey];
			rawValue = lineMatch[2];

			if (!metadataKey) {
				if (result.unknownFields.indexOf(originalKey) === -1) {
					result.unknownFields.push(originalKey);
				}
				continue;
			}

			if (rawValue === '|' || rawValue === '>') {
				blockLines = [];
				joinWith = rawValue === '|' ? '\n' : ' ';
				while (index + 1 < lines.length && (!lines[index + 1].trim() || /^\s+/.test(lines[index + 1]))) {
					index += 1;
					blockLines.push(lines[index].replace(/^\s+/, ''));
				}
				result.metadata[metadataKey] = blockLines.join(joinWith).trim();
				continue;
			}

			if ((metadataKey === 'tags' || metadataKey === 'categories') && !rawValue) {
				listValues = [];
				while (index + 1 < lines.length && /^\s*-\s+/.test(lines[index + 1])) {
					index += 1;
					listValues.push(decodeFrontMatterScalar(lines[index].replace(/^\s*-\s+/, '')));
				}
				result.metadata[metadataKey] = listValues.map(function (item) {
					return String(item || '').trim();
				}).filter(Boolean);
				continue;
			}

			if (metadataKey === 'tags' || metadataKey === 'categories') {
				result.metadata[metadataKey] = splitFrontMatterList(rawValue);
			} else {
				result.metadata[metadataKey] = decodeFrontMatterScalar(rawValue);
			}
		}

		result.metadata.title = plainText(result.metadata.title);
		result.title = result.metadata.title;
		return result;
	}

	function createPostSettings(source) {
		var document = parseFrontMatter(source);
		var values = document.metadata;

		return {
			signature: document.hasFrontMatter ? document.raw : '',
			hasFrontMatter: document.hasFrontMatter,
			values: {
				title: values.title,
				excerpt: values.excerpt,
				slug: values.slug,
				tags: values.tags.slice(),
				categories: values.categories.slice(),
				featuredImage: values.featuredImage,
				featuredImageAlt: values.featuredImageAlt
			},
			enabled: {
				title: Boolean(values.title),
				excerpt: Boolean(values.excerpt),
				slug: Boolean(values.slug),
				tags: Boolean(values.tags.length),
				categories: Boolean(values.categories.length),
				featuredImage: Boolean(values.featuredImage)
			},
			unknownFields: document.unknownFields.slice()
		};
	}

	function analyzeMarkdown(source, options) {
		var normalized = String(source || '').replace(/\r\n?/g, '\n');
		var document = parseFrontMatter(normalized);
		var contentLines = document.content.split('\n');
		var settings = options || {};
		var applyTitle = settings.applyTitle !== false;
		var prefix = document.hasFrontMatter ? normalized.slice(0, normalized.length - document.content.length) : '';
		var firstContentLine = document.hasFrontMatter ? prefix.split('\n').length : 1;
		var allLines = normalized.split('\n');
		var issues = [];
		var seen = Object.create(null);
		var headings = [];
		var inFence = false;
		var fenceStartLine = 0;
		var index;
		var line;
		var lineNumber;
		var match;
		var imageMatch;
		var imageExpression;
		var rawUrl;
		var firstH1;
		var previousHeading;

		function addIssue(code, severity, issueLine, message) {
			var key = code + ':' + issueLine;

			if (seen[key]) {
				return;
			}
			seen[key] = true;
			issues.push({
				code: code,
				severity: severity,
				line: issueLine,
				message: message
			});
		}

		if (/^---\n/.test(normalized) && !document.hasFrontMatter) {
			addIssue('unclosed_front_matter', 'warning', 1, text('The closing --- for Front Matter was not found.'));
		}

		document.unknownFields.forEach(function (field) {
			var expression = new RegExp('^' + field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:', 'i');
			var fieldIndex = allLines.findIndex(function (candidate) { return expression.test(candidate); });

			addIssue(
				'unsupported_front_matter_' + field.toLowerCase(),
				'info',
				fieldIndex >= 0 ? fieldIndex + 1 : 1,
				text('Unsupported Front Matter fields will not be applied:') + ' ' + field
			);
		});

		for (index = 0; index < contentLines.length; index += 1) {
			line = contentLines[index];
			lineNumber = firstContentLine + index;
			match = line.match(/^\s*```\s*([^\s]*)\s*$/);

			if (match) {
				if (!inFence) {
					inFence = true;
					fenceStartLine = lineNumber;
					if (/^(mermaid|math)$/i.test(match[1])) {
						addIssue('unsupported_fenced_language', 'warning', lineNumber, text('This code block will be inserted as a regular code block because no dedicated block is available.'));
					}
				} else {
					inFence = false;
					fenceStartLine = 0;
				}
				continue;
			}

			if (inFence) {
				continue;
			}

			match = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
			if (match) {
				headings.push({
					level: match[1].length,
					line: lineNumber,
					text: plainText(match[2])
				});
			}

			if (/^\s*[-+*]\s+\[[ xX]\]\s+/.test(line)) {
				addIssue('unsupported_task_list', 'warning', lineNumber, text('Task lists will be converted to regular lists without preserving checkbox states.'));
			}
			if (/^(?:\t|\s{2,})(?:[-+*]|\d+\.)\s+/.test(line)) {
				addIssue('unsupported_nested_list', 'warning', lineNumber, text('Nested lists will be flattened to one level.'));
			}
			if (/\[\^[^\]]+\]/.test(line)) {
				addIssue('unsupported_footnote', 'warning', lineNumber, text('Footnote syntax will not be converted to linked footnotes.'));
			}
			if (/^\s*\$\$\s*$/.test(line)) {
				addIssue('unsupported_math', 'warning', lineNumber, text('Math blocks will not be converted to a dedicated display format.'));
			}
			if (/^\s*<\/?[A-Za-z][^>]*>/.test(line)) {
				addIssue('unsupported_html', 'warning', lineNumber, text('HTML will be inserted as text and will not run as HTML.'));
			}

			if (line.indexOf('![') !== -1) {
				imageExpression = /!\[([^\]]*)\]\(([^)]*)\)/g;
				imageMatch = imageExpression.exec(line);
				if (!imageMatch) {
					addIssue('malformed_image', 'warning', lineNumber, text('The image syntax could not be parsed. Check its parentheses and URL.'));
				} else {
					do {
						rawUrl = String(imageMatch[2] || '').trim();
						if (!rawUrl || /\s/.test(rawUrl) || !/^(https?:\/\/|\/)/i.test(rawUrl)) {
							addIssue('invalid_image_url', 'warning', lineNumber, text('Image URLs must begin with http, https, or /.'));
						} else if (rawUrl.charAt(0) === '/') {
							addIssue('local_image_url', 'info', lineNumber, text('Relative images will keep their original paths and will not be saved to the Media Library.'));
						}
					} while ((imageMatch = imageExpression.exec(line)) !== null);
				}
			}
		}

		if (inFence) {
			addIssue('unclosed_code_fence', 'warning', fenceStartLine, text('The closing ``` for the code block was not found.'));
		}

		headings.forEach(function (heading) {
			if (heading.level === 1) {
				if (!firstH1) {
					firstH1 = heading;
				} else {
					addIssue('multiple_h1', 'warning', heading.line, text('Multiple H1 headings were found. Keep one H1 to use as the post title.'));
				}
			}
			if (previousHeading && heading.level > previousHeading.level + 1) {
				addIssue(
					'heading_level_jump',
					'warning',
					heading.line,
					'H' + previousHeading.level + text(' is followed by ') + 'H' + heading.level + text('. Check the heading hierarchy.')
				);
			}
			previousHeading = heading;
		});

		if (applyTitle && firstH1) {
			if (document.title && document.title.toLocaleLowerCase() !== firstH1.text.toLocaleLowerCase()) {
				addIssue('title_conflict', 'warning', firstH1.line, text('The Front Matter title differs from the first H1. The H1 will be removed from the post body when applied.'));
			} else if (document.title) {
				addIssue('duplicate_document_title', 'info', firstH1.line, text('The H1 matching the Front Matter title will be removed automatically to avoid duplication in the post body.'));
			} else {
				addIssue('heading_used_as_title', 'info', firstH1.line, text('The first H1 will be used as the post title and removed from the post body.'));
			}
		}

		return issues.sort(function (left, right) {
			return left.line - right.line;
		});
	}

	function isSupportedMarkdownFile(file) {
		var name = file && file.name ? String(file.name).toLowerCase() : '';

		return /\.(md|markdown|txt)$/.test(name) && Number(file.size || 0) <= MAX_FILE_SIZE;
	}

	function extractRemoteImages(source) {
		var expression = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi;
		var images = [];
		var seen = Object.create(null);
		var match;
		var url;

		while ((match = expression.exec(String(source || ''))) !== null) {
			url = sanitizeUrl(match[2]);
			if (url && !seen[url]) {
				seen[url] = true;
				images.push({ url: url, alt: plainText(match[1]) });
			}
		}

		return images;
	}

	function markdownToHtml(source, useFirstHeadingAsTitle, importedImages) {
		var document = parseFrontMatter(source);
		var lines = document.content.split('\n');
		var html = [];
		var index = 0;
		var titleHeadingSkipped = false;
		var line;
		var match;
		var paragraph;
		var quote;
		var codeLines;
		var language;
		var table;
		var list;

		while (index < lines.length) {
			line = lines[index];

			if (!line.trim()) {
				index += 1;
				continue;
			}

			match = line.match(/^\s*```\s*([^\s]*)\s*$/);
			if (match) {
				language = match[1];
				codeLines = [];
				index += 1;
				while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
					codeLines.push(lines[index]);
					index += 1;
				}
				if (index < lines.length) {
					index += 1;
				}
				html.push('<pre class="wp-block-code"><code' + (language ? ' class="language-' + escapeHtml(language) + '"' : '') + '>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
				continue;
			}

			match = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
			if (match) {
				if (useFirstHeadingAsTitle && match[1].length === 1 && !titleHeadingSkipped) {
					titleHeadingSkipped = true;
				} else {
					html.push('<h' + match[1].length + '>' + renderInline(match[2]) + '</h' + match[1].length + '>');
				}
				index += 1;
				continue;
			}

			if (/^\s*---+\s*$/.test(line)) {
				html.push('<hr>');
				index += 1;
				continue;
			}

			if (isTableRow(line) && isTableDivider(lines[index + 1] || '')) {
				table = renderTable(lines, index);
				html.push(table.html);
				index = table.nextIndex;
				continue;
			}

			match = line.match(/^\s*>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
			if (match) {
				var type = match[1].toLowerCase();
				var calloutLines = [match[2]];
				index += 1;
				while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
					calloutLines.push(lines[index].replace(/^\s*>\s?/, ''));
					index += 1;
				}
				html.push('<div class="wp-block-group kototsugi-callout kototsugi-callout--' + type + '"><p>' + calloutLines.filter(Boolean).map(renderInline).join('<br>') + '</p></div>');
				continue;
			}

			if (/^\s*>\s?/.test(line)) {
				quote = [];
				while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
					quote.push(lines[index].replace(/^\s*>\s?/, ''));
					index += 1;
				}
				html.push('<blockquote><p>' + quote.filter(Boolean).map(renderInline).join('<br>') + '</p></blockquote>');
				continue;
			}

			if (/^\s*[-+*]\s+/.test(line)) {
				list = renderList(lines, index, false);
				html.push(list.html);
				index = list.nextIndex;
				continue;
			}

			if (/^\s*\d+\.\s+/.test(line)) {
				list = renderList(lines, index, true);
				html.push(list.html);
				index = list.nextIndex;
				continue;
			}

			match = line.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/);
			if (match) {
				var imageUrl = sanitizeUrl(match[2]);
				var importedImage = imageUrl && importedImages ? importedImages[imageUrl] : null;
				var renderedImageUrl = importedImage && importedImage.url ? importedImage.url : imageUrl;
				var imageClass = importedImage && importedImage.id ? ' class="wp-image-' + Number(importedImage.id) + '"' : '';
				if (renderedImageUrl) {
					html.push('<figure class="wp-block-image"><img src="' + escapeHtml(renderedImageUrl) + '" alt="' + escapeHtml(match[1]) + '"' + imageClass + '></figure>');
				} else {
					html.push('<p>' + renderInline(line) + '</p>');
				}
				index += 1;
				continue;
			}

			paragraph = [];
			while (index < lines.length && !isBlockStart(lines, index)) {
				paragraph.push(lines[index].trim());
				index += 1;
			}
			if (paragraph.length) {
				html.push('<p>' + renderInline(paragraph.join(' ')) + '</p>');
			} else {
				index += 1;
			}
		}

		return html.join('');
	}

	function findTitle(source) {
		var document = parseFrontMatter(source);
		var match = document.content.match(/^\s*#\s+(.+?)\s*#*\s*$/m);

		return document.title || (match ? plainText(match[1]) : '');
	}

	function findSimpleNotation(value) {
		var line = String(value || '').trim();
		var match;

		match = line.match(/^@\s+(.+)$/);
		if (match) {
			return { type: 'place', value: match[1].trim() };
		}
		match = line.match(/^(?:場所|会場|所在地|place|location|venue)\s*[:：]\s*(.+)$/i);
		if (match) {
			return { type: 'place', value: match[1].trim() };
		}
		match = line.match(/^!\s+(.+)$/);
		if (match) {
			return { type: 'important', value: match[1].trim() };
		}
		match = line.match(/^(?:重要|注意|警告|important|warning)\s*[:：]\s*(.+)$/i);
		if (match) {
			return { type: 'important', value: match[1].trim() };
		}
		match = line.match(/^※\s*(.+)$/);
		if (match) {
			return { type: 'note', value: match[1].trim() };
		}
		match = line.match(/^(?:補足|注記|note)\s*[:：]\s*(.+)$/i);
		if (match) {
			return { type: 'note', value: match[1].trim() };
		}
		match = line.match(/^[¥￥]\s*(.+)$/);
		if (match) {
			return { type: 'price', value: match[1].trim() };
		}
		match = line.match(/^(?:料金|価格|費用|price|cost)\s*[:：]\s*(.+)$/i);
		if (match) {
			return { type: 'price', value: match[1].trim() };
		}
		match = line.match(/^☎\s*(.+)$/);
		if (match) {
			return { type: 'phone', value: match[1].trim() };
		}
		match = line.match(/^(?:電話|電話番号|tel|phone)\s*[:：]\s*(.+)$/i);
		if (match) {
			return { type: 'phone', value: match[1].trim() };
		}

		return null;
	}

	function renderSimpleNotation(notation, labels) {
		var value = notation.value;
		var linkLabel = value.replace(/[\[\]]/g, '');
		var phone;

		if (notation.type === 'place') {
			return '**' + labels.place + ':** [' + linkLabel + '](https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(plainText(value)) + ')';
		}
		if (notation.type === 'important') {
			return '> [!IMPORTANT]\n> ' + value;
		}
		if (notation.type === 'note') {
			return '> [!NOTE]\n> ' + value;
		}
		if (notation.type === 'price') {
			return '**' + labels.price + ':** ' + value;
		}
		if (notation.type === 'phone') {
			phone = value.replace(/[０-９]/g, function (character) {
				return String.fromCharCode(character.charCodeAt(0) - 65248);
			}).replace(/＋/g, '+').replace(/[^\d+*#]/g, '');
			return '**' + labels.phone + ':** ' + (phone ? '[' + linkLabel + '](tel:' + phone + ')' : value);
		}

		return value;
	}

	function isSimpleHeadingCandidate(value) {
		var line = String(value || '').trim();

		if (!line || line.indexOf('\n') !== -1 || Array.from(line).length > 40) {
			return false;
		}
		if (findSimpleNotation(line)) {
			return false;
		}
		if (/^(?:#{1,6}\s|```|[-+*>]\s|\d+\.\s|!\[|\|)/.test(line) || /^https?:\/\//i.test(line)) {
			return false;
		}
		if (/^[A-Za-z0-9_-]+\s*:/.test(line) || /[。．.!?！？]$/.test(line)) {
			return false;
		}
		if (/(?:です|ます|でした|ました|ください|でしょう|だ|である)$/.test(line)) {
			return false;
		}

		return true;
	}

	function prepareSimpleText(source, suppliedTitle, labels) {
		var normalized = String(source || '').replace(/\r\n?/g, '\n');
		var document = parseFrontMatter(normalized);
		var body = document.content;
		var title = plainText(suppliedTitle);
		var detectedTitle = document.title;
		var lines;
		var index;
		var match;
		var looseTitle = '';
		var foundLooseMetadata = false;
		var blocks;
		var firstBlock;
		var displaySource;
		var removedTitleFromBody = false;
		var simpleLabels = {
			place: labels && labels.place ? plainText(labels.place) : 'Place',
			price: labels && labels.price ? plainText(labels.price) : 'Price',
			phone: labels && labels.phone ? plainText(labels.phone) : 'Phone'
		};
		var preparedLines = [];
		var notation;

		if (!document.hasFrontMatter) {
			lines = body.split('\n');
			index = 0;
			while (index < lines.length && !lines[index].trim()) {
				index += 1;
			}
			while (index < lines.length) {
				match = lines[index].match(/^\s*(title|status|author)\s*:\s*(.*?)\s*$/i);
				if (!match) {
					break;
				}
				foundLooseMetadata = true;
				if (match[1].toLowerCase() === 'title') {
					looseTitle = plainText(match[2]);
				}
				index += 1;
			}
			if (foundLooseMetadata) {
				while (index < lines.length && !lines[index].trim()) {
					index += 1;
				}
				body = lines.slice(index).join('\n');
				detectedTitle = looseTitle;
			}
		}

		displaySource = body.trim();
		body.split('\n').forEach(function (line) {
			var normalizedLine = line.replace(/^(\s*)[・●○]\s*/, '$1- ');

			notation = findSimpleNotation(normalizedLine);
			if (notation && preparedLines.length && preparedLines[preparedLines.length - 1].trim()) {
				preparedLines.push('');
			}
			preparedLines.push(normalizedLine);
			if (notation) {
				preparedLines.push('');
			}
		});
		body = preparedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
		blocks = body ? body.split(/\n{2,}/) : [];
		firstBlock = blocks.length ? blocks[0].trim() : '';

		if (!detectedTitle) {
			detectedTitle = findTitle(body);
		}
		if (!detectedTitle && !title && isSimpleHeadingCandidate(firstBlock)) {
			detectedTitle = plainText(firstBlock);
			blocks.shift();
			removedTitleFromBody = true;
		} else if (title && firstBlock && plainText(firstBlock) === title && isSimpleHeadingCandidate(firstBlock)) {
			blocks.shift();
			removedTitleFromBody = true;
		} else if (detectedTitle && firstBlock && plainText(firstBlock) === detectedTitle && isSimpleHeadingCandidate(firstBlock)) {
			blocks.shift();
			removedTitleFromBody = true;
		}
		if (removedTitleFromBody) {
			displaySource = displaySource.split(/\n{2,}/).slice(1).join('\n\n').trim();
		}

		blocks = blocks.map(function (block, blockIndex) {
			var trimmed = block.trim();
			var simpleNotation = findSimpleNotation(trimmed);

			if (simpleNotation) {
				return renderSimpleNotation(simpleNotation, simpleLabels);
			}

			if (blockIndex < blocks.length - 1 && isSimpleHeadingCandidate(trimmed)) {
				return '## ' + trimmed;
			}
			return trimmed;
		}).filter(Boolean);

		return {
			cleanedInput: document.hasFrontMatter || foundLooseMetadata || removedTitleFromBody,
			cleanedMetadata: document.hasFrontMatter || foundLooseMetadata,
			displaySource: displaySource,
			source: blocks.join('\n\n'),
			title: title || detectedTitle
		};
	}

	function htmlToBlocks(html) {
		return wp.blocks && wp.blocks.rawHandler ? wp.blocks.rawHandler({ HTML: html }) : [];
	}

	window.KototsugiMarkdown = {
		analyzeMarkdown: analyzeMarkdown,
		createPostSettings: createPostSettings,
		extractRemoteImages: extractRemoteImages,
		findTitle: findTitle,
		htmlToBlocks: htmlToBlocks,
		isSupportedMarkdownFile: isSupportedMarkdownFile,
		markdownToHtml: markdownToHtml,
		parseFrontMatter: parseFrontMatter,
		prepareSimpleText: prepareSimpleText
	};

	if (!wp.apiFetch || !wp.blocks || !wp.components || !wp.data || (!wp.editor && !wp.editPost) || !wp.element || !wp.plugins) {
		return;
	}

	var apiFetch = wp.apiFetch;
	var el = wp.element.createElement;
	var Fragment = wp.element.Fragment;
	var useRef = wp.element.useRef;
	var useState = wp.element.useState;
	var Button = wp.components.Button;
	var CheckboxControl = wp.components.CheckboxControl;
	var FormTokenField = wp.components.FormTokenField;
	var Modal = wp.components.Modal;
	var Notice = wp.components.Notice;
	var TextControl = wp.components.TextControl;
	var TextareaControl = wp.components.TextareaControl;
	var editorPackage = wp.editor && wp.editor.PluginSidebar ? wp.editor : wp.editPost;
	var PluginSidebar = editorPackage.PluginSidebar;
	var PluginSidebarMoreMenuItem = editorPackage.PluginSidebarMoreMenuItem;
	var registerPlugin = wp.plugins.registerPlugin;

	function KototsugiSidebar() {
		var sourceState = useState('');
		var source = sourceState[0];
		var setSource = sourceState[1];
		var titleState = useState(true);
		var useFirstHeadingAsTitle = titleState[0];
		var setUseFirstHeadingAsTitle = titleState[1];
		var noticeState = useState(null);
		var notice = noticeState[0];
		var setNotice = noticeState[1];
		var workspaceState = useState(false);
		var isWorkspaceOpen = workspaceState[0];
		var setWorkspaceOpen = workspaceState[1];
		var fileNameState = useState('');
		var fileName = fileNameState[0];
		var setFileName = fileNameState[1];
		var draggingState = useState(false);
		var isDragging = draggingState[0];
		var setDragging = draggingState[1];
		var paneState = useState('source');
		var activePane = paneState[0];
		var setActivePane = paneState[1];
		var sourceViewState = useState('markdown');
		var sourceView = sourceViewState[0];
		var setSourceView = sourceViewState[1];
		var insertionModeState = useState('cursor');
		var insertionMode = insertionModeState[0];
		var setInsertionMode = insertionModeState[1];
		var replaceConfirmationState = useState(false);
		var replaceConfirmed = replaceConfirmationState[0];
		var setReplaceConfirmed = replaceConfirmationState[1];
		var postSettingsState = useState(createPostSettings(''));
		var postSettings = postSettingsState[0];
		var setPostSettings = postSettingsState[1];
		var termCreationState = useState(true);
		var createMissingTerms = termCreationState[0];
		var setCreateMissingTerms = termCreationState[1];
		var mediaState = useState(true);
		var importRemoteMedia = mediaState[0];
		var setImportRemoteMedia = mediaState[1];
		var importingState = useState(false);
		var isImporting = importingState[0];
		var setIsImporting = importingState[1];
		var progressState = useState({ current: 0, total: 0 });
		var imageProgress = progressState[0];
		var setImageProgress = progressState[1];
		var helperActionState = useState('');
		var helperAction = helperActionState[0];
		var setHelperAction = helperActionState[1];
		var fileInputRef = useRef(null);
		var shouldApplyDocumentTitle = postSettings.hasFrontMatter ?
			postSettings.enabled.title && Boolean(postSettings.values.title) : useFirstHeadingAsTitle;
		var previewHtml = source.trim() ? markdownToHtml(source, shouldApplyDocumentTitle) : '';
		var remoteImages = collectImportImages();
		var detectedSettingCount = countEnabledPostSettings();
		var preflightIssues = source.trim() ? analyzeMarkdown(source, { applyTitle: shouldApplyDocumentTitle }) : [];
		var preflightWarningCount = countPreflightIssues('warning');
		var preflightErrorCount = countPreflightIssues('error');
		var actionableIssueCount = preflightWarningCount + preflightErrorCount;
		var currentBlockCount = getCurrentBlockCount();

		function setMarkdownSource(value) {
			var nextSettings = createPostSettings(value);

			setSource(value);
			setReplaceConfirmed(false);
			setPostSettings(function (currentSettings) {
				if (currentSettings.signature === nextSettings.signature && currentSettings.hasFrontMatter === nextSettings.hasFrontMatter) {
					return currentSettings;
				}
				return nextSettings;
			});
			if (!nextSettings.hasFrontMatter && sourceView === 'settings') {
				setSourceView('markdown');
			}
		}

		function updateSource(value) {
			setMarkdownSource(value);
		}

		function updateTitleSetting(value) {
			setUseFirstHeadingAsTitle(value);
		}

		function clearSource() {
			setMarkdownSource('');
			setFileName('');
			setNotice(null);
			setActivePane('source');
			setSourceView('markdown');
			setInsertionMode('cursor');
			setReplaceConfirmed(false);
		}

		function resetWorkspaceAfterApply() {
			setSource('');
			setPostSettings(createPostSettings(''));
			setFileName('');
			setActivePane('source');
			setSourceView('markdown');
			setInsertionMode('cursor');
			setReplaceConfirmed(false);
		}

		function chooseFile() {
			if (fileInputRef.current) {
				fileInputRef.current.click();
			}
		}

		function fetchBundledMarkdown(url) {
			if (!url || !window.fetch) {
				return Promise.reject(new Error(text('The bundled Markdown is unavailable.')));
			}

			return window.fetch(url, { credentials: 'same-origin' }).then(function (response) {
				if (!response.ok) {
					throw new Error(text('The bundled Markdown could not be loaded.'));
				}
				return response.text();
			});
		}

		function copyText(value) {
			var textarea;
			var copied;

			if (window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText) {
				return window.navigator.clipboard.writeText(value);
			}

			return new Promise(function (resolve, reject) {
				textarea = window.document.createElement('textarea');
				textarea.value = value;
				textarea.setAttribute('readonly', '');
				textarea.style.position = 'fixed';
				textarea.style.opacity = '0';
				window.document.body.appendChild(textarea);
				textarea.select();
				copied = window.document.execCommand('copy');
				window.document.body.removeChild(textarea);

				if (copied) {
					resolve();
				} else {
					reject(new Error(text('The clipboard is unavailable.')));
				}
			});
		}

		function loadSampleMarkdown() {
			setHelperAction('sample');
			fetchBundledMarkdown(editorConfig.sampleMarkdownUrl).then(function (contents) {
				setMarkdownSource(contents);
				setFileName('kototsugi-sample.md');
				setNotice({ status: 'success', message: text('Sample Markdown loaded.') });
				setActivePane('source');
				setSourceView('markdown');
				setWorkspaceOpen(true);
			}).catch(function () {
				setNotice({ status: 'error', message: text('Sample Markdown could not be loaded.') });
			}).then(function () {
				setHelperAction('');
			});
		}

		function copyAuthoringRules() {
			setHelperAction('rules');
			fetchBundledMarkdown(editorConfig.rulesMarkdownUrl).then(function (contents) {
				return copyText(contents);
			}).then(function () {
				setNotice({ status: 'success', message: text('AI authoring rules copied.') });
			}).catch(function () {
				setNotice({ status: 'error', message: text('AI authoring rules could not be copied.') });
			}).then(function () {
				setHelperAction('');
			});
		}

		function loadFile(file) {
			var reader;

			if (!file || !isSupportedMarkdownFile(file)) {
				setNotice({
					status: 'error',
					message: text('Choose a .md, .markdown, or .txt file up to 2 MB.')
				});
				return;
			}

			reader = new window.FileReader();
			reader.onload = function () {
				var contents = typeof reader.result === 'string' ? reader.result : '';

				setMarkdownSource(contents);
				setFileName(file.name);
				setNotice({ status: 'success', message: text('Markdown file loaded.') });
				setActivePane('source');
				setSourceView('markdown');
				setWorkspaceOpen(true);
			};
			reader.onerror = function () {
				setNotice({ status: 'error', message: text('The file could not be read.') });
			};
			reader.readAsText(file, 'UTF-8');
		}

		function handleFileChange(event) {
			var file = event.target.files && event.target.files[0];

			loadFile(file);
			event.target.value = '';
		}

		function handleDragOver(event) {
			event.preventDefault();
			event.dataTransfer.dropEffect = 'copy';
			setDragging(true);
		}

		function handleDragLeave(event) {
			if (!event.currentTarget.contains(event.relatedTarget)) {
				setDragging(false);
			}
		}

		function handleDrop(event) {
			var file = event.dataTransfer.files && event.dataTransfer.files[0];

			event.preventDefault();
			setDragging(false);
			loadFile(file);
		}

		function updatePostSettingValue(key, value) {
			setPostSettings(function (currentSettings) {
				var nextValues = Object.assign({}, currentSettings.values);

				nextValues[key] = Array.isArray(value) ? value.map(function (item) {
					return String(item || '').trim();
				}).filter(Boolean) : value;
				return Object.assign({}, currentSettings, { values: nextValues });
			});
		}

		function updatePostSettingEnabled(key, value) {
			setPostSettings(function (currentSettings) {
				var nextEnabled = Object.assign({}, currentSettings.enabled);

				nextEnabled[key] = value;
				return Object.assign({}, currentSettings, { enabled: nextEnabled });
			});
		}

		function countEnabledPostSettings() {
			var count = 0;

			if (!postSettings.hasFrontMatter) {
				return 0;
			}
			Object.keys(postSettings.enabled).forEach(function (key) {
				var value = postSettings.values[key];

				if (postSettings.enabled[key] && (Array.isArray(value) ? value.length : Boolean(value))) {
					count += 1;
				}
			});
			return count;
		}

		function countPreflightIssues(severity) {
			return preflightIssues.filter(function (issue) {
				return issue.severity === severity;
			}).length;
		}

		function getCurrentBlockCount() {
			var selector = wp.data.select('core/block-editor');

			return selector && selector.getBlockCount ? Number(selector.getBlockCount() || 0) : 0;
		}

		function chooseInsertionMode(mode) {
			setInsertionMode(mode);
			setReplaceConfirmed(false);
		}

		function openReview() {
			setSourceView('review');
			setActivePane('source');
		}

		function focusSourceLine(lineNumber) {
			var normalized = String(source || '').replace(/\r\n?/g, '\n');
			var lines = normalized.split('\n');
			var offset = 0;
			var index;

			for (index = 0; index < Math.max(0, lineNumber - 1); index += 1) {
				offset += lines[index].length + 1;
			}

			setSourceView('markdown');
			setActivePane('source');
			window.setTimeout(function () {
				var textarea = window.document.querySelector('.kototsugi-workspace-modal .kototsugi-workspace__textarea textarea');

				if (textarea) {
					textarea.focus();
					textarea.setSelectionRange(offset, offset + (lines[lineNumber - 1] || '').length);
				}
			}, 0);
		}

		function collectImportImages() {
			var images = extractRemoteImages(source).slice();
			var seen = Object.create(null);
			var featuredUrl = postSettings.values.featuredImage;

			images.forEach(function (image) {
				seen[image.url] = true;
			});
			if (postSettings.hasFrontMatter && postSettings.enabled.featuredImage &&
				/^https?:\/\//i.test(featuredUrl) && !seen[featuredUrl]) {
				images.push({
					url: featuredUrl,
					alt: postSettings.values.featuredImageAlt || postSettings.values.title || ''
				});
			}
			return images;
		}

		function getEditedPostAttribute(attribute) {
			var selector = wp.data.select('core/editor');

			if (selector && selector.getEditedPostAttribute) {
				return selector.getEditedPostAttribute(attribute);
			}
			if (selector && selector.getCurrentPostAttribute) {
				return selector.getCurrentPostAttribute(attribute);
			}
			return undefined;
		}

		function findExactTerm(endpoint, name) {
			return apiFetch({
				path: '/wp/v2/' + endpoint + '?search=' + encodeURIComponent(name) + '&per_page=100&context=edit'
			}).then(function (terms) {
				var normalizedName = String(name || '').trim().toLocaleLowerCase();

				return (terms || []).find(function (term) {
					return String(term.name || '').trim().toLocaleLowerCase() === normalizedName ||
						String(term.slug || '').trim().toLocaleLowerCase() === normalizedName;
				}) || null;
			});
		}

		function resolveTermIds(endpoint, names) {
			var createdCount = 0;
			var failedCount = 0;

			return Promise.all(names.map(function (name) {
				return findExactTerm(endpoint, name).then(function (term) {
					if (term && term.id) {
						return Number(term.id);
					}
					if (!createMissingTerms) {
						failedCount += 1;
						return 0;
					}
					return apiFetch({
						path: '/wp/v2/' + endpoint,
						method: 'POST',
						data: { name: name }
					}).then(function (createdTerm) {
						if (createdTerm && createdTerm.id) {
							createdCount += 1;
							return Number(createdTerm.id);
						}
						failedCount += 1;
						return 0;
					}).catch(function () {
						return findExactTerm(endpoint, name).then(function (existingTerm) {
							if (existingTerm && existingTerm.id) {
								return Number(existingTerm.id);
							}
							failedCount += 1;
							return 0;
						}).catch(function () {
							failedCount += 1;
							return 0;
						});
					});
				}).catch(function () {
					failedCount += 1;
					return 0;
				});
			})).then(function (ids) {
				return {
					ids: ids.filter(Boolean),
					createdCount: createdCount,
					failedCount: failedCount
				};
			});
		}

		function collectPostSettingEdits(imageResult) {
			var edits = {};
			var appliedCount = 0;
			var failedCount = 0;
			var createdTermCount = 0;
			var tasks = [];
			var title = postSettings.hasFrontMatter ? postSettings.values.title : findTitle(source);
			var featuredImage;

			if (shouldApplyDocumentTitle && title) {
				edits.title = title;
				appliedCount += 1;
			}

			if (!postSettings.hasFrontMatter) {
				return Promise.resolve({ edits: edits, appliedCount: appliedCount, failedCount: 0, createdTermCount: 0 });
			}

			if (postSettings.enabled.excerpt && postSettings.values.excerpt) {
				edits.excerpt = postSettings.values.excerpt;
				appliedCount += 1;
			}
			if (postSettings.enabled.slug && postSettings.values.slug) {
				edits.slug = postSettings.values.slug;
				appliedCount += 1;
			}
			if (postSettings.enabled.featuredImage && postSettings.values.featuredImage) {
				featuredImage = imageResult.imageMap[postSettings.values.featuredImage];
				if (featuredImage && featuredImage.id) {
					edits.featured_media = Number(featuredImage.id);
					appliedCount += 1;
				} else {
					failedCount += 1;
				}
			}

			if (postSettings.enabled.categories && postSettings.values.categories.length) {
				if (Array.isArray(getEditedPostAttribute('categories'))) {
					tasks.push(resolveTermIds('categories', postSettings.values.categories).then(function (result) {
						if (result.ids.length) {
							edits.categories = result.ids;
							appliedCount += 1;
						}
						failedCount += result.failedCount;
						createdTermCount += result.createdCount;
					}));
				} else {
					failedCount += 1;
				}
			}

			if (postSettings.enabled.tags && postSettings.values.tags.length) {
				if (Array.isArray(getEditedPostAttribute('tags'))) {
					tasks.push(resolveTermIds('tags', postSettings.values.tags).then(function (result) {
						if (result.ids.length) {
							edits.tags = result.ids;
							appliedCount += 1;
						}
						failedCount += result.failedCount;
						createdTermCount += result.createdCount;
					}));
				} else {
					failedCount += 1;
				}
			}

			return Promise.all(tasks).then(function () {
				return {
					edits: edits,
					appliedCount: appliedCount,
					failedCount: failedCount,
					createdTermCount: createdTermCount
				};
			});
		}

		function applyPostSettings(imageResult) {
			return collectPostSettingEdits(imageResult).then(function (result) {
				if (Object.keys(result.edits).length) {
					wp.data.dispatch('core/editor').editPost(result.edits);
				}
				return result;
			});
		}

		function importRemoteImages(images, targetPostId) {
			var imageMap = Object.create(null);
			var importedCount = 0;
			var failedCount = 0;
			var postSelector = wp.data.select('core/editor');
			var postId = targetPostId || (postSelector && postSelector.getCurrentPostId ? postSelector.getCurrentPostId() : 0);

			return images.reduce(function (sequence, image, index) {
				return sequence.then(function () {
					setImageProgress({ current: index, total: images.length });
					return apiFetch({
						path: '/kototsugi/v1/images/import',
						method: 'POST',
						data: {
							url: image.url,
							alt: image.alt,
							post_id: postId || 0
						}
					}).then(function (result) {
						if (result && result.id && result.url) {
							imageMap[image.url] = result;
							importedCount += 1;
						} else {
							failedCount += 1;
						}
					}).catch(function () {
						failedCount += 1;
					}).then(function () {
						setImageProgress({ current: index + 1, total: images.length });
					});
				});
			}, Promise.resolve()).then(function () {
				return {
					imageMap: imageMap,
					importedCount: importedCount,
					failedCount: failedCount
				};
			});
		}

		function getCurrentPostRestEndpoint() {
			var editorSelector = wp.data.select('core/editor');
			var coreSelector = wp.data.select('core');
			var postTypeName = editorSelector && editorSelector.getCurrentPostType ? editorSelector.getCurrentPostType() : 'post';
			var postType = coreSelector && coreSelector.getPostType ? coreSelector.getPostType(postTypeName) : null;
			var restBase = postType && postType.rest_base ? postType.rest_base : '';

			if (!restBase && postTypeName === 'post') {
				restBase = 'posts';
			} else if (!restBase && postTypeName === 'page') {
				restBase = 'pages';
			}

			return restBase ? '/wp/v2/' + restBase : '';
		}

		function serializeBlocks(blocks) {
			return wp.blocks.serialize ? wp.blocks.serialize(blocks) : '';
		}

		function createDraftShell(initialBlocks) {
			var endpoint = getCurrentPostRestEndpoint();
			var data = {
				status: 'draft',
				content: serializeBlocks(initialBlocks)
			};
			var title = postSettings.hasFrontMatter ? postSettings.values.title : findTitle(source);

			if (!endpoint) {
				return Promise.reject(new Error('Unsupported post type'));
			}
			if (shouldApplyDocumentTitle && title) {
				data.title = title;
			}
			if (postSettings.hasFrontMatter && postSettings.enabled.excerpt && postSettings.values.excerpt) {
				data.excerpt = postSettings.values.excerpt;
			}
			if (postSettings.hasFrontMatter && postSettings.enabled.slug && postSettings.values.slug) {
				data.slug = postSettings.values.slug;
			}

			return apiFetch({
				path: endpoint,
				method: 'POST',
				data: data
			}).then(function (draft) {
				if (!draft || !draft.id) {
					throw new Error(text('The draft ID was not found.'));
				}
				return { id: Number(draft.id), endpoint: endpoint };
			});
		}

		function draftEditUrl(draftId) {
			var currentUrl = String(window.location.href || '');
			var adminIndex = currentUrl.indexOf('/wp-admin/');
			var adminBase = adminIndex >= 0 ? currentUrl.slice(0, adminIndex + 10) : '/wp-admin/';

			return adminBase + 'post.php?post=' + Number(draftId) + '&action=edit';
		}

		function finishCurrentPostImport(imageResult) {
			var html = markdownToHtml(source, shouldApplyDocumentTitle, imageResult.imageMap);
			var blocks = htmlToBlocks(html);
			var messages = [];

			if (!blocks.length) {
				setNotice({ status: 'error', message: text('Enter some Markdown.') });
				return Promise.resolve();
			}

			return applyPostSettings(imageResult).then(function (postResult) {
				var hasFailures = imageResult.failedCount || postResult.failedCount;

				if (insertionMode === 'replace') {
					wp.data.dispatch('core/block-editor').resetBlocks(blocks);
					messages.push(text('The post body was replaced with blocks.'));
				} else {
					wp.data.dispatch('core/block-editor').insertBlocks(blocks);
					messages.push(text('Blocks were inserted at the current cursor position.'));
				}
				if (postResult.appliedCount) {
					messages.push(postResult.appliedCount + text(' post settings were applied.'));
				}
				if (postResult.createdTermCount) {
					messages.push(postResult.createdTermCount + text(' categories or tags were created.'));
				}
				if (imageResult.importedCount) {
					messages.push(imageResult.importedCount + text(' images were saved to the Media Library.'));
				}
				if (imageResult.failedCount) {
					messages.push(imageResult.failedCount + text(' images could not be saved, so their remote URLs were kept in the post.'));
				}
				if (postResult.failedCount) {
					messages.push(text('Some post settings could not be applied for this post type or with your current permissions.'));
				}
				messages.push(text('The post has not been saved yet.'));

				setNotice({ status: hasFailures ? 'warning' : 'success', message: messages.join(' ') });
				resetWorkspaceAfterApply();
				setWorkspaceOpen(false);
			});
		}

		function finishDraftImport(draft, imageResult) {
			var html = markdownToHtml(source, shouldApplyDocumentTitle, imageResult.imageMap);
			var blocks = htmlToBlocks(html);

			if (!blocks.length) {
				return Promise.reject(new Error(text('The draft blocks were not found.')));
			}

			return collectPostSettingEdits(imageResult).then(function (postResult) {
				var update = Object.assign({}, postResult.edits, {
					status: 'draft',
					content: serializeBlocks(blocks)
				});

				return apiFetch({
					path: draft.endpoint + '/' + draft.id,
					method: 'POST',
					data: update
				}).then(function () {
					var hasFailures = imageResult.failedCount || postResult.failedCount;
					var message = el(
						Fragment,
						null,
						text('A new draft was created.'),
						hasFailures ? ' ' + text('Some images or post settings could not be applied.') : ' ',
						el('a', { href: draftEditUrl(draft.id), target: '_blank', rel: 'noopener noreferrer' }, text('Open draft'))
					);

					setNotice({ status: hasFailures ? 'warning' : 'success', message: message });
					resetWorkspaceAfterApply();
					setWorkspaceOpen(false);
				});
			});
		}

		function importBlocks() {
			var initialBlocks;
			var images = importRemoteMedia ? remoteImages : [];
			var imageTask;
			var importTask;
			var createdDraft = null;

			if (!source.trim()) {
				setNotice({ status: 'error', message: text('Enter some Markdown.') });
				return;
			}

			initialBlocks = htmlToBlocks(markdownToHtml(source, shouldApplyDocumentTitle));
			if (!initialBlocks.length) {
				setNotice({ status: 'error', message: text('Markdown could not be converted to blocks.') });
				return;
			}
			if (preflightErrorCount) {
				setNotice({ status: 'error', message: text('Fix the preflight errors before continuing.') });
				openReview();
				return;
			}
			if (insertionMode === 'replace' && currentBlockCount > 0 && !replaceConfirmed) {
				setNotice({ status: 'warning', message: text('Confirm replacement before replacing the existing post body.') });
				openReview();
				return;
			}

			setIsImporting(true);
			setImageProgress({ current: 0, total: images.length });
			imageTask = function (targetPostId) {
				return images.length ? importRemoteImages(images, targetPostId) : Promise.resolve({
					imageMap: Object.create(null),
					importedCount: 0,
					failedCount: 0
				});
			};

			if (insertionMode === 'draft') {
				importTask = createDraftShell(initialBlocks).then(function (draft) {
					createdDraft = draft;
					return imageTask(draft.id).then(function (result) {
						return finishDraftImport(draft, result);
					});
				});
			} else {
				importTask = imageTask(0).then(function (result) {
					return finishCurrentPostImport(result);
				});
			}

			importTask.catch(function () {
				if (createdDraft) {
					setNotice({
						status: 'warning',
						message: el(
							Fragment,
							null,
							text('The draft was created, but not all conversion steps could be completed. '),
							el('a', { href: draftEditUrl(createdDraft.id), target: '_blank', rel: 'noopener noreferrer' }, text('Open draft'))
						)
					});
				} else {
					setNotice({ status: 'error', message: text('The Markdown import could not be completed.') });
				}
			}).then(function () {
				setIsImporting(false);
				setImageProgress({ current: 0, total: 0 });
			});
		}

		function renderFileInput() {
			return el('input', {
				ref: fileInputRef,
				type: 'file',
				className: 'kototsugi-file-input',
				'aria-label': text('Choose a Markdown file'),
				accept: '.md,.markdown,.txt,text/markdown,text/plain',
				onChange: handleFileChange
			});
		}

		function renderPostSettingRow(key, label, field) {
			return el(
				'div',
				{ className: 'kototsugi-post-setting' },
				el(CheckboxControl, {
					label: label,
					checked: postSettings.enabled[key],
					onChange: function (value) { updatePostSettingEnabled(key, value); },
					disabled: isImporting
				}),
				field
			);
		}

		function renderPostSettings() {
			var featuredImageUrl = postSettings.values.featuredImage;

			return el(
				'div',
				{ className: 'kototsugi-post-settings' },
				el(
					'div',
					{ className: 'kototsugi-post-settings__summary' },
					el('strong', null, text('Post settings')),
					el('span', null, detectedSettingCount + text(' settings to apply'))
				),
				el(
					'p',
					{ className: 'kototsugi-post-settings__intro' },
					text('These post details were read from Front Matter. Review each item, edit it if needed, or clear its checkbox to leave it unchanged.')
				),
				renderPostSettingRow(
					'title',
					text('Apply post title'),
					el(TextControl, {
						label: text('Title'),
						value: postSettings.values.title,
						onChange: function (value) { updatePostSettingValue('title', value); },
						disabled: isImporting || !postSettings.enabled.title
					})
				),
				renderPostSettingRow(
					'excerpt',
					text('Apply excerpt'),
					el(TextareaControl, {
						label: text('Excerpt'),
						value: postSettings.values.excerpt,
						onChange: function (value) { updatePostSettingValue('excerpt', value); },
						disabled: isImporting || !postSettings.enabled.excerpt,
						rows: 4
					})
				),
				renderPostSettingRow(
					'slug',
					text('Apply slug'),
					el(TextControl, {
						label: text('Slug'),
						value: postSettings.values.slug,
						onChange: function (value) { updatePostSettingValue('slug', value); },
						disabled: isImporting || !postSettings.enabled.slug
					})
				),
				renderPostSettingRow(
					'tags',
					text('Apply tags'),
					el(FormTokenField, {
						label: text('Tags'),
						value: postSettings.values.tags,
						onChange: function (value) { updatePostSettingValue('tags', value); },
						disabled: isImporting || !postSettings.enabled.tags
					})
				),
				renderPostSettingRow(
					'categories',
					text('Apply categories'),
					el(FormTokenField, {
						label: text('Categories'),
						value: postSettings.values.categories,
						onChange: function (value) { updatePostSettingValue('categories', value); },
						disabled: isImporting || !postSettings.enabled.categories
					})
				),
				renderPostSettingRow(
					'featuredImage',
					text('Apply featured image'),
					el(
						Fragment,
						null,
						/^https?:\/\//i.test(featuredImageUrl) ? el('img', {
							className: 'kototsugi-post-setting__image',
							src: featuredImageUrl,
							alt: postSettings.values.featuredImageAlt || ''
						}) : null,
						el(TextControl, {
							label: text('Image URL'),
							value: featuredImageUrl,
							onChange: function (value) { updatePostSettingValue('featuredImage', value); },
							disabled: isImporting || !postSettings.enabled.featuredImage
						}),
						el(TextControl, {
							label: text('Alt text'),
							value: postSettings.values.featuredImageAlt,
							onChange: function (value) { updatePostSettingValue('featuredImageAlt', value); },
							disabled: isImporting || !postSettings.enabled.featuredImage
						})
					)
				),
				postSettings.unknownFields.length ? el(
					Notice,
					{ status: 'info', isDismissible: false, className: 'kototsugi-post-settings__notice' },
					text('Unsupported fields will not be applied:') + ' ' + postSettings.unknownFields.join(', ')
				) : null
			);
		}

		function getInsertionModeLabel(mode) {
			if (mode === 'replace') {
				return text('Replace content');
			}
			if (mode === 'draft') {
				return text('Create new draft');
			}
			return text('Add at cursor');
		}

		function getInsertionModeDescription(mode) {
			if (mode === 'replace') {
				return text('Replace all blocks in the current post. Confirmation is required, and the post will not be saved automatically.');
			}
			if (mode === 'draft') {
				return text('Leave the current post unchanged and save the content and selected post settings as a new draft.');
			}
			return text('Add blocks at the current cursor position. Existing content remains, and the post will not be saved automatically.');
		}

		function getPrimaryActionLabel() {
			if (insertionMode === 'replace') {
				return text('Replace the content');
			}
			if (insertionMode === 'draft') {
				return text('Create new draft');
			}
			return postSettings.hasFrontMatter ? text('Apply content and settings') : text('Insert as blocks');
		}

		function renderReviewIssue(issue) {
			var severityLabel = issue.severity === 'error' ? text('Error') :
				(issue.severity === 'warning' ? text('Warning') : text('Info'));

			return el(
				'li',
				{ className: 'kototsugi-review-issue is-' + issue.severity, key: issue.code + '-' + issue.line },
				el(
					'div',
					{ className: 'kototsugi-review-issue__body' },
					el('span', { className: 'kototsugi-review-issue__severity' }, severityLabel),
					el('p', null, issue.message)
				),
				el(Button, {
					variant: 'link',
					onClick: function () { focusSourceLine(issue.line); },
					'aria-label': issue.line + text(' line: edit in Markdown')
				}, issue.line + text(' line'))
			);
		}

		function renderReview() {
			var infoCount = countPreflightIssues('info');
			var checkTitle = actionableIssueCount ? actionableIssueCount + text(' items to review') : text('No issues need fixing');
			var checkDetail = [];

			if (preflightErrorCount) {
				checkDetail.push(text('Error') + ' ' + preflightErrorCount);
			}
			if (preflightWarningCount) {
				checkDetail.push(text('Warning') + ' ' + preflightWarningCount);
			}
			if (infoCount) {
				checkDetail.push(text('Info') + ' ' + infoCount);
			}

			return el(
				'div',
				{ className: 'kototsugi-review' },
				el(
					'p',
					{ className: 'kototsugi-review__intro' },
					text('Review warnings and expected changes, then choose how the article should be applied and which conversion options to use.')
				),
				el(
					'section',
					{ className: 'kototsugi-review__section', 'aria-labelledby': 'kototsugi-review-check-heading' },
					el(
						'div',
						{ className: 'kototsugi-review__heading' },
						el('h2', { id: 'kototsugi-review-check-heading' }, text('Preflight checks')),
						el(Button, { variant: 'tertiary', onClick: function () { setSourceView('markdown'); } }, text('Back to Markdown'))
					),
					el(
						'div',
						{
							className: 'kototsugi-review__summary' + (actionableIssueCount ? ' has-issues' : ' is-clear'),
							role: 'status'
						},
						el('strong', null, checkTitle),
						checkDetail.length ? el('span', null, checkDetail.join(' / ')) : null
					),
					preflightIssues.length ? el('ul', { className: 'kototsugi-review-issues' }, preflightIssues.map(renderReviewIssue)) : null
				),
				el(
					'section',
					{ className: 'kototsugi-review__section', 'aria-labelledby': 'kototsugi-review-mode-heading' },
					el('h2', { id: 'kototsugi-review-mode-heading' }, text('Insertion method')),
					el(
						'div',
						{ className: 'kototsugi-review__mode', role: 'group', 'aria-label': text('Markdown insertion method') },
						['cursor', 'replace', 'draft'].map(function (mode) {
							return el(Button, {
								key: mode,
								variant: insertionMode === mode ? 'secondary' : 'tertiary',
								'aria-pressed': insertionMode === mode,
								onClick: function () { chooseInsertionMode(mode); },
								disabled: isImporting
							},
								el('strong', { className: 'kototsugi-review__mode-label' }, getInsertionModeLabel(mode)),
								el('span', { className: 'kototsugi-review__mode-description' }, getInsertionModeDescription(mode))
							);
						})
					),
					insertionMode === 'replace' && currentBlockCount ? el(CheckboxControl, {
						className: 'kototsugi-review__replace-confirmation',
						label: currentBlockCount + text(' existing blocks: confirm replacement'),
						checked: replaceConfirmed,
						onChange: setReplaceConfirmed,
						disabled: isImporting
					}) : null
				),
				el(
					'section',
					{ className: 'kototsugi-review__section', 'aria-labelledby': 'kototsugi-review-options-heading' },
					el('h2', { id: 'kototsugi-review-options-heading' }, text('Conversion options')),
					!postSettings.hasFrontMatter ? el(CheckboxControl, {
						label: text('Use first H1 as post title'),
						checked: useFirstHeadingAsTitle,
						onChange: updateTitleSetting,
						disabled: isImporting
					}) : null,
					el(CheckboxControl, {
						label: text('Save remote images to the Media Library'),
						checked: importRemoteMedia,
						onChange: setImportRemoteMedia,
						disabled: isImporting || !remoteImages.length
					}),
					postSettings.hasFrontMatter &&
						((postSettings.enabled.tags && postSettings.values.tags.length) ||
						(postSettings.enabled.categories && postSettings.values.categories.length)) ? el(CheckboxControl, {
							label: text('Create missing categories and tags'),
							checked: createMissingTerms,
							onChange: setCreateMissingTerms,
							disabled: isImporting
						}) : null
				),
				el(
					'section',
					{ className: 'kototsugi-review__section', 'aria-labelledby': 'kototsugi-review-save-heading' },
					el('h2', { id: 'kototsugi-review-save-heading' }, text('What will be saved')),
					el(
						'ul',
						{ className: 'kototsugi-review__effects' },
						el('li', null, insertionMode === 'draft' ? text('A new draft will be saved to WordPress.') : text('The current post will not be saved automatically.')),
						insertionMode === 'replace' && currentBlockCount ? el('li', null, currentBlockCount + text(' existing blocks will be replaced in the editor.')) : null,
						importRemoteMedia && remoteImages.length ? el('li', null, remoteImages.length + text(' remote images will be saved to the Media Library.')) : null,
						createMissingTerms && postSettings.hasFrontMatter &&
							(postSettings.values.tags.length || postSettings.values.categories.length) ? el('li', null, text('Missing categories or tags will be created.')) : null
					)
				)
			);
		}

		function handleTabKeyDown(event) {
			var tabs;
			var currentIndex;
			var nextIndex;

			if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) === -1) {
				return;
			}

			tabs = event.currentTarget.parentNode.querySelectorAll('[role="tab"]');
			currentIndex = Array.prototype.indexOf.call(tabs, event.currentTarget);
			nextIndex = currentIndex;

			if (event.key === 'Home') {
				nextIndex = 0;
			} else if (event.key === 'End') {
				nextIndex = tabs.length - 1;
			} else if (event.key === 'ArrowLeft') {
				nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
			} else if (event.key === 'ArrowRight') {
				nextIndex = (currentIndex + 1) % tabs.length;
			}

			event.preventDefault();
			tabs[nextIndex].focus();
			tabs[nextIndex].click();
		}

		function renderWorkspace() {
			return el(
				Modal,
				{
					title: el(
						'span',
						{ className: 'kototsugi-workspace-modal__title' },
						el('span', { className: 'kototsugi-workspace-modal__brand' }, 'KOTOTSUGI'),
						el('span', { className: 'kototsugi-workspace-modal__subtitle' }, text('Markdown posting'))
					),
					className: 'kototsugi-workspace-modal',
					onRequestClose: function () {
						if (!isImporting) {
							setWorkspaceOpen(false);
						}
					}
				},
				el(
					'div',
					{ className: 'kototsugi-workspace' },
					el(
						'div',
						{ className: 'kototsugi-workspace__toolbar' },
						el(
							'div',
							{ className: 'kototsugi-workspace__document', 'aria-label': text('Current Markdown source') },
							el('strong', null, fileName || text('Markdown source')),
							el('span', null, source.length.toLocaleString() + text(' characters'))
						),
						el(
							'div',
							{ className: 'kototsugi-workspace__file-actions' },
							el(Button, {
								variant: 'secondary',
								'aria-label': text('Choose a Markdown file'),
								onClick: chooseFile,
								disabled: isImporting
							}, text('Choose file')),
							source ? el(Button, { variant: 'tertiary', onClick: clearSource, disabled: isImporting }, text('Clear source')) : null
						)
					),
					el(
						'div',
						{
							className: 'kototsugi-workspace__tabs ' + (postSettings.hasFrontMatter ? 'is-four-tabs' : 'is-three-tabs'),
							role: 'tablist',
							'aria-label': text('Workspace')
						},
						el(Button, {
							id: 'kototsugi-mobile-tab-markdown',
							variant: activePane === 'source' && sourceView === 'markdown' ? 'secondary' : 'tertiary',
							role: 'tab',
							'aria-selected': activePane === 'source' && sourceView === 'markdown',
							'aria-controls': 'kototsugi-panel-source',
							tabIndex: activePane === 'source' && sourceView === 'markdown' ? 0 : -1,
							onKeyDown: handleTabKeyDown,
							onClick: function () {
								setSourceView('markdown');
								setActivePane('source');
							}
						}, text('Markdown')),
						postSettings.hasFrontMatter ? el(Button, {
							id: 'kototsugi-mobile-tab-settings',
							variant: activePane === 'source' && sourceView === 'settings' ? 'secondary' : 'tertiary',
							role: 'tab',
							'aria-selected': activePane === 'source' && sourceView === 'settings',
							'aria-controls': 'kototsugi-panel-source',
							tabIndex: activePane === 'source' && sourceView === 'settings' ? 0 : -1,
							onKeyDown: handleTabKeyDown,
							onClick: function () {
								setSourceView('settings');
								setActivePane('source');
							}
							}, text('Post settings') + ' ' + detectedSettingCount + text(' items')) : null,
							el(Button, {
								id: 'kototsugi-mobile-tab-review',
								variant: activePane === 'source' && sourceView === 'review' ? 'secondary' : 'tertiary',
								role: 'tab',
								'aria-selected': activePane === 'source' && sourceView === 'review',
								'aria-controls': 'kototsugi-panel-source',
								tabIndex: activePane === 'source' && sourceView === 'review' ? 0 : -1,
								onKeyDown: handleTabKeyDown,
								onClick: function () {
									setSourceView('review');
									setActivePane('source');
								}
							}, actionableIssueCount ? text('Review before applying') + ' ' + actionableIssueCount + text(' items') : text('Review before applying')),
							el(Button, {
							id: 'kototsugi-mobile-tab-preview',
							variant: activePane === 'preview' ? 'secondary' : 'tertiary',
							role: 'tab',
							'aria-selected': activePane === 'preview',
							'aria-controls': 'kototsugi-panel-preview',
							tabIndex: activePane === 'preview' ? 0 : -1,
							onKeyDown: handleTabKeyDown,
							onClick: function () { setActivePane('preview'); }
						}, text('Preview'))
					),
					el(
						'div',
						{ className: 'kototsugi-workspace__body' },
						el(
							'section',
							{
								id: 'kototsugi-panel-source',
								className: 'kototsugi-workspace__pane kototsugi-workspace__pane--source' + (activePane === 'source' ? ' is-active' : '') + (isDragging ? ' is-dragging' : ''),
								role: 'tabpanel',
								'aria-label': sourceView === 'settings' ? text('Post settings') :
									(sourceView === 'review' ? text('Review before applying') : text('Markdown source')),
								onDragOver: handleDragOver,
								onDragLeave: handleDragLeave,
								onDrop: handleDrop
							},
							el(
								'div',
								{ className: 'kototsugi-workspace__source-tabs', role: 'tablist', 'aria-label': text('Source, post settings, and review before applying') },
								el(Button, {
									id: 'kototsugi-desktop-tab-markdown',
									variant: sourceView === 'markdown' ? 'secondary' : 'tertiary',
									role: 'tab',
									'aria-selected': sourceView === 'markdown',
									'aria-controls': 'kototsugi-panel-source',
									tabIndex: sourceView === 'markdown' ? 0 : -1,
									onKeyDown: handleTabKeyDown,
									onClick: function () { setSourceView('markdown'); }
								}, text('Markdown')),
								postSettings.hasFrontMatter ? el(Button, {
									id: 'kototsugi-desktop-tab-settings',
									variant: sourceView === 'settings' ? 'secondary' : 'tertiary',
									role: 'tab',
									'aria-selected': sourceView === 'settings',
									'aria-controls': 'kototsugi-panel-source',
									tabIndex: sourceView === 'settings' ? 0 : -1,
									onKeyDown: handleTabKeyDown,
									onClick: function () { setSourceView('settings'); }
								}, text('Post settings') + ' ' + detectedSettingCount + text(' items')) : null,
								el(Button, {
									id: 'kototsugi-desktop-tab-review',
									variant: sourceView === 'review' ? 'secondary' : 'tertiary',
									role: 'tab',
									'aria-selected': sourceView === 'review',
									'aria-controls': 'kototsugi-panel-source',
									tabIndex: sourceView === 'review' ? 0 : -1,
									onKeyDown: handleTabKeyDown,
									onClick: openReview
								}, actionableIssueCount ? text('Review before applying') + ' ' + actionableIssueCount + text(' items') : text('Review before applying'))
							),
							sourceView === 'settings' && postSettings.hasFrontMatter ? renderPostSettings() :
								sourceView === 'review' ? renderReview() : el(
								Fragment,
								null,
								el(TextareaControl, {
									className: 'kototsugi-workspace__textarea',
									label: text('Markdown source'),
									hideLabelFromVision: true,
									value: source,
									onChange: updateSource,
									disabled: isImporting,
					placeholder: text('# Article title\n\nPaste Markdown here or drop a file.')
								}),
								isDragging ? el('div', { className: 'kototsugi-workspace__drop-overlay' }, text('Drop here')) : null
							)
						),
						el(
							'section',
							{
								id: 'kototsugi-panel-preview',
								className: 'kototsugi-workspace__pane kototsugi-workspace__pane--preview' + (activePane === 'preview' ? ' is-active' : ''),
								role: 'tabpanel',
								'aria-label': text('Preview')
							},
							el('h2', { className: 'kototsugi-workspace__pane-title' }, text('Preview')),
							previewHtml ? el('div', {
								className: 'kototsugi-preview kototsugi-preview--workspace',
								dangerouslySetInnerHTML: { __html: previewHtml }
							}) : el('div', { className: 'kototsugi-preview__empty' }, text('There is no source to preview.'))
						)
					),
					el(
						'div',
						{ className: 'kototsugi-workspace__footer' },
						el(
							'div',
								{ className: 'kototsugi-workspace__settings' },
								postSettings.hasFrontMatter ? el(
								'span',
								{ className: 'kototsugi-workspace__settings-count' },
								text('Front Matter') + ' ' + detectedSettingCount + text(' items')
								) : null,
								insertionMode !== 'cursor' ? el('span', { className: 'kototsugi-workspace__mode-summary' }, getInsertionModeLabel(insertionMode)) : null,
								importRemoteMedia && remoteImages.length ? el('span', { className: 'kototsugi-workspace__effect-summary' }, text('Save images') + ' ' + remoteImages.length + text(' items')) : null,
								createMissingTerms && postSettings.hasFrontMatter &&
									(postSettings.values.tags.length || postSettings.values.categories.length) ? el('span', { className: 'kototsugi-workspace__effect-summary' }, text('Create missing terms')) : null,
								isImporting ? el(
								'span',
								{ className: 'kototsugi-workspace__progress', role: 'status', 'aria-live': 'polite' },
								imageProgress.total ? text('Importing images...') + ' ' + imageProgress.current + ' / ' + imageProgress.total : text('Applying post settings...')
							) : null
						),
						el(
							'div',
							{ className: 'kototsugi-workspace__footer-actions' },
							el(Button, { variant: 'tertiary', onClick: function () { setWorkspaceOpen(false); }, disabled: isImporting }, text('Close')),
								el(Button, {
									variant: 'primary',
									onClick: importBlocks,
									disabled: !source.trim() || isImporting || preflightErrorCount > 0 ||
										(insertionMode === 'replace' && currentBlockCount > 0 && !replaceConfirmed),
									isBusy: isImporting
								}, isImporting ? text('Importing...') : getPrimaryActionLabel())
						)
					)
				)
			);
		}

		return el(
			Fragment,
			null,
			el(
				'div',
				{ className: 'kototsugi-sidebar' },
				el(
					'div',
					{ className: 'kototsugi-sidebar__intro' },
					el('p', { className: 'kototsugi-sidebar__eyebrow' }, 'KOTOTSUGI · Markdown Posting'),
					el('h2', null, text('Markdown source'))
				),
				renderFileInput(),
				notice ? el(Notice, {
					status: notice.status,
					isDismissible: true,
					onRemove: function () { setNotice(null); }
				}, notice.message) : null,
				el(
					'div',
					{
						className: 'kototsugi-dropzone' + (isDragging ? ' is-dragging' : ''),
						role: 'region',
						'aria-label': text('Load a Markdown file'),
						onDragOver: handleDragOver,
						onDragLeave: handleDragLeave,
						onDrop: handleDrop
					},
					el('strong', null, text('Markdown file')),
					el('span', null, text('.md / .markdown / .txt, up to 2 MB')),
					el(Button, { variant: 'secondary', 'aria-label': text('Choose a Markdown file'), onClick: chooseFile }, text('Choose file')),
					!source ? el(Button, {
						variant: 'tertiary',
						className: 'kototsugi-dropzone__sample',
						onClick: loadSampleMarkdown,
						disabled: Boolean(helperAction),
						isBusy: helperAction === 'sample'
					}, helperAction === 'sample' ? text('Loading sample...') : text('Load sample Markdown')) : null
				),
				source ? el(
					'div',
					{ className: 'kototsugi-sidebar__document' },
					el('strong', null, fileName || text('Pasted source')),
					el('span', null, source.length.toLocaleString() + text(' characters'))
				) : null,
				el(Button, {
					variant: 'primary',
					className: 'kototsugi-sidebar__open',
					onClick: function () { setWorkspaceOpen(true); }
				}, text('Open workspace')),
				source ? el(Button, { variant: 'tertiary', onClick: clearSource }, text('Clear source')) : null,
				el(Button, {
					variant: 'tertiary',
					className: 'kototsugi-sidebar__rules',
					onClick: copyAuthoringRules,
					disabled: Boolean(helperAction),
					isBusy: helperAction === 'rules'
				}, helperAction === 'rules' ? text('Copying...') : text('Copy AI authoring rules'))
			),
			isWorkspaceOpen ? renderWorkspace() : null
		);
	}

	registerPlugin('kototsugi', {
		render: function () {
			return el(
				Fragment,
				null,
				el(PluginSidebarMoreMenuItem, { target: 'kototsugi-sidebar', icon: 'edit' }, 'KOTOTSUGI'),
				el(PluginSidebar, { name: 'kototsugi-sidebar', title: 'KOTOTSUGI', icon: 'edit' }, el(KototsugiSidebar))
			);
		}
	});
}(window.wp));
