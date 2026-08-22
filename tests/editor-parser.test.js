'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const editorPath = path.join(__dirname, '..', 'assets', 'editor.js');
const marker = "\n\tregisterPlugin('kototsugi', {";
let source = fs.readFileSync(editorPath, 'utf8');

assert.ok(source.includes(marker), 'Could not find the KOTOTSUGI test injection point.');

source = source.replace(
	marker,
	"\n\twindow.__kototsugiTestApi = { markdownToHtml: markdownToHtml, findTitle: findTitle, parseFrontMatter: parseFrontMatter, isSupportedMarkdownFile: isSupportedMarkdownFile, extractRemoteImages: extractRemoteImages };" + marker
);

function noop() {
	return null;
}

const wp = {
	apiFetch: noop,
	blocks: { rawHandler: noop },
	components: {
		Button: noop,
		CheckboxControl: noop,
		Modal: noop,
		Notice: noop,
		TextareaControl: noop
	},
	data: { dispatch: noop },
	editPost: { PluginSidebar: noop, PluginSidebarMoreMenuItem: noop },
	editor: { PluginSidebar: noop, PluginSidebarMoreMenuItem: noop },
	element: { createElement: noop, Fragment: noop, useRef: noop, useState: noop },
	i18n: { __: function (value) { return value; } },
	plugins: { registerPlugin: noop }
};
const context = vm.createContext({ console: console, window: { wp: wp } });

vm.runInContext(source, context, { filename: editorPath });

const parser = context.window.__kototsugiTestApi;

assert.ok(parser, 'KOTOTSUGI parser was not exposed to the test runtime.');

const fullMarkdown = [
	'# 公開タイトル',
	'',
	'## 概要',
	'',
	'本文の **重要な箇所** と [公式サイト](https://example.com/) です。',
	'',
	'- 項目1',
	'- 項目2',
	'',
	'| 名前 | 値 |',
	'| --- | --- |',
	'| A | 1 |',
	'',
	'> [!NOTE]',
	'> 補足情報です。',
	'',
	'> 通常の引用です。',
	'',
	'```js',
	'const answer = 42;',
	'```',
	'',
	'![代替テキスト](https://example.com/image.jpg)'
].join('\n');
const fullHtml = parser.markdownToHtml(fullMarkdown, true);

assert.equal(parser.findTitle(fullMarkdown), '公開タイトル');
assert.ok(!fullHtml.includes('<h1>'), 'The title H1 should be removed from body content.');
assert.ok(fullHtml.includes('<h2>概要</h2>'));
assert.ok(fullHtml.includes('<strong>重要な箇所</strong>'));
assert.ok(fullHtml.includes('<a href="https://example.com/">公式サイト</a>'));
assert.ok(fullHtml.includes('<ul><li>項目1</li><li>項目2</li></ul>'));
assert.ok(fullHtml.includes('<table>'));
assert.ok(fullHtml.includes('<th>名前</th>'));
assert.ok(fullHtml.includes('kototsugi-callout--note'));
assert.ok(fullHtml.includes('<blockquote><p>通常の引用です。</p></blockquote>'));
assert.ok(fullHtml.includes('class="language-js"'));
assert.ok(fullHtml.includes('const answer = 42;'));
assert.ok(fullHtml.includes('<img src="https://example.com/image.jpg" alt="代替テキスト">'));

const retainedHeading = parser.markdownToHtml('# 本文見出し', false);
assert.ok(retainedHeading.includes('<h1>本文見出し</h1>'));

const unsafeHtml = parser.markdownToHtml([
	'<script>alert("xss")</script>',
	'',
	'[危険なリンク](javascript:alert(1))',
	'',
	'![危険な画像](javascript:alert(1))'
].join('\n'), true);

assert.ok(unsafeHtml.includes('&lt;script&gt;'));
assert.ok(!unsafeHtml.includes('<script>'));
assert.ok(!unsafeHtml.includes('href="javascript:'));
assert.ok(!unsafeHtml.includes('src="javascript:'));

const frontMatterMarkdown = [
	'---',
	'title: "Front Matterのタイトル"',
	'description: テスト原稿',
	'---',
	'',
	'## 本文見出し',
	'',
	'本文です。'
].join('\n');
const frontMatter = parser.parseFrontMatter(frontMatterMarkdown);

assert.equal(frontMatter.title, 'Front Matterのタイトル');
assert.ok(!frontMatter.content.includes('description:'));
assert.equal(parser.findTitle(frontMatterMarkdown), 'Front Matterのタイトル');
assert.ok(!parser.markdownToHtml(frontMatterMarkdown, true).includes('<hr>'));
assert.ok(parser.markdownToHtml(frontMatterMarkdown, true).includes('<h2>本文見出し</h2>'));

assert.equal(parser.isSupportedMarkdownFile({ name: 'draft.md', size: 1024 }), true);
assert.equal(parser.isSupportedMarkdownFile({ name: 'draft.MARKDOWN', size: 1024 }), true);
assert.equal(parser.isSupportedMarkdownFile({ name: 'draft.txt', size: 1024 }), true);
assert.equal(parser.isSupportedMarkdownFile({ name: 'draft.pdf', size: 1024 }), false);
assert.equal(parser.isSupportedMarkdownFile({ name: 'large.md', size: (2 * 1024 * 1024) + 1 }), false);

const remoteImages = JSON.parse(JSON.stringify(parser.extractRemoteImages([
	'![最初](https://cdn.example.com/photo.jpg)',
	'![重複](https://cdn.example.com/photo.jpg)',
	'![相対](images/local.png)',
	'![二枚目](http://images.example.com/second.webp)'
].join('\n'))));

assert.deepEqual(remoteImages, [
	{ url: 'https://cdn.example.com/photo.jpg', alt: '最初' },
	{ url: 'http://images.example.com/second.webp', alt: '二枚目' }
]);

const importedImageHtml = parser.markdownToHtml(
	'![保存画像](https://cdn.example.com/photo.jpg)',
	false,
	{
		'https://cdn.example.com/photo.jpg': {
			id: 42,
			url: 'https://wordpress.example.com/uploads/photo.jpg'
		}
	}
);

assert.ok(importedImageHtml.includes('src="https://wordpress.example.com/uploads/photo.jpg"'));
assert.ok(importedImageHtml.includes('class="wp-image-42"'));
assert.ok(importedImageHtml.includes('alt="保存画像"'));

console.log('KOTOTSUGI editor parser: all tests passed.');
