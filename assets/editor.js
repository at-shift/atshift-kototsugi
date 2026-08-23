(function (wp) {
	'use strict';

	if (!wp || !wp.apiFetch || !wp.blocks || !wp.components || !wp.data || (!wp.editor && !wp.editPost) || !wp.element || !wp.plugins) {
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

		if (/^(https?:|mailto:|#|\/)/i.test(url)) {
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
			addIssue('unclosed_front_matter', 'warning', 1, text('Front Matterを閉じる --- が見つかりません。'));
		}

		document.unknownFields.forEach(function (field) {
			var expression = new RegExp('^' + field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:', 'i');
			var fieldIndex = allLines.findIndex(function (candidate) { return expression.test(candidate); });

			addIssue(
				'unsupported_front_matter_' + field.toLowerCase(),
				'info',
				fieldIndex >= 0 ? fieldIndex + 1 : 1,
				text('未対応のFront Matter項目は反映しません:') + ' ' + field
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
						addIssue('unsupported_fenced_language', 'warning', lineNumber, text('このコードブロックは専用ブロックへ変換されず、通常のコードとして挿入されます。'));
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
				addIssue('unsupported_task_list', 'warning', lineNumber, text('タスクリストは通常のリストとして変換され、チェック状態は保持されません。'));
			}
			if (/^(?:\t|\s{2,})(?:[-+*]|\d+\.)\s+/.test(line)) {
				addIssue('unsupported_nested_list', 'warning', lineNumber, text('ネストしたリストは1階層のリストとして変換されます。'));
			}
			if (/\[\^[^\]]+\]/.test(line)) {
				addIssue('unsupported_footnote', 'warning', lineNumber, text('脚注記法はリンク付き脚注へ変換されません。'));
			}
			if (/^\s*\$\$\s*$/.test(line)) {
				addIssue('unsupported_math', 'warning', lineNumber, text('数式ブロックは専用表示へ変換されません。'));
			}
			if (/^\s*<\/?[A-Za-z][^>]*>/.test(line)) {
				addIssue('unsupported_html', 'warning', lineNumber, text('HTMLはそのまま実行されず、テキストとして挿入されます。'));
			}

			if (line.indexOf('![') !== -1) {
				imageExpression = /!\[([^\]]*)\]\(([^)]*)\)/g;
				imageMatch = imageExpression.exec(line);
				if (!imageMatch) {
					addIssue('malformed_image', 'warning', lineNumber, text('画像記法を読み取れません。括弧とURLを確認してください。'));
				} else {
					do {
						rawUrl = String(imageMatch[2] || '').trim();
						if (!rawUrl || /\s/.test(rawUrl) || !/^(https?:\/\/|\/)/i.test(rawUrl)) {
							addIssue('invalid_image_url', 'warning', lineNumber, text('画像URLはhttp、https、または / から始まるパスを使用してください。'));
						} else if (rawUrl.charAt(0) === '/') {
							addIssue('local_image_url', 'info', lineNumber, text('相対画像はメディアライブラリへ保存されず、入力されたパスを維持します。'));
						}
					} while ((imageMatch = imageExpression.exec(line)) !== null);
				}
			}
		}

		if (inFence) {
			addIssue('unclosed_code_fence', 'warning', fenceStartLine, text('コードブロックを閉じる ``` が見つかりません。'));
		}

		headings.forEach(function (heading) {
			if (heading.level === 1) {
				if (!firstH1) {
					firstH1 = heading;
				} else {
					addIssue('multiple_h1', 'warning', heading.line, text('H1が複数あります。投稿タイトルとして使うH1を1つにしてください。'));
				}
			}
			if (previousHeading && heading.level > previousHeading.level + 1) {
				addIssue(
					'heading_level_jump',
					'warning',
					heading.line,
					'H' + previousHeading.level + text('の次が') + 'H' + heading.level + text('になっています。見出し階層を確認してください。')
				);
			}
			previousHeading = heading;
		});

		if (applyTitle && firstH1) {
			if (document.title && document.title.toLocaleLowerCase() !== firstH1.text.toLocaleLowerCase()) {
				addIssue('title_conflict', 'warning', firstH1.line, text('Front Matterのtitleと最初のH1が異なります。反映時はH1が本文から除外されます。'));
			} else if (document.title) {
				addIssue('duplicate_document_title', 'info', firstH1.line, text('Front Matterのtitleと同じH1は、本文での重複を避けるため自動的に除外します。'));
			} else {
				addIssue('heading_used_as_title', 'info', firstH1.line, text('最初のH1を投稿タイトルとして使い、本文からは除外します。'));
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

	function htmlToBlocks(html) {
		return wp.blocks.rawHandler({ HTML: html });
	}

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
				return Promise.reject(new Error('同梱Markdownを利用できません。'));
			}

			return window.fetch(url, { credentials: 'same-origin' }).then(function (response) {
				if (!response.ok) {
					throw new Error('同梱Markdownを読み込めませんでした。');
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
					reject(new Error('クリップボードを利用できません。'));
				}
			});
		}

		function loadSampleMarkdown() {
			setHelperAction('sample');
			fetchBundledMarkdown(editorConfig.sampleMarkdownUrl).then(function (contents) {
				setMarkdownSource(contents);
				setFileName('kototsugi-sample.md');
				setNotice({ status: 'success', message: text('テスト用Markdownをセットしました。') });
				setActivePane('source');
				setSourceView('markdown');
				setWorkspaceOpen(true);
			}).catch(function () {
				setNotice({ status: 'error', message: text('テスト用Markdownを読み込めませんでした。') });
			}).then(function () {
				setHelperAction('');
			});
		}

		function copyAuthoringRules() {
			setHelperAction('rules');
			fetchBundledMarkdown(editorConfig.rulesMarkdownUrl).then(function (contents) {
				return copyText(contents);
			}).then(function () {
				setNotice({ status: 'success', message: text('AI用ルールをコピーしました。') });
			}).catch(function () {
				setNotice({ status: 'error', message: text('AI用ルールをコピーできませんでした。') });
			}).then(function () {
				setHelperAction('');
			});
		}

		function loadFile(file) {
			var reader;

			if (!file || !isSupportedMarkdownFile(file)) {
				setNotice({
					status: 'error',
					message: text('2MB以下の .md、.markdown、.txt ファイルを選択してください。')
				});
				return;
			}

			reader = new window.FileReader();
			reader.onload = function () {
				var contents = typeof reader.result === 'string' ? reader.result : '';

				setMarkdownSource(contents);
				setFileName(file.name);
				setNotice({ status: 'success', message: text('Markdownファイルを読み込みました。') });
				setActivePane('source');
				setSourceView('markdown');
				setWorkspaceOpen(true);
			};
			reader.onerror = function () {
				setNotice({ status: 'error', message: text('ファイルを読み込めませんでした。') });
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
					throw new Error('下書きIDが見つかりません。');
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
				setNotice({ status: 'error', message: text('Markdownを入力してください。') });
				return Promise.resolve();
			}

			return applyPostSettings(imageResult).then(function (postResult) {
				var hasFailures = imageResult.failedCount || postResult.failedCount;

				if (insertionMode === 'replace') {
					wp.data.dispatch('core/block-editor').resetBlocks(blocks);
					messages.push(text('投稿本文をブロックで置き換えました。'));
				} else {
					wp.data.dispatch('core/block-editor').insertBlocks(blocks);
					messages.push(text('ブロックを現在のカーソル位置に挿入しました。'));
				}
				if (postResult.appliedCount) {
					messages.push(postResult.appliedCount + text('件の投稿設定を反映しました。'));
				}
				if (postResult.createdTermCount) {
					messages.push(postResult.createdTermCount + text('件のカテゴリーまたはタグを作成しました。'));
				}
				if (imageResult.importedCount) {
					messages.push(imageResult.importedCount + text('件の画像をメディアライブラリに保存しました。'));
				}
				if (imageResult.failedCount) {
					messages.push(imageResult.failedCount + text('件の画像は保存できなかったため、本文では外部URLを維持しました。'));
				}
				if (postResult.failedCount) {
					messages.push(text('一部の投稿設定は、この投稿タイプまたは現在の権限では反映できませんでした。'));
				}
				messages.push(text('投稿はまだ保存されていません。'));

				setNotice({ status: hasFailures ? 'warning' : 'success', message: messages.join(' ') });
				resetWorkspaceAfterApply();
				setWorkspaceOpen(false);
			});
		}

		function finishDraftImport(draft, imageResult) {
			var html = markdownToHtml(source, shouldApplyDocumentTitle, imageResult.imageMap);
			var blocks = htmlToBlocks(html);

			if (!blocks.length) {
				return Promise.reject(new Error('下書きブロックが見つかりません。'));
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
						text('新規下書きを作成しました。'),
						hasFailures ? ' ' + text('一部の画像または投稿設定は反映できませんでした。') : ' ',
						el('a', { href: draftEditUrl(draft.id), target: '_blank', rel: 'noopener noreferrer' }, text('下書きを開く'))
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
				setNotice({ status: 'error', message: text('Markdownを入力してください。') });
				return;
			}

			initialBlocks = htmlToBlocks(markdownToHtml(source, shouldApplyDocumentTitle));
			if (!initialBlocks.length) {
				setNotice({ status: 'error', message: text('Markdownをブロックへ変換できませんでした。') });
				return;
			}
			if (preflightErrorCount) {
				setNotice({ status: 'error', message: text('変換前チェックのエラーを修正してください。') });
				openReview();
				return;
			}
			if (insertionMode === 'replace' && currentBlockCount > 0 && !replaceConfirmed) {
				setNotice({ status: 'warning', message: text('既存本文を置き換える確認が必要です。') });
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
							text('下書きは作成されましたが、すべての変換処理を完了できませんでした。 '),
							el('a', { href: draftEditUrl(createdDraft.id), target: '_blank', rel: 'noopener noreferrer' }, text('下書きを開く'))
						)
					});
				} else {
					setNotice({ status: 'error', message: text('Markdownの取り込み処理を完了できませんでした。') });
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
				'aria-label': text('Markdownファイルを選択'),
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
					el('strong', null, text('投稿設定')),
					el('span', null, detectedSettingCount + text('件を適用'))
				),
				renderPostSettingRow(
					'title',
					text('投稿タイトルを反映'),
					el(TextControl, {
						label: text('タイトル'),
						value: postSettings.values.title,
						onChange: function (value) { updatePostSettingValue('title', value); },
						disabled: isImporting || !postSettings.enabled.title
					})
				),
				renderPostSettingRow(
					'excerpt',
					text('抜粋を反映'),
					el(TextareaControl, {
						label: text('抜粋'),
						value: postSettings.values.excerpt,
						onChange: function (value) { updatePostSettingValue('excerpt', value); },
						disabled: isImporting || !postSettings.enabled.excerpt,
						rows: 4
					})
				),
				renderPostSettingRow(
					'slug',
					text('スラッグを反映'),
					el(TextControl, {
						label: text('スラッグ'),
						value: postSettings.values.slug,
						onChange: function (value) { updatePostSettingValue('slug', value); },
						disabled: isImporting || !postSettings.enabled.slug
					})
				),
				renderPostSettingRow(
					'tags',
					text('タグを反映'),
					el(FormTokenField, {
						label: text('タグ'),
						value: postSettings.values.tags,
						onChange: function (value) { updatePostSettingValue('tags', value); },
						disabled: isImporting || !postSettings.enabled.tags
					})
				),
				renderPostSettingRow(
					'categories',
					text('カテゴリーを反映'),
					el(FormTokenField, {
						label: text('カテゴリー'),
						value: postSettings.values.categories,
						onChange: function (value) { updatePostSettingValue('categories', value); },
						disabled: isImporting || !postSettings.enabled.categories
					})
				),
				renderPostSettingRow(
					'featuredImage',
					text('アイキャッチ画像を反映'),
					el(
						Fragment,
						null,
						/^https?:\/\//i.test(featuredImageUrl) ? el('img', {
							className: 'kototsugi-post-setting__image',
							src: featuredImageUrl,
							alt: postSettings.values.featuredImageAlt || ''
						}) : null,
						el(TextControl, {
							label: text('画像URL'),
							value: featuredImageUrl,
							onChange: function (value) { updatePostSettingValue('featuredImage', value); },
							disabled: isImporting || !postSettings.enabled.featuredImage
						}),
						el(TextControl, {
							label: text('代替テキスト'),
							value: postSettings.values.featuredImageAlt,
							onChange: function (value) { updatePostSettingValue('featuredImageAlt', value); },
							disabled: isImporting || !postSettings.enabled.featuredImage
						})
					)
				),
				postSettings.unknownFields.length ? el(
					Notice,
					{ status: 'info', isDismissible: false, className: 'kototsugi-post-settings__notice' },
					text('未対応の項目は反映しません:') + ' ' + postSettings.unknownFields.join(', ')
				) : null
			);
		}

		function getInsertionModeLabel(mode) {
			if (mode === 'replace') {
				return text('本文を置き換え');
			}
			if (mode === 'draft') {
				return text('新規下書きを作成');
			}
			return text('カーソル位置へ追加');
		}

		function getPrimaryActionLabel() {
			if (insertionMode === 'replace') {
				return text('本文を置き換える');
			}
			if (insertionMode === 'draft') {
				return text('新規下書きを作成');
			}
			return postSettings.hasFrontMatter ? text('本文と設定を反映') : text('ブロックとして挿入');
		}

		function renderReviewIssue(issue) {
			var severityLabel = issue.severity === 'error' ? text('エラー') :
				(issue.severity === 'warning' ? text('警告') : text('情報'));

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
					'aria-label': issue.line + text('行目をMarkdownで編集')
				}, issue.line + text('行目'))
			);
		}

		function renderReview() {
			var infoCount = countPreflightIssues('info');
			var checkTitle = actionableIssueCount ? actionableIssueCount + text('件の確認事項') : text('修正が必要な問題はありません');
			var checkDetail = [];

			if (preflightErrorCount) {
				checkDetail.push(text('エラー') + ' ' + preflightErrorCount);
			}
			if (preflightWarningCount) {
				checkDetail.push(text('警告') + ' ' + preflightWarningCount);
			}
			if (infoCount) {
				checkDetail.push(text('情報') + ' ' + infoCount);
			}

			return el(
				'div',
				{ className: 'kototsugi-review' },
				el(
					'section',
					{ className: 'kototsugi-review__section', 'aria-labelledby': 'kototsugi-review-check-heading' },
					el(
						'div',
						{ className: 'kototsugi-review__heading' },
						el('h2', { id: 'kototsugi-review-check-heading' }, text('変換前チェック')),
						el(Button, { variant: 'tertiary', onClick: function () { setSourceView('markdown'); } }, text('Markdownへ戻る'))
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
					el('h2', { id: 'kototsugi-review-mode-heading' }, text('反映方法')),
					el(
						'div',
						{ className: 'kototsugi-review__mode', role: 'group', 'aria-label': text('Markdownの反映方法') },
						['cursor', 'replace', 'draft'].map(function (mode) {
							return el(Button, {
								key: mode,
								variant: insertionMode === mode ? 'secondary' : 'tertiary',
								'aria-pressed': insertionMode === mode,
								onClick: function () { chooseInsertionMode(mode); },
								disabled: isImporting
							}, getInsertionModeLabel(mode));
						})
					),
					insertionMode === 'replace' && currentBlockCount ? el(CheckboxControl, {
						className: 'kototsugi-review__replace-confirmation',
						label: currentBlockCount + text('件の既存ブロックを置き換えることを確認'),
						checked: replaceConfirmed,
						onChange: setReplaceConfirmed,
						disabled: isImporting
					}) : null
				),
				el(
					'section',
					{ className: 'kototsugi-review__section', 'aria-labelledby': 'kototsugi-review-options-heading' },
					el('h2', { id: 'kototsugi-review-options-heading' }, text('変換オプション')),
					!postSettings.hasFrontMatter ? el(CheckboxControl, {
						label: text('最初のH1を投稿タイトルにする'),
						checked: useFirstHeadingAsTitle,
						onChange: updateTitleSetting,
						disabled: isImporting
					}) : null,
					el(CheckboxControl, {
						label: text('外部画像をメディアライブラリに保存'),
						checked: importRemoteMedia,
						onChange: setImportRemoteMedia,
						disabled: isImporting || !remoteImages.length
					}),
					postSettings.hasFrontMatter &&
						((postSettings.enabled.tags && postSettings.values.tags.length) ||
						(postSettings.enabled.categories && postSettings.values.categories.length)) ? el(CheckboxControl, {
							label: text('未登録のカテゴリー・タグを作成'),
							checked: createMissingTerms,
							onChange: setCreateMissingTerms,
							disabled: isImporting
						}) : null
				),
				el(
					'section',
					{ className: 'kototsugi-review__section', 'aria-labelledby': 'kototsugi-review-save-heading' },
					el('h2', { id: 'kototsugi-review-save-heading' }, text('保存される内容')),
					el(
						'ul',
						{ className: 'kototsugi-review__effects' },
						el('li', null, insertionMode === 'draft' ? text('新規下書きをWordPressへ保存します。') : text('現在の投稿は自動保存されません。')),
						insertionMode === 'replace' && currentBlockCount ? el('li', null, currentBlockCount + text('件の既存ブロックをエディター上で置き換えます。')) : null,
						importRemoteMedia && remoteImages.length ? el('li', null, remoteImages.length + text('件の外部画像をメディアライブラリへ保存します。')) : null,
						createMissingTerms && postSettings.hasFrontMatter &&
							(postSettings.values.tags.length || postSettings.values.categories.length) ? el('li', null, text('未登録のカテゴリー・タグがある場合は新しく作成します。')) : null
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
						el('span', { className: 'kototsugi-workspace-modal__subtitle' }, text('Markdown投稿'))
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
							{ className: 'kototsugi-workspace__document', 'aria-label': text('現在のMarkdown原稿') },
							el('strong', null, fileName || text('Markdown原稿')),
							el('span', null, source.length.toLocaleString() + text('文字'))
						),
						el(
							'div',
							{ className: 'kototsugi-workspace__file-actions' },
							el(Button, {
								variant: 'secondary',
								'aria-label': text('Markdownファイルを選択'),
								onClick: chooseFile,
								disabled: isImporting
							}, text('ファイルを選択')),
							source ? el(Button, { variant: 'tertiary', onClick: clearSource, disabled: isImporting }, text('原稿をクリア')) : null
						)
					),
					el(
						'div',
						{
							className: 'kototsugi-workspace__tabs' +
								(postSettings.hasFrontMatter || sourceView === 'review' ? ' is-three-tabs' : '') +
								(postSettings.hasFrontMatter && sourceView === 'review' ? ' is-four-tabs' : ''),
							role: 'tablist',
							'aria-label': text('作業画面')
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
							}, text('投稿設定')) : null,
							sourceView === 'review' ? el(Button, {
								id: 'kototsugi-mobile-tab-review',
								variant: activePane === 'source' ? 'secondary' : 'tertiary',
								role: 'tab',
								'aria-selected': activePane === 'source',
								'aria-controls': 'kototsugi-panel-source',
								tabIndex: activePane === 'source' ? 0 : -1,
								onKeyDown: handleTabKeyDown,
								onClick: function () {
									setSourceView('review');
									setActivePane('source');
								}
							}, text('確認と調整')) : null,
							el(Button, {
							id: 'kototsugi-mobile-tab-preview',
							variant: activePane === 'preview' ? 'secondary' : 'tertiary',
							role: 'tab',
							'aria-selected': activePane === 'preview',
							'aria-controls': 'kototsugi-panel-preview',
							tabIndex: activePane === 'preview' ? 0 : -1,
							onKeyDown: handleTabKeyDown,
							onClick: function () { setActivePane('preview'); }
						}, text('プレビュー'))
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
								'aria-label': sourceView === 'settings' ? text('投稿設定') :
									(sourceView === 'review' ? text('確認と調整') : text('Markdown原稿')),
								onDragOver: handleDragOver,
								onDragLeave: handleDragLeave,
								onDrop: handleDrop
							},
							postSettings.hasFrontMatter || sourceView === 'review' || actionableIssueCount ? el(
								'div',
								{ className: 'kototsugi-workspace__source-tabs', role: 'tablist', 'aria-label': text('原稿、投稿設定、確認と調整') },
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
								}, text('投稿設定') + ' ' + detectedSettingCount) : null,
								sourceView === 'review' || actionableIssueCount ? el(Button, {
									id: 'kototsugi-desktop-tab-review',
									variant: sourceView === 'review' ? 'secondary' : 'tertiary',
									role: 'tab',
									'aria-selected': sourceView === 'review',
									'aria-controls': 'kototsugi-panel-source',
									tabIndex: sourceView === 'review' ? 0 : -1,
									onKeyDown: handleTabKeyDown,
									onClick: openReview
								}, actionableIssueCount ? text('確認と調整') + ' ' + actionableIssueCount : text('確認と調整')) : null
							) : el('h2', { className: 'kototsugi-workspace__pane-title' }, text('Markdown')),
							sourceView === 'settings' && postSettings.hasFrontMatter ? renderPostSettings() :
								sourceView === 'review' ? renderReview() : el(
								Fragment,
								null,
								el(TextareaControl, {
									className: 'kototsugi-workspace__textarea',
									label: text('Markdown原稿'),
									hideLabelFromVision: true,
									value: source,
									onChange: updateSource,
									disabled: isImporting,
									placeholder: '# 記事タイトル\n\nここへMarkdownを貼り付けるか、ファイルをドロップします。'
								}),
								isDragging ? el('div', { className: 'kototsugi-workspace__drop-overlay' }, text('ここにドロップ')) : null
							)
						),
						el(
							'section',
							{
								id: 'kototsugi-panel-preview',
								className: 'kototsugi-workspace__pane kototsugi-workspace__pane--preview' + (activePane === 'preview' ? ' is-active' : ''),
								role: 'tabpanel',
								'aria-label': text('プレビュー')
							},
							el('h2', { className: 'kototsugi-workspace__pane-title' }, text('プレビュー')),
							previewHtml ? el('div', {
								className: 'kototsugi-preview kototsugi-preview--workspace',
								dangerouslySetInnerHTML: { __html: previewHtml }
							}) : el('div', { className: 'kototsugi-preview__empty' }, text('プレビューする原稿がありません。'))
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
								text('Front Matter') + ' ' + detectedSettingCount + text('件')
								) : null,
								el(Button, {
									variant: 'tertiary',
									className: 'kototsugi-workspace__review-trigger' + (actionableIssueCount ? ' has-issues' : ''),
									onClick: openReview,
									disabled: isImporting
								}, actionableIssueCount ? text('確認事項') + ' ' + actionableIssueCount : text('確認と調整')),
								insertionMode !== 'cursor' ? el('span', { className: 'kototsugi-workspace__mode-summary' }, getInsertionModeLabel(insertionMode)) : null,
								importRemoteMedia && remoteImages.length ? el('span', { className: 'kototsugi-workspace__effect-summary' }, text('画像保存') + ' ' + remoteImages.length + text('件')) : null,
								createMissingTerms && postSettings.hasFrontMatter &&
									(postSettings.values.tags.length || postSettings.values.categories.length) ? el('span', { className: 'kototsugi-workspace__effect-summary' }, text('未登録の用語を作成')) : null,
								isImporting ? el(
								'span',
								{ className: 'kototsugi-workspace__progress', role: 'status', 'aria-live': 'polite' },
								imageProgress.total ? text('画像を取り込み中') + ' ' + imageProgress.current + ' / ' + imageProgress.total : text('投稿設定を反映中')
							) : null
						),
						el(
							'div',
							{ className: 'kototsugi-workspace__footer-actions' },
							el(Button, { variant: 'tertiary', onClick: function () { setWorkspaceOpen(false); }, disabled: isImporting }, text('閉じる')),
								el(Button, {
									variant: 'primary',
									onClick: importBlocks,
									disabled: !source.trim() || isImporting || preflightErrorCount > 0 ||
										(insertionMode === 'replace' && currentBlockCount > 0 && !replaceConfirmed),
									isBusy: isImporting
								}, isImporting ? text('取り込み中') : getPrimaryActionLabel())
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
					el('p', { className: 'kototsugi-sidebar__eyebrow' }, 'KOTOTSUGI'),
					el('h2', null, text('Markdown原稿'))
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
						'aria-label': text('Markdownファイルの読み込み'),
						onDragOver: handleDragOver,
						onDragLeave: handleDragLeave,
						onDrop: handleDrop
					},
					el('strong', null, text('Markdownファイル')),
					el('span', null, text('.md / .markdown / .txt、最大2MB')),
					el(Button, { variant: 'secondary', 'aria-label': text('Markdownファイルを選択'), onClick: chooseFile }, text('ファイルを選択')),
					!source ? el(Button, {
						variant: 'tertiary',
						className: 'kototsugi-dropzone__sample',
						onClick: loadSampleMarkdown,
						disabled: Boolean(helperAction),
						isBusy: helperAction === 'sample'
					}, helperAction === 'sample' ? text('セット中') : text('テスト用mdファイルをセット')) : null
				),
				source ? el(
					'div',
					{ className: 'kototsugi-sidebar__document' },
					el('strong', null, fileName || text('貼り付けた原稿')),
					el('span', null, source.length.toLocaleString() + text('文字'))
				) : null,
				el(Button, {
					variant: 'primary',
					className: 'kototsugi-sidebar__open',
					onClick: function () { setWorkspaceOpen(true); }
				}, text('作業画面を開く')),
				source ? el(Button, { variant: 'tertiary', onClick: clearSource }, text('原稿をクリア')) : null,
				el(Button, {
					variant: 'tertiary',
					className: 'kototsugi-sidebar__rules',
					onClick: copyAuthoringRules,
					disabled: Boolean(helperAction),
					isBusy: helperAction === 'rules'
				}, helperAction === 'rules' ? text('コピー中') : text('AI用ルールをコピー'))
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
