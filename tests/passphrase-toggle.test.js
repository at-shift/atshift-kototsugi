'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'includes', 'quick-post.php'), 'utf8');

assert.match(template, /<input id="kototsugi-quick-post-password"[^>]*type="password"/);
assert.match(template, /<input id="kototsugi-quick-passphrase"[^>]*type="password"/);

function classList() {
	const values = new Set();
	return {
		add: function (name) { values.add(name); },
		remove: function (name) { values.delete(name); },
		contains: function (name) { return values.has(name); },
		toggle: function (name, enabled) { if (enabled) { values.add(name); } else { values.delete(name); } }
	};
}

function initialize(computedColor) {
	const wrapper = { classList: classList(), dataset: {} };
	const listeners = {};
	const field = {
		type: 'password', value: '日本語', classList: classList(),
		closest: function () { return wrapper; },
		addEventListener: function (name, handler) { listeners[name] = handler; }
	};
	const label = { textContent: '' };
	const attributes = {};
	const button = {
		dataset: { showLabel: 'Show passphrase', hideLabel: 'Hide passphrase' },
		getAttribute: function () { return 'kototsugi-quick-passphrase'; },
		setAttribute: function (name, value) { attributes[name] = value; },
		querySelector: function (selector) { return selector === '.dashicons' ? { classList: classList() } : label; }
	};
	let onClick;
	const document = {
		querySelectorAll: function () { return [field]; },
		addEventListener: function (name, handler) {
			assert.equal(name, 'click');
			onClick = handler;
		},
		getElementById: function () { return field; }
	};
	const window = computedColor ? { getComputedStyle: function () { return { color: computedColor }; } } : {};

	vm.runInNewContext(fs.readFileSync(path.join(root, 'assets', 'passphrase-toggle.js'), 'utf8'), {
		window: window, document: document
	});

	return {
		field: field, wrapper: wrapper, listeners: listeners, label: label, attributes: attributes,
		click: function () { onClick({ target: { closest: function () { return button; } } }); }
	};
}

const fallback = initialize();
assert.equal(fallback.field.type, 'password');
fallback.click();
assert.equal(fallback.field.type, 'text');
fallback.click();
assert.equal(fallback.field.type, 'password');

const enhanced = initialize('rgba(0, 0, 0, 0)');
assert.equal(enhanced.field.type, 'text');
assert.equal(enhanced.field.classList.contains('is-masked'), true);
assert.equal(enhanced.wrapper.dataset.mask, '•••');
enhanced.click();
assert.equal(enhanced.wrapper.dataset.mask, '');
assert.equal(enhanced.attributes['aria-pressed'], 'true');
assert.equal(enhanced.label.textContent, 'Hide passphrase');
enhanced.click();
assert.equal(enhanced.wrapper.dataset.mask, '•••');
assert.equal(enhanced.attributes['aria-pressed'], 'false');
assert.equal(enhanced.label.textContent, 'Show passphrase');
enhanced.listeners.compositionstart();
assert.equal(enhanced.wrapper.classList.contains('is-composing'), true);
enhanced.listeners.compositionend();
assert.equal(enhanced.wrapper.classList.contains('is-composing'), false);

console.log('KOTOTSUGI passphrase toggle: all tests passed.');
