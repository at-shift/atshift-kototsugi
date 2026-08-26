=== KOTOTSUGI ===
Contributors: atshift
Tags: markdown, gutenberg, ai, editor, blocks
Requires at least: 6.4
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Turn AI-friendly Markdown into editable WordPress blocks.

== Description ==

KOTOTSUGI is a standalone WordPress plugin. It is not an add-on or module for atshift Fields or atshift User Profile Fields, and neither plugin is required.

The name KOTOTSUGI is written as **言継ぎ** in Japanese. It combines *koto*, evoking words or an utterance, with *tsugi*, meaning to continue, inherit, or pass something onward. The name reflects the plugin's role in carrying an AI-created Markdown draft into WordPress, where a person can keep editing and refining it.

KOTOTSUGI gives the block editor a focused Markdown import workspace. Paste a draft from ChatGPT, Claude, Gemini, or any Markdown-aware writing tool, or load a local Markdown file. Review the generated article in a wide preview, then add editable blocks at the current cursor position, replace the current body, or create a separate draft.

The importer supports headings, paragraphs, emphasis, links, images, lists, tables, quotes, fenced code blocks, horizontal rules, and GitHub-style callouts such as `[!NOTE]` and `[!WARNING]`.

Quick Post adds a separate, passphrase-protected posting page for contributors who should not need the WordPress admin screen. An administrator fixes the display language, post author, default category, and whether a submission is saved as a draft or published immediately.

Version 1.0 includes:

* A source-and-preview workspace inside the WordPress block editor.
* Local `.md`, `.markdown`, and `.txt` file loading with drag and drop.
* A bundled sample article localized for all 15 supported languages.
* Service-neutral AI authoring rules for ChatGPT, Claude, Gemini, and other writing tools.
* Editable WordPress blocks for headings, paragraphs, lists, tables, quotes, code, links, images, and callouts.
* Focused YAML Front Matter for titles, excerpts, slugs, tags, categories, and featured images.
* Preflight checks for unsupported syntax, heading hierarchy, image URLs, and title conflicts.
* Three insertion methods: add at the cursor, replace the current body, or create a separate draft.
* Permission-checked remote image import with private-network and SVG rejection.
* A separate Quick Post page for ordinary text, simple notation, local images, review, and submission.
* Administrator controls for the Quick Post destination, author, category, display language, and draft or publish behavior.
* Bundled translations for 15 locales.

GitHub and WordPress.org release packages include the same translations for English (US), Japanese, Spanish (Spain), German, French, Portuguese (Brazil), Italian, Russian, Dutch, Chinese (Simplified), Polish, Turkish, Indonesian, Chinese (Traditional, Taiwan), and Korean.

== Installation ==

1. Upload the `kototsugi` directory to `/wp-content/plugins/`.
2. Activate KOTOTSUGI through the Plugins screen.
3. Open a post or page with the block editor.
4. Select KOTOTSUGI from the editor's Options menu.
5. To use Quick Post, open Settings > KOTOTSUGI and configure its posting page.

== Usage ==

Open KOTOTSUGI from the editor sidebar, then choose a `.md`, `.markdown`, or `.txt` file or open the workspace and paste Markdown. The desktop workspace shows the source and preview side by side; narrow screens use workspace tabs. Use "Post settings" to review Front Matter values and "Review before applying" to check warnings, choose an insertion method, and adjust conversion options.

For a first trial, choose "Load sample Markdown" in the sidebar. KOTOTSUGI loads a bundled sample and opens the workspace immediately. Choose "Copy AI authoring rules" to copy service-neutral Markdown rules for ChatGPT, Claude, Gemini, or another AI writing tool.

The preflight check reports unsupported syntax, malformed or relative image URLs, heading-level jumps, multiple H1 headings, and title conflicts before content is applied. Each result links back to the relevant Markdown line. Informational adjustments do not block insertion; errors do.

Choose "Add at cursor" to insert blocks at the current position, "Replace post content" to replace existing blocks after confirmation, or "Create new draft" to save the import as a separate WordPress draft. Adding or replacing blocks never auto-saves the current post.

Files are read locally in the browser and are not uploaded by KOTOTSUGI. The maximum file size is 2 MB.

When remote image import is enabled, HTTP and HTTPS images referenced in Markdown are downloaded by WordPress and saved as media attachments. Images are limited to the site's upload limit or 10 MB, whichever is smaller. Private-network URLs, unsupported image types, and SVG files are rejected. If an image cannot be imported, KOTOTSUGI keeps its original external URL and continues inserting the article.

== Quick Post ==

Quick Post is intended for shop staff, older adults, people with disabilities, anyone who finds the WordPress admin screen difficult, and anyone who wants to publish without learning many controls. It keeps only the steps needed to write, review, and submit an article; no knowledge of Markdown or the block editor is required.

Quick Post keeps the contributor flow narrow: enter a title and article text, review the preview, acknowledge relevant conversion warnings, and submit. Plain text and pasted Markdown are both accepted. Blank lines create paragraphs, `・` creates lists, and a short line on its own becomes a heading.

An optional "More ways to write" section introduces `@` for a map-linked place, `!` for important information, `※` for a note, `¥` for a price, and `☎` for a telephone link. Natural labels such as `Place:` and `Phone:` work too. Up to five JPEG, PNG, GIF, or WebP images can be attached with editable alternative text. KOTOTSUGI saves them to the Media Library and adds image blocks after the article.

Front Matter `status` and `author` values are silently ignored in Quick Post because the administrator fixes those choices in its settings.

The source textarea works with the operating system's standard dictation. KOTOTSUGI does not request microphone access, record audio, or connect to a speech service.

