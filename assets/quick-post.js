(function (window, document, wp) {
	'use strict';

	var parser = window.KototsugiMarkdown;
	var config = window.kototsugiQuickPostConfig || {};
	var storageKey = config.storageKey || 'kototsugi-quick-post';
	var form = document.getElementById('kototsugi-quick-post-form');
	var logoutForm = document.getElementById('kototsugi-quick-logout-form');

	function text(value) {
		return wp && wp.i18n && wp.i18n.__ ? wp.i18n.__(value, 'kototsugi') : value;
	}

	function readStoredSource() {
		try {
			return window.localStorage.getItem(storageKey) || '';
		} catch (error) {
			return '';
		}
	}

	function readStoredTitle() {
		try {
			return window.localStorage.getItem(storageKey + '-title') || '';
		} catch (error) {
			return '';
		}
	}

	function storeSource(value) {
		try {
			if (value) {
				window.localStorage.setItem(storageKey, value);
			} else {
				window.localStorage.removeItem(storageKey);
			}
		} catch (error) {
			// Storage is optional. The submitted form still retains the source on errors.
		}
	}

	function storeTitle(value) {
		try {
			if (value) {
				window.localStorage.setItem(storageKey + '-title', value);
			} else {
				window.localStorage.removeItem(storageKey + '-title');
			}
		} catch (error) {
			// Storage is optional. The submitted form still retains the title on errors.
		}
	}

	function clearStoredDraft() {
		storeSource('');
		storeTitle('');
	}

	function createRequestId() {
		if (window.crypto && window.crypto.randomUUID) {
			return window.crypto.randomUUID();
		}

		return String(Date.now()) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
	}

	function blockComment(name, attributes, markup) {
		var settings = attributes && Object.keys(attributes).length ? ' ' + JSON.stringify(attributes) : '';

		return '<!-- wp:' + name + settings + ' -->\n' + markup + '\n<!-- /wp:' + name + ' -->';
	}

	function serializeParagraph(element) {
		return blockComment('paragraph', null, '<p>' + element.innerHTML + '</p>');
	}

	function serializeList(element) {
		var ordered = element.tagName.toLowerCase() === 'ol';
		var tag = ordered ? 'ol' : 'ul';
		var items = Array.from(element.children).filter(function (child) {
			return child.tagName && child.tagName.toLowerCase() === 'li';
		}).map(function (item) {
			return blockComment('list-item', null, '<li>' + item.innerHTML + '</li>');
		}).join('');

		return blockComment('list', ordered ? { ordered: true } : null, '<' + tag + ' class="wp-block-list">' + items + '</' + tag + '>');
	}

	function serializeQuote(element) {
		var children = Array.from(element.children).map(function (child) {
			return child.tagName && child.tagName.toLowerCase() === 'p' ? serializeParagraph(child) : '';
		}).join('');

		return blockComment('quote', null, '<blockquote class="wp-block-quote">' + children + '</blockquote>');
	}

	function serializeGroup(element) {
		var className = Array.from(element.classList).filter(function (name) {
			return name !== 'wp-block-group';
		}).join(' ');
		var children = Array.from(element.children).map(serializeElement).join('');
		var attributes = className ? { className: className } : null;

		return blockComment('group', attributes, '<div class="wp-block-group' + (className ? ' ' + className : '') + '">' + children + '</div>');
	}

	function serializeElement(element) {
		var tag = element.tagName ? element.tagName.toLowerCase() : '';
		var level;
		var attributes;
		var clone;

		if (tag === 'p') {
			return serializeParagraph(element);
		}
		if (/^h[1-6]$/.test(tag)) {
			level = Number(tag.slice(1));
			attributes = level === 2 ? null : { level: level };
			return blockComment('heading', attributes, '<' + tag + ' class="wp-block-heading">' + element.innerHTML + '</' + tag + '>');
		}
		if (tag === 'ul' || tag === 'ol') {
			return serializeList(element);
		}
		if (tag === 'blockquote') {
			return serializeQuote(element);
		}
		if (tag === 'pre') {
			return blockComment('code', null, element.outerHTML);
		}
		if (tag === 'figure' && element.classList.contains('wp-block-table')) {
			return blockComment('table', null, element.outerHTML);
		}
		if (tag === 'figure' && element.classList.contains('wp-block-image')) {
			return blockComment('image', null, element.outerHTML);
		}
		if (tag === 'hr') {
			clone = element.cloneNode(true);
			clone.className = 'wp-block-separator has-alpha-channel-opacity';
			return blockComment('separator', null, clone.outerHTML);
		}
		if (tag === 'div' && element.classList.contains('wp-block-group')) {
			return serializeGroup(element);
		}

		return '';
	}

	function serializeHtml(html) {
		var template = document.createElement('template');

		template.innerHTML = html;
		return Array.from(template.content.children).map(serializeElement).filter(Boolean).join('\n\n');
	}

	if (config.clearDraft) {
		clearStoredDraft();
	}

	if (logoutForm) {
		logoutForm.addEventListener('submit', clearStoredDraft);
	}

	if (!form || !parser || !wp) {
		return;
	}

	var sourceStep = document.getElementById('kototsugi-quick-source-step');
	var reviewStep = document.getElementById('kototsugi-quick-review-step');
	var source = document.getElementById('kototsugi-quick-source');
	var sourceError = document.getElementById('kototsugi-quick-source-error');
	var imageInput = document.getElementById('kototsugi-quick-images');
	var imageButton = document.getElementById('kototsugi-quick-image-button');
	var imageList = document.getElementById('kototsugi-quick-image-list');
	var reviewButton = document.getElementById('kototsugi-quick-review-button');
	var backButton = document.getElementById('kototsugi-quick-back-button');
	var title = document.getElementById('kototsugi-quick-title');
	var titleError = document.getElementById('kototsugi-quick-title-error');
	var preview = document.getElementById('kototsugi-quick-preview');
	var issues = document.getElementById('kototsugi-quick-issues');
	var issueList = document.getElementById('kototsugi-quick-issue-list');
	var warningConfirmation = document.getElementById('kototsugi-quick-warning-confirmation');
	var warningCheck = document.getElementById('kototsugi-quick-warning-check');
	var submitButton = document.getElementById('kototsugi-quick-submit-button');
	var content = document.getElementById('kototsugi-quick-content');
	var excerpt = document.getElementById('kototsugi-quick-excerpt');
	var slug = document.getElementById('kototsugi-quick-slug');
	var idempotency = document.getElementById('kototsugi-quick-idempotency');
	var maxImages = Number(config.maxImages || 5);
	var maxImageBytes = Number(config.maxImageBytes || 10 * 1024 * 1024);
	var selectedImages = [];
	var warningCount = 0;

	function setFieldError(element, message) {
		element.textContent = message || '';
		element.hidden = !message;
	}

	function updateSubmitState() {
		var hasTitle = Boolean(title.value.trim());
		var warningsAccepted = !warningCount || warningCheck.checked;

		setFieldError(titleError, hasTitle ? '' : text('Enter a post title.'));
		submitButton.disabled = !hasTitle || !warningsAccepted || !content.value;
	}

	function renderIssues(foundIssues) {
		warningCount = 0;
		issueList.textContent = '';

		foundIssues.forEach(function (issue) {
			var item = document.createElement('li');
			var line = document.createElement('span');

			item.className = 'kototsugi-quick-issue kototsugi-quick-issue--' + issue.severity;
			line.className = 'kototsugi-quick-issue__line';
			line.textContent = text('Line') + ' ' + issue.line;
			item.appendChild(line);
			item.appendChild(document.createTextNode(issue.message));
			issueList.appendChild(item);
			if (issue.severity === 'warning' || issue.severity === 'error') {
				warningCount += 1;
			}
		});

		issues.hidden = !foundIssues.length;
		warningConfirmation.hidden = !warningCount;
		warningCheck.checked = false;
	}

	function imageAltFromName(name) {
		return String(name || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
	}

	function imageKey(file) {
		return [file.name, file.size, file.lastModified].join(':');
	}

	function syncImageInput() {
		var transfer;

		if (!window.DataTransfer) {
			return;
		}

		transfer = new window.DataTransfer();
		selectedImages.forEach(function (entry) {
			transfer.items.add(entry.file);
		});
		imageInput.files = transfer.files;
	}

	function removeImage(index) {
		var removed = selectedImages.splice(index, 1)[0];

		if (removed && removed.url) {
			window.URL.revokeObjectURL(removed.url);
		}
		syncImageInput();
		renderImageList();
	}

	function renderImageList() {
		imageList.textContent = '';
		imageList.hidden = !selectedImages.length;

		selectedImages.forEach(function (entry, index) {
			var item = document.createElement('div');
			var thumbnail = document.createElement('img');
			var details = document.createElement('div');
			var name = document.createElement('p');
			var label = document.createElement('label');
			var alt = document.createElement('input');
			var remove = document.createElement('button');
			var removeIcon = document.createElement('span');

			item.className = 'kototsugi-quick-image-item';
			thumbnail.className = 'kototsugi-quick-image-item__thumbnail';
			thumbnail.src = entry.url;
			thumbnail.alt = '';
			details.className = 'kototsugi-quick-image-item__details';
			name.className = 'kototsugi-quick-image-item__name';
			name.textContent = entry.file.name;
			label.className = 'kototsugi-quick-image-item__label';
			label.textContent = text('Alternative text');
			alt.type = 'text';
			alt.name = 'quick_post_image_alt[]';
			alt.value = entry.alt;
			alt.maxLength = 300;
			alt.addEventListener('input', function () {
				entry.alt = alt.value;
			});
			remove.className = 'kototsugi-quick-icon-button kototsugi-quick-image-item__remove';
			remove.type = 'button';
			remove.setAttribute('aria-label', text('Remove image'));
			remove.setAttribute('title', text('Remove image'));
			remove.addEventListener('click', function () {
				removeImage(index);
			});
			removeIcon.className = 'dashicons dashicons-no-alt';
			removeIcon.setAttribute('aria-hidden', 'true');

			label.appendChild(alt);
			details.appendChild(name);
			details.appendChild(label);
			remove.appendChild(removeIcon);
			item.appendChild(thumbnail);
			item.appendChild(details);
			item.appendChild(remove);
			imageList.appendChild(item);
		});
	}

	function appendImagePreviews() {
		selectedImages.forEach(function (entry) {
			var figure = document.createElement('figure');
			var image = document.createElement('img');

			figure.className = 'wp-block-image kototsugi-quick-preview__attachment';
			image.src = entry.url;
			image.alt = entry.alt;
			figure.appendChild(image);
			preview.appendChild(figure);
		});
	}

	function addImages(files) {
		var existing = Object.create(null);
		var incoming = Array.from(files || []);
		var totalBytes = selectedImages.reduce(function (total, entry) {
			return total + Number(entry.file.size || 0);
		}, 0);
		var error = '';

		selectedImages.forEach(function (entry) {
			existing[imageKey(entry.file)] = true;
		});

		incoming.forEach(function (file) {
			var validType = /^image\/(jpeg|png|gif|webp)$/i.test(file.type || '') || /\.(jpe?g|png|gif|webp)$/i.test(file.name || '');
			var key = imageKey(file);

			if (existing[key]) {
				return;
			}
			if (!validType || Number(file.size || 0) < 1 || Number(file.size || 0) > maxImageBytes || totalBytes + Number(file.size || 0) > maxImageBytes) {
				error = text('Use JPEG, PNG, GIF, or WebP images within the site upload limit.');
				return;
			}
			if (selectedImages.length >= maxImages) {
				error = text('Attach up to 5 images.');
				return;
			}

			totalBytes += Number(file.size || 0);
			existing[key] = true;
			selectedImages.push({
				alt: imageAltFromName(file.name),
				file: file,
				url: window.URL.createObjectURL(file)
			});
		});

		syncImageInput();
		renderImageList();
		setFieldError(sourceError, error);
	}

	function prepareReview() {
		var value = source.value.trim();
		var prepared;
		var documentSettings;
		var html;
		var serialized;
		var foundIssues;
		var documentTitle;

		if (!value) {
			setFieldError(sourceError, text('Paste an article draft before continuing.'));
			source.focus();
			return false;
		}
		if (new window.Blob([source.value]).size > 2 * 1024 * 1024) {
			setFieldError(sourceError, text('Use an article draft up to 2 MB.'));
			source.focus();
			return false;
		}

		setFieldError(sourceError, '');
		prepared = parser.prepareSimpleText(source.value, title.value, config.labels || {});
		if (prepared.cleanedInput) {
			source.value = prepared.displaySource;
			storeSource(source.value);
		}
		if (!title.value.trim() || title.dataset.autofilled === 'true') {
			title.value = prepared.title;
			title.dataset.autofilled = 'true';
			storeTitle(title.value);
		}
		if (!title.value.trim()) {
			setFieldError(titleError, text('Enter a post title.'));
			title.focus();
			return false;
		}

		documentTitle = parser.findTitle(prepared.source);
		html = parser.markdownToHtml(prepared.source, Boolean(documentTitle));
		serialized = serializeHtml(html);
		if (!serialized) {
			setFieldError(sourceError, text('The article could not be converted into WordPress blocks.'));
			return false;
		}

		documentSettings = parser.createPostSettings(prepared.source);
		foundIssues = parser.analyzeMarkdown(prepared.source, { applyTitle: Boolean(documentTitle) }).filter(function (issue) {
			return issue.code !== 'heading_used_as_title' &&
				issue.code !== 'duplicate_document_title' &&
				issue.code !== 'unsupported_front_matter_status' &&
				issue.code !== 'unsupported_front_matter_author';
		});
		content.value = serialized;
		excerpt.value = documentSettings.values.excerpt || '';
		slug.value = documentSettings.values.slug || '';
		idempotency.value = createRequestId();
		preview.textContent = '';
		var previewTitle = document.createElement('h1');
		var previewBody = document.createElement('div');
		previewTitle.className = 'kototsugi-quick-preview__title';
		previewTitle.textContent = title.value.trim();
		previewBody.innerHTML = html;
		preview.appendChild(previewTitle);
		Array.from(previewBody.children).forEach(function (child) {
			preview.appendChild(child);
		});
		appendImagePreviews();
		renderIssues(foundIssues);
		updateSubmitState();

		sourceStep.hidden = true;
		reviewStep.hidden = false;
		window.scrollTo({ top: 0, behavior: 'smooth' });
		reviewStep.focus();
		return true;
	}

	function editSource() {
		reviewStep.hidden = true;
		sourceStep.hidden = false;
		window.scrollTo({ top: 0, behavior: 'smooth' });
		source.focus();
	}

	if (!source.value) {
		source.value = readStoredSource();
	}
	if (!title.value) {
		title.value = readStoredTitle();
	}

	source.addEventListener('input', function () {
		storeSource(source.value);
		setFieldError(sourceError, '');
	});
	imageButton.addEventListener('click', function () {
		imageInput.click();
	});
	imageInput.addEventListener('change', function () {
		addImages(imageInput.files);
	});
	reviewButton.addEventListener('click', prepareReview);
	backButton.addEventListener('click', editSource);
	title.addEventListener('input', function () {
		title.dataset.autofilled = 'false';
		storeTitle(title.value);
		updateSubmitState();
	});
	warningCheck.addEventListener('change', updateSubmitState);
	form.addEventListener('submit', function (event) {
		if (reviewStep.hidden || !title.value.trim() || !content.value || (warningCount && !warningCheck.checked)) {
			event.preventDefault();
			if (reviewStep.hidden) {
				prepareReview();
			} else {
				updateSubmitState();
			}
			return;
		}

		submitButton.disabled = true;
		submitButton.classList.add('is-busy');
		submitButton.textContent = form.dataset.status === 'publish' ? text('Publishing...') : text('Saving...');
	});
}(window, document, window.wp));
