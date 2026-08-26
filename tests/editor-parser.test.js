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
	"\n\twindow.__kototsugiTestApi = { markdownToHtml: markdownToHtml, findTitle: findTitle, parseFrontMatter: parseFrontMatter, createPostSettings: createPostSettings, analyzeMarkdown: analyzeMarkdown, isSupportedMarkdownFile: isSupportedMarkdownFile, extractRemoteImages: extractRemoteImages, prepareSimpleText: prepareSimpleText };" + marker
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
		FormTokenField: noop,
		Modal: noop,
		Notice: noop,
		TextControl: noop,
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

const simpleDraft = parser.prepareSimpleText([
	'status: draft',
	'author: editor',
	'',
	'夏のお知らせ',
	'',
	'営業時間を変更します。',
	'',
	'持ち物',
	'',
	'・財布',
	'・鍵'
].join('\n'), '');

assert.equal(simpleDraft.title, '夏のお知らせ');
assert.equal(simpleDraft.cleanedMetadata, true);
assert.equal(simpleDraft.displaySource.indexOf('夏のお知らせ'), -1);
assert.ok(!simpleDraft.displaySource.includes('status:'));
assert.ok(!simpleDraft.source.includes('status:'));
assert.ok(!simpleDraft.source.includes('author:'));
assert.ok(simpleDraft.source.includes('営業時間を変更します。'));
assert.ok(simpleDraft.source.includes('## 持ち物'));
assert.ok(simpleDraft.source.includes('- 財布\n- 鍵'));
assert.ok(parser.markdownToHtml(simpleDraft.source, false).includes('<h2>持ち物</h2>'));
assert.ok(parser.markdownToHtml(simpleDraft.source, false).includes('<ul><li>財布</li><li>鍵</li></ul>'));

const looseTitleDraft = parser.prepareSimpleText('title: 店舗のお知らせ\nstatus: publish\n\n本文です。', '');
assert.equal(looseTitleDraft.title, '店舗のお知らせ');
assert.equal(looseTitleDraft.source, '本文です。');

const frontMatterSimpleDraft = parser.prepareSimpleText([
	'---',
	'title: Front Matterタイトル',
	'status: draft',
	'author: editor',
	'---',
	'',
	'本文です。'
].join('\n'), '');
assert.equal(frontMatterSimpleDraft.title, 'Front Matterタイトル');
assert.equal(frontMatterSimpleDraft.displaySource, '本文です。');
assert.equal(frontMatterSimpleDraft.source, '本文です。');

const frontMatterDuplicateTitle = parser.prepareSimpleText([
	'---',
	'title: 重複しないタイトル',
	'---',
	'',
	'重複しないタイトル',
	'',
	'本文です。'
].join('\n'), '');
assert.equal(frontMatterDuplicateTitle.title, '重複しないタイトル');
assert.equal(frontMatterDuplicateTitle.source, '本文です。');

const normalSentenceDraft = parser.prepareSimpleText('今日は晴れです。\n\n散歩に出かけました。', '入力したタイトル');
assert.equal(normalSentenceDraft.title, '入力したタイトル');
assert.ok(!normalSentenceDraft.source.includes('##'));

const notationDraft = parser.prepareSimpleText([
	'@ 京都駅',
	'! 予約が必要です',
	'※ 雨天中止です',
	'¥ 1,000円',
	'☎ 075-000-0000'
].join('\n'), '店舗案内', { place: '場所', price: '料金', phone: '電話' });
const notationHtml = parser.markdownToHtml(notationDraft.source, false);
assert.ok(notationDraft.source.includes('**場所:** [京都駅](https://www.google.com/maps/search/?api=1&query='));
assert.ok(notationDraft.source.includes('> [!IMPORTANT]'));
assert.ok(notationDraft.source.includes('> [!NOTE]'));
assert.ok(notationDraft.source.includes('**料金:** ¥ 1,000円'));
assert.ok(notationDraft.source.includes('**電話:** [075-000-0000](tel:0750000000)'));
assert.ok(notationHtml.includes('kototsugi-callout--important'));
assert.ok(notationHtml.includes('kototsugi-callout--note'));
assert.ok(notationHtml.includes('href="tel:0750000000"'));