The posting page uses a shared passphrase, atomically throttles repeated login failures, keeps a server-tracked signed browser session for 30 days, verifies submission tokens, and prevents duplicate submissions. Signing out revokes that browser session. Changing delegated authority, changing the passphrase, or using the administrator's sign-out-all action invalidates existing sessions.

Administrators choose a fixed publishing destination for the posting page. Posts, Pages, and custom post types that support titles and the editor are available. KOTOTSUGI verifies that the selected author can create or publish that content type, and requires the author's upload permission when images are attached.

The free workflow requires a person to supply, review, and submit each draft. Inbound email, webhooks, rule-based automatic publishing, multiple posting profiles, approval flows, delivery logs, and retries are not included in this version.

== Supported Markdown ==

* ATX headings (`# Heading`)
* Paragraphs, bold, italic, inline code, and links
* Images (`![Alternative text](https://example.com/image.jpg)`)
* Ordered and unordered lists
* Simple GitHub Flavored Markdown tables
* Quotes and fenced code blocks
* Horizontal rules
* Callouts: `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, and `CAUTION`
* YAML Front Matter post settings

== Supported Front Matter ==

KOTOTSUGI recognizes a focused YAML-compatible subset intended for AI-generated Markdown. Values can be edited or disabled before they are applied.

* `title`: post title
* `excerpt` or `description`: post excerpt
* `slug`: post slug
* `tags`: inline or multi-line list of tags
* `categories`: inline or multi-line list of categories
* `featured_image`, `cover`, or `image`: remote featured image URL
* `featured_image_alt` or `image_alt`: featured image alternative text

Unknown Front Matter keys are listed in the workspace and are not applied. KOTOTSUGI does not change the post author, publication status, or publication date from Front Matter.

== Links ==

* Official website: [upf.at-shift.net/en/kototsugi](https://upf.at-shift.net/en/kototsugi/)
* GitHub repository: [github.com/at-shift/atshift-kototsugi](https://github.com/at-shift/atshift-kototsugi)
* AI authoring rules: [KOTOTSUGI-RULES.md](https://github.com/at-shift/atshift-kototsugi/blob/main/rules/KOTOTSUGI-RULES.md)

== Privacy ==

KOTOTSUGI does not send site data, article drafts, or uploaded files to the plugin author or an AI service. It does not include analytics, telemetry, advertising, or remote executable code.

Markdown files are read locally in the browser. Quick Post submissions and attached images are sent only to the WordPress site where KOTOTSUGI is installed. When an administrator enables remote image import, WordPress requests only the image URLs referenced by the submitted Markdown after validating permissions, network destinations, formats, and size limits.

KOTOTSUGI does not include an AI model or connect to ChatGPT, Claude, Gemini, or another writing service. Contributors decide separately whether to use an external AI service and are responsible for that service's privacy terms.

== Screenshots ==

1. Review Markdown source and the resulting WordPress article preview together in the full workspace.
2. Review and edit Front Matter values for the title, excerpt, slug, tags, categories, and featured image before applying them.
3. Inspect preflight results, choose an insertion method, and adjust conversion options before changing the editor.
4. Use the focused Quick Post page with a title, article text, writing hints, image attachments, and a final review action.
5. Open Markdown Posting from the KOTOTSUGI pencil button in the WordPress block editor toolbar.

== Related Projects ==

These are separate, optional WordPress plugins from the same publisher. KOTOTSUGI does not depend on them.

* [atshift User Profile Fields](https://wordpress.org/plugins/atshift-user-profile-fields/) - create and manage configurable WordPress user profile fields.
* [atshift Fields](https://wordpress.org/plugins/atshift-fields-maintenance-for-custom-field-suite/) - create and organize custom fields for posts, pages, and custom post types.
* [atshift Freeform Login](https://wordpress.org/plugins/atshift-freeform-login/) - customize the WordPress login screen and add reusable login forms.
* [atshift Feed Builder](https://wordpress.org/plugins/atshift-feed-builder/) - build purpose-specific RSS 2.0 and JSON Feed 1.1 feeds from structured WordPress content.

== Changelog ==

= 1.0 =
* Add bundled translations for 13 more locales.
* Add all 15 bundled languages to the Quick Post display-language setting.
* Add localized sample Markdown for all 15 supported languages.
* Clarify that KOTOTSUGI is a standalone plugin and update the author URL.

= 0.5.1 =
* Enforce custom post type creation and media upload capabilities in Quick Post.
* Add server-tracked sessions with individual logout revocation and session-scoped local drafts.
* Make login attempt and duplicate-submission reservations atomic.
* Bind completion receipts to the current session and submission.
* Limit submitted block depth and count before recursive processing.
* Complete image handling before transitioning a Quick Post to published status.
* Require attachment edit permission before reusing an imported remote image.

= 0.5.0 =
* Add the standalone Quick Post workflow for contributors who do not use wp-admin.
* Add passphrase protection, login throttling, signed sessions, CSRF protection, and duplicate-submission prevention.
* Accept pasted Markdown and plain text with preview and warning review.
* Add administrator controls for the publishing destination, post author, category, and draft or immediate publication behavior.
* Add local image attachments with previews, alternative text, Media Library storage, and image blocks.
* Hide irrelevant Front Matter status and author notices from the contributor review.
* Use the operating system's normal dictation without microphone permissions or an in-plugin recorder.
* Add progressive plain-text formatting for places, important information, notes, prices, and phone numbers.
* Add a dedicated Quick Post display-language setting with Japanese and English options.

= 0.4.1 =
* Follow the WordPress user language, with English source strings and a bundled Japanese translation.
* Clarify Post settings counts, tab purposes, and insertion method effects.
* Replace the duplicated Review and adjust controls with one persistent Review before applying tab.

= 0.4.0 =
* Add Front Matter post settings, preflight checks, three insertion methods, remote image import, a sample article, and AI authoring rules.
