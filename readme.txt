=== KOTOTSUGI ===
Contributors: kototsugi
Tags: markdown, gutenberg, ai, editor, blocks
Requires at least: 6.4
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 0.3.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Turn AI-friendly Markdown into editable WordPress blocks.

== Description ==

KOTOTSUGI gives the block editor a focused Markdown import workspace. Paste a draft from ChatGPT, Claude, Gemini, or any Markdown-aware writing tool, or load a local Markdown file. Review the generated article in a wide preview, import remote article images into the WordPress media library, then insert editable blocks at the current cursor position.

The importer supports headings, paragraphs, emphasis, links, images, lists, tables, quotes, fenced code blocks, horizontal rules, and GitHub-style callouts such as `[!NOTE]` and `[!WARNING]`.

== Installation ==

1. Upload the `kototsugi` directory to `/wp-content/plugins/`.
2. Activate KOTOTSUGI through the Plugins screen.
3. Open a post or page with the block editor.
4. Select KOTOTSUGI from the editor's Options menu.

== Usage ==

Open KOTOTSUGI from the editor sidebar, then choose a `.md`, `.markdown`, or `.txt` file or open the workspace and paste Markdown. The desktop workspace shows the source and preview side by side; narrow screens use source and preview tabs. Choose whether the first H1 or Front Matter `title` should become the post title, then use "Insert as blocks" to add the converted content at the current cursor position.

Files are read locally in the browser and are not uploaded by KOTOTSUGI. The maximum file size is 2 MB.

When remote image import is enabled, HTTP and HTTPS images referenced in Markdown are downloaded by WordPress and saved as media attachments. Images are limited to the site's upload limit or 10 MB, whichever is smaller. Private-network URLs, unsupported image types, and SVG files are rejected. If an image cannot be imported, KOTOTSUGI keeps its original external URL and continues inserting the article.

== Supported Markdown ==

* ATX headings (`# Heading`)
* Paragraphs, bold, italic, inline code, and links
* Images (`![Alt text](https://example.com/image.jpg)`)
* Ordered and unordered lists
* Simple GitHub Flavored Markdown tables
* Quotes and fenced code blocks
* Horizontal rules
* Callouts: `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, and `CAUTION`
* YAML Front Matter `title`