const naturalNotationDraft = parser.prepareSimpleText('場所：京都駅\n料金：無料\n電話：075-000-0000', '店舗案内');
assert.ok(naturalNotationDraft.source.includes('**Place:**'));
assert.ok(naturalNotationDraft.source.includes('**Price:**'));
assert.ok(naturalNotationDraft.source.includes('**Phone:**'));

const multilingualNotationCases = [
	['Location: London', '**Place:**'],
	['補足：雨天中止', '[!NOTE]'],
	['Ubicación: Madrid', '**Place:**'],
	['Hinweis: Bitte reservieren', '[!NOTE]'],
	['Téléphone : +33 1 23 45 67 89', '**Phone:**'],
	['Preço: R$ 25', '**Price:** R$ 25'],
	['Importante: Prenotazione richiesta', '[!IMPORTANT]'],
	['Место: Москва', '**Place:**'],
	['Opmerking: Neem een jas mee', '[!NOTE]'],
	['价格：20元', '**Price:** 20元'],
	['Telefon: +48 12 345 67 89', '**Phone:**'],
	['Önemli: Rezervasyon gerekli', '[!IMPORTANT]'],
	['Lokasi: Jakarta', '**Place:**'],
	['備註：請提前到場', '[!NOTE]'],
	['전화: 02-1234-5678', '**Phone:**']
];

multilingualNotationCases.forEach(function (testCase) {
	const draft = parser.prepareSimpleText(testCase[0], 'Localized notation');
	assert.ok(draft.source.includes(testCase[1]), 'Expected localized notation to be recognized: ' + testCase[0]);
});

[
	'$10', '10 USD', '¥1,000', '1,000円', '10 €', 'R$ 25', '10 ₽', '€ 10',
	'10 zł', '10 ₺', 'Rp10.000', 'NT$10', '₩10', '10원', '10元'
].forEach(function (price) {
	const draft = parser.prepareSimpleText(price, 'Currency notation');
	assert.ok(draft.source.includes('**Price:** ' + price), 'Expected currency order to be preserved: ' + price);
});

[
	[{ before: '', after: '円', space: false }, '1000円'],
	[{ before: '$', after: '', space: false }, '$1000'],
	[{ before: '', after: '€', space: true }, '1000 €'],
	[{ before: 'R$', after: '', space: true }, 'R$ 1000'],
	[{ before: '', after: '₽', space: true }, '1000 ₽'],
	[{ before: '€', after: '', space: true }, '€ 1000'],
	[{ before: '', after: '元', space: false }, '1000元'],
	[{ before: '', after: 'zł', space: true }, '1000 zł'],
	[{ before: '', after: '₺', space: true }, '1000 ₺'],
	[{ before: 'Rp', after: '', space: false }, 'Rp1000'],
	[{ before: 'NT$', after: '', space: false }, 'NT$1000'],
	[{ before: '₩', after: '', space: false }, '₩1000']
].forEach(function (testCase) {
	const draft = parser.prepareSimpleText('$ 1000', 'Locale currency shortcut', {
		currency: testCase[0],
		price: 'Price'
	});
	assert.ok(draft.source.includes('**Price:** ' + testCase[1]), 'Expected the locale currency position: ' + testCase[1]);
});

const explicitDollarDraft = parser.prepareSimpleText('$10', 'Explicit US dollar', {
	currency: { before: '', after: '円', space: false },
	price: '料金'
});
assert.ok(explicitDollarDraft.source.includes('**料金:** $10'));

const nonNumericPriceDraft = parser.prepareSimpleText('$ Free for children', 'Non-numeric price', {
	currency: { before: '', after: '円', space: false },
	price: '料金'
});
assert.ok(!nonNumericPriceDraft.source.includes('**料金:**'));
assert.ok(nonNumericPriceDraft.source.includes('$ Free for children'));

['・財布', '• Wallet', '‣ Schlüssel', '⁃ Clés', '▪ Portafoglio', '◦ 지갑'].forEach(function (item) {
	const draft = parser.prepareSimpleText(item, 'List notation');
	assert.ok(draft.source.startsWith('- '), 'Expected a Unicode list marker to become a Markdown list: ' + item);
});

const notationFalsePositives = parser.prepareSimpleText([
	'Contact us at person@example.com.',
	'The budget is $10.',
	'Important work continues.',
	'2026 update'
].join('\n\n'), 'Ordinary text');
assert.ok(!notationFalsePositives.source.includes('**Place:**'));
assert.ok(!notationFalsePositives.source.includes('**Price:**'));
assert.ok(!notationFalsePositives.source.includes('[!IMPORTANT]'));

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

