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
	var Modal = wp.components.Modal;
	var Notice = wp.components.Notice;
	var TextareaControl = wp.components.TextareaControl;
	var editorPackage = wp.editor && wp.editor.PluginSidebar ? wp.editor : wp.editPost;
	var PluginSidebar = editorPackage.PluginSidebar;
	var PluginSidebarMoreMenuItem = editorPackage.PluginSidebarMoreMenuItem;
	var registerPlugin = wp.plugins.registerPlugin;
	var MAX_FILE_SIZE = 2 * 1024 * 1024;

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

	function parseFrontMatter(source) {
		var normalized = String(source || '').replace(/\r\n?/g, '\n');
		var match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
		var result = { content: normalized, title: '' };

		if (!match) {
			return result;
		}

		match[1].split('\n').some(function (line) {
			var titleMatch = line.match(/^title\s*:\s*(.+?)\s*$/i);
			var value;

			if (!titleMatch) {
				return false;
			}

			value = titleMatch[1].trim();
			if ((value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') ||
				(value.charAt(0) === "'" && value.charAt(value.length - 1) === "'")) {
				value = value.slice(1, -1);
			}
			result.title = plainText(value);
			return true;
		});

		result.content = normalized.slice(match[0].length);
		return result;
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
		var mediaState = useState(true);
		var importRemoteMedia = mediaState[0];
		var setImportRemoteMedia = mediaState[1];
		var importingState = useState(false);
		var isImporting = importingState[0];
		var setIsImporting = importingState[1];
		var progressState = useState({ current: 0, total: 0 });
		var imageProgress = progressState[0];
		var setImageProgress = progressState[1];
		var fileInputRef = useRef(null);
		var previewHtml = source.trim() ? markdownToHtml(source, useFirstHeadingAsTitle) : '';
		var remoteImages = extractRemoteImages(source);

		function updateSource(value) {
			setSource(value);
		}

		function updateTitleSetting(value) {
			setUseFirstHeadingAsTitle(value);
		}

		function clearSource() {
			setSource('');
			setFileName('');
			setNotice(null);
			setActivePane('source');
		}

		function chooseFile() {
			if (fileInputRef.current) {
				fileInputRef.current.click();
			}
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

				setSource(contents);
				setFileName(file.name);
				setNotice({ status: 'success', message: text('Markdownファイルを読み込みました。') });
				setActivePane('source');
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

		function importRemoteImages(images) {
			var imageMap = Object.create(null);
			var importedCount = 0;
			var failedCount = 0;
			var postSelector = wp.data.select('core/editor');
			var postId = postSelector && postSelector.getCurrentPostId ? postSelector.getCurrentPostId() : 0;

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

		function finishBlockImport(imageResult) {
			var html = markdownToHtml(source, useFirstHeadingAsTitle, imageResult.imageMap);
			var blocks = htmlToBlocks(html);
			var title = useFirstHeadingAsTitle ? findTitle(source) : '';
			var message;
			var status = imageResult.failedCount ? 'warning' : 'success';

			if (!blocks.length) {
				setNotice({ status: 'error', message: text('Markdownを入力してください。') });
				return;
			}

			wp.data.dispatch('core/block-editor').insertBlocks(blocks);
			if (title) {
				wp.data.dispatch('core/editor').editPost({ title: title });
			}
			if (imageResult.failedCount) {
				message = imageResult.importedCount ?
					imageResult.importedCount + text('件の画像を保存しました。') + imageResult.failedCount + text('件は外部URLのまま挿入しました。') :
					imageResult.failedCount + text('件の画像を保存できなかったため、外部URLのまま挿入しました。');
			} else if (imageResult.importedCount) {
				message = imageResult.importedCount + text('件の画像をメディアライブラリに保存し、ブロックを挿入しました。');
			} else {
				message = title ? text('ブロックを挿入し、最初の見出しを投稿タイトルに設定しました。') : text('ブロックを現在のカーソル位置に挿入しました。');
			}

			setNotice({ status: status, message: message });
			setWorkspaceOpen(false);
		}

		function importBlocks() {
			var initialBlocks;
			var images = importRemoteMedia ? remoteImages : [];

			if (!source.trim()) {
				setNotice({ status: 'error', message: text('Markdownを入力してください。') });
				return;
			}

			initialBlocks = htmlToBlocks(markdownToHtml(source, useFirstHeadingAsTitle));
			if (!initialBlocks.length) {
				setNotice({ status: 'error', message: text('Markdownをブロックへ変換できませんでした。') });
				return;
			}

			if (!images.length) {
				finishBlockImport({ imageMap: Object.create(null), importedCount: 0, failedCount: 0 });
				return;
			}

			setIsImporting(true);
			setImageProgress({ current: 0, total: images.length });
			importRemoteImages(images).then(function (result) {
				finishBlockImport(result);
			}).catch(function () {
				setNotice({ status: 'error', message: text('画像の取り込み処理を完了できませんでした。') });
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
				accept: '.md,.markdown,.txt,text/markdown,text/plain',
				onChange: handleFileChange
			});
		}

		function renderWorkspace() {
			return el(
				Modal,
				{
					title: 'KOTOTSUGI',
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
							{ className: 'kototsugi-workspace__document' },
							el('strong', null, fileName || text('Markdown原稿')),
							el('span', null, source.length.toLocaleString() + text('文字'))
						),
						el(
							'div',
							{ className: 'kototsugi-workspace__file-actions' },
							el(Button, { variant: 'secondary', onClick: chooseFile, disabled: isImporting }, text('ファイルを選択')),
							source ? el(Button, { variant: 'tertiary', onClick: clearSource, disabled: isImporting }, text('クリア')) : null
						)
					),
					el(
						'div',
						{ className: 'kototsugi-workspace__tabs', role: 'tablist', 'aria-label': text('作業画面') },
						el(Button, {
							variant: activePane === 'source' ? 'secondary' : 'tertiary',
							role: 'tab',
							'aria-selected': activePane === 'source',
							onClick: function () { setActivePane('source'); }
						}, text('Markdown')),
						el(Button, {
							variant: activePane === 'preview' ? 'secondary' : 'tertiary',
							role: 'tab',
							'aria-selected': activePane === 'preview',
							onClick: function () { setActivePane('preview'); }
						}, text('プレビュー'))
					),
					el(
						'div',
						{ className: 'kototsugi-workspace__body' },
						el(
							'section',
							{
								className: 'kototsugi-workspace__pane kototsugi-workspace__pane--source' + (activePane === 'source' ? ' is-active' : '') + (isDragging ? ' is-dragging' : ''),
								onDragOver: handleDragOver,
								onDragLeave: handleDragLeave,
								onDrop: handleDrop
							},
							el('h2', { className: 'kototsugi-workspace__pane-title' }, text('Markdown')),
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
						),
						el(
							'section',
							{ className: 'kototsugi-workspace__pane kototsugi-workspace__pane--preview' + (activePane === 'preview' ? ' is-active' : '') },
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
							el(CheckboxControl, {
								label: text('最初のH1またはFront Matterのtitleを投稿タイトルにする'),
								checked: useFirstHeadingAsTitle,
								onChange: updateTitleSetting,
								disabled: isImporting
							}),
							el(CheckboxControl, {
								label: text('外部画像をメディアライブラリに保存'),
								checked: importRemoteMedia,
								onChange: setImportRemoteMedia,
								disabled: isImporting || !remoteImages.length
							}),
							isImporting ? el(
								'span',
								{ className: 'kototsugi-workspace__progress', role: 'status' },
								text('画像を取り込み中') + ' ' + imageProgress.current + ' / ' + imageProgress.total
							) : null
						),
						el(
							'div',
							{ className: 'kototsugi-workspace__footer-actions' },
							el(Button, { variant: 'tertiary', onClick: function () { setWorkspaceOpen(false); }, disabled: isImporting }, text('閉じる')),
							el(Button, {
								variant: 'primary',
								onClick: importBlocks,
								disabled: !source.trim() || isImporting,
								isBusy: isImporting
							}, isImporting ? text('画像を取り込み中') : text('ブロックとして挿入'))
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
						onDragOver: handleDragOver,
						onDragLeave: handleDragLeave,
						onDrop: handleDrop
					},
					el('strong', null, text('Markdownファイル')),
					el('span', null, text('.md / .markdown / .txt、最大2MB')),
					el(Button, { variant: 'secondary', onClick: chooseFile }, text('ファイルを選択'))
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
				source ? el(Button, { variant: 'tertiary', onClick: clearSource }, text('原稿をクリア')) : null
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