const extendedFrontMatterMarkdown = [
	'---',
	"title: '拡張Front Matter'",
	'excerpt: >',
	'  AIが作成した原稿を',
	'  WordPressへ取り込みます。',
	'slug: ai-markdown-import',
	'tags: [AI, "WordPress Tips"]',
	'categories:',
	'  - 開発',
	'  - お知らせ',
	'featured-image: https://cdn.example.com/cover.jpg',
	'featured-image-alt: 記事のカバー画像',
	'status: draft',
	'---',
	'',
	'# 本文タイトル',
	'',
	'本文です。'
].join('\n');
const extendedFrontMatter = parser.parseFrontMatter(extendedFrontMatterMarkdown);
const extendedMetadata = JSON.parse(JSON.stringify(extendedFrontMatter.metadata));
const extendedSettings = JSON.parse(JSON.stringify(parser.createPostSettings(extendedFrontMatterMarkdown)));

assert.equal(extendedFrontMatter.hasFrontMatter, true);
assert.deepEqual(extendedMetadata, {
	title: '拡張Front Matter',
	excerpt: 'AIが作成した原稿を WordPressへ取り込みます。',
	slug: 'ai-markdown-import',
	tags: ['AI', 'WordPress Tips'],
	categories: ['開発', 'お知らせ'],
	featuredImage: 'https://cdn.example.com/cover.jpg',
	featuredImageAlt: '記事のカバー画像'
});
assert.deepEqual(JSON.parse(JSON.stringify(extendedFrontMatter.unknownFields)), ['status']);
assert.equal(extendedSettings.enabled.title, true);
assert.equal(extendedSettings.enabled.featuredImage, true);
assert.equal(extendedSettings.enabled.categories, true);
assert.equal(extendedSettings.values.tags.length, 2);
assert.ok(!parser.markdownToHtml(extendedFrontMatterMarkdown, true).includes('featured-image'));

const emptyFrontMatter = parser.createPostSettings('本文だけです。');
assert.equal(emptyFrontMatter.hasFrontMatter, false);
assert.equal(emptyFrontMatter.enabled.title, false);

const fixturePath = path.join(__dirname, '..', 'examples', 'front-matter-test.md');
const fixtureMarkdown = fs.readFileSync(fixturePath, 'utf8');
const fixtureSettings = JSON.parse(JSON.stringify(parser.createPostSettings(fixtureMarkdown)));
const fixtureEnabledCount = Object.keys(fixtureSettings.enabled).filter(function (key) {
	return fixtureSettings.enabled[key];
}).length;

assert.equal(fixtureSettings.hasFrontMatter, true);
assert.equal(fixtureEnabledCount, 6);
assert.equal(fixtureSettings.values.title, 'KOTOTSUGI Front Matter 動作確認');
assert.deepEqual(fixtureSettings.values.tags, ['KOTOTSUGI Test', 'AI Markdown', 'WordPress']);
assert.deepEqual(fixtureSettings.values.categories, ['KOTOTSUGI Demo', 'Markdown Import']);
assert.deepEqual(fixtureSettings.unknownFields, ['status', 'author']);
assert.ok(parser.markdownToHtml(fixtureMarkdown, true).includes('<ul>'));
assert.ok(parser.markdownToHtml(fixtureMarkdown, true).includes('<ol>'));

const samplePath = path.join(__dirname, '..', 'examples', 'kototsugi-sample.md');
const sampleMarkdown = fs.readFileSync(samplePath, 'utf8');
const sampleSettings = JSON.parse(JSON.stringify(parser.createPostSettings(sampleMarkdown)));
const sampleIssues = JSON.parse(JSON.stringify(parser.analyzeMarkdown(sampleMarkdown, { applyTitle: true })));
const sampleHtml = parser.markdownToHtml(sampleMarkdown, true);

assert.equal(sampleSettings.values.title, 'KOTOTSUGI テスト記事');
assert.equal(sampleSettings.values.slug, 'kototsugi-sample');
assert.deepEqual(sampleIssues, []);
assert.ok(sampleHtml.includes('<h2>KOTOTSUGIで試せること</h2>'));
assert.ok(sampleHtml.includes('kototsugi-callout--note'));
assert.ok(sampleHtml.includes('<table>'));

const localizedSampleFiles = [
	'kototsugi-sample.md',
	'kototsugi-sample-en.md',
	'kototsugi-sample-es_ES.md',
	'kototsugi-sample-de_DE.md',
	'kototsugi-sample-fr_FR.md',
	'kototsugi-sample-pt_BR.md',
	'kototsugi-sample-it_IT.md',
	'kototsugi-sample-ru_RU.md',
	'kototsugi-sample-nl_NL.md',
	'kototsugi-sample-zh_CN.md',
	'kototsugi-sample-pl_PL.md',
	'kototsugi-sample-tr_TR.md',
	'kototsugi-sample-id_ID.md',
	'kototsugi-sample-zh_TW.md',
	'kototsugi-sample-ko_KR.md'
];

localizedSampleFiles.forEach(function (sampleFile) {
	const localizedMarkdown = fs.readFileSync(path.join(__dirname, '..', 'examples', sampleFile), 'utf8');
	const localizedSettings = JSON.parse(JSON.stringify(parser.createPostSettings(localizedMarkdown)));
	const localizedIssues = JSON.parse(JSON.stringify(parser.analyzeMarkdown(localizedMarkdown, { applyTitle: true })));
	const localizedHtml = parser.markdownToHtml(localizedMarkdown, true);

	assert.ok(localizedSettings.values.title, sampleFile + ' should provide a title.');
	assert.equal(localizedSettings.values.slug, 'kototsugi-sample');
	assert.deepEqual(localizedIssues, [], sampleFile + ' should pass preflight checks.');
	assert.ok(localizedHtml.includes('kototsugi-callout--note'));
	assert.ok(localizedHtml.includes('<table>'));
});

const rulesPath = path.join(__dirname, '..', 'rules', 'KOTOTSUGI-RULES.md');
const rulesMarkdown = fs.readFileSync(rulesPath, 'utf8');

assert.ok(rulesMarkdown.includes('KOTOTSUGI Article Authoring Rules'));
assert.ok(rulesMarkdown.includes('featured_image_alt'));
assert.ok(rulesMarkdown.includes('Do not skip heading levels'));
assert.ok(rulesMarkdown.includes('Task lists'));
assert.ok(rulesMarkdown.includes("Detect the target language from the user's article request"));
assert.ok(rulesMarkdown.includes('Front Matter values, tags, categories, image alternative text'));
assert.ok(rulesMarkdown.includes('Do not default to English'));
assert.ok(rulesMarkdown.includes('Treat English text in examples as placeholders'));
assert.equal(/[\u3040-\u30ff\u3400-\u9fff]/.test(rulesMarkdown), false, 'The AI rules file must remain English-only.');

const reviewMarkdown = [
	'---',
	'title: Front Matterタイトル',
	'status: draft',
	'---',
	'# 本文タイトル',
	'',
	'### 飛んだ見出し',
	'',
	'- [x] タスク',
	'  - ネスト',
	'',
	'脚注です[^1]。',
	'',
	'![壊れた画像](image file.png)',
	'',
	'<div>HTML</div>',
	'',
	'# 二つ目のH1'
].join('\n');
const reviewIssues = JSON.parse(JSON.stringify(parser.analyzeMarkdown(reviewMarkdown, { applyTitle: true })));
const reviewCodes = reviewIssues.map(function (issue) { return issue.code; });

assert.ok(reviewCodes.includes('unsupported_front_matter_status'));
assert.ok(reviewCodes.includes('title_conflict'));
assert.ok(reviewCodes.includes('heading_level_jump'));
assert.ok(reviewCodes.includes('unsupported_task_list'));
assert.ok(reviewCodes.includes('unsupported_nested_list'));
assert.ok(reviewCodes.includes('unsupported_footnote'));
assert.ok(reviewCodes.includes('invalid_image_url'));
assert.ok(reviewCodes.includes('unsupported_html'));
assert.ok(reviewCodes.includes('multiple_h1'));
assert.equal(reviewIssues.find(function (issue) { return issue.code === 'title_conflict'; }).line, 5);

const cleanReviewIssues = JSON.parse(JSON.stringify(parser.analyzeMarkdown('# 同じタイトル\n\n## 本文', { applyTitle: true })));
assert.deepEqual(cleanReviewIssues.map(function (issue) { return issue.code; }), ['heading_used_as_title']);

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
