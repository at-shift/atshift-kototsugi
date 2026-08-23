# KOTOTSUGI

Turn AI-friendly Markdown into editable WordPress blocks.

KOTOTSUGI adds a focused Markdown import workspace to the WordPress block editor. Paste a draft created by an AI writing tool or load a local Markdown file, review the result in a live preview, and insert it as standard WordPress blocks that remain fully editable.

The current version is 0.5.0.

## The Name: KOTOTSUGI (言継ぎ)

KOTOTSUGI is a coined Japanese name written as **言継ぎ**. It combines *koto*, evoking words or an utterance, with *tsugi*, the act of continuing, inheriting, or passing something onward.

For this project, the name represents carrying words from an AI-generated Markdown draft into WordPress, where a person can continue editing, refining, and publishing them. The tool handles the change in format without treating the generated article as a finished or unchangeable artifact.

## Features

- Paste Markdown or load `.md`, `.markdown`, and `.txt` files
- Try the complete workflow with a bundled sample article in one click
- Copy service-neutral AI authoring rules for ChatGPT, Claude, Gemini, and other writing tools
- Review the source and rendered article side by side in a wide, responsive workspace
- Convert headings, paragraphs, emphasis, links, images, lists, tables, quotes, code blocks, horizontal rules, and GitHub-style callouts
- Use the first H1 or the Front Matter `title` as the WordPress post title
- Review and apply Front Matter values for the title, excerpt, slug, tags, categories, and featured image
- Use a persistent **Review before applying** tab for preflight checks, insertion modes, and conversion settings
- Follow the WordPress user language, with English as the source language and a bundled Japanese translation
- Check unsupported syntax, image URLs, heading hierarchy, and title conflicts before applying content
- Add blocks at the cursor, replace the current post body with confirmation, or create a new draft
- Import remote images into the WordPress media library
- Keep the original external URL when an image cannot be imported
- Generate standard WordPress blocks that remain editable after insertion
- Offer a standalone **Quick Post** page that does not expose the WordPress admin screen
- Protect Quick Post with a shared passphrase, login throttling, signed 30-day browser sessions, CSRF tokens, and duplicate-submission prevention
- Accept plain text or pasted Markdown, then require a preview and warning review before submission
- Turn simple Quick Post prefixes into structured content: `@` place, `!` important, `※` note, `¥` price, and `☎` phone
- Let the administrator select the Quick Post display language independently from the site language
- Let an administrator fix the author, category, and draft/publish behavior so contributors cannot change them accidentally

The default workflow stays deliberately simple: load a draft, review the preview, and insert it. Front Matter values are explained under **Post settings**, while warnings and insertion behavior are grouped under **Review before applying**. Adding at the cursor or replacing the current body never auto-saves the post. Only **Create new draft** saves a separate draft automatically.

For a first trial, choose **Load sample Markdown** in the editor sidebar. KOTOTSUGI loads [`examples/kototsugi-sample.md`](examples/kototsugi-sample.md) and opens the workspace automatically. Choose **Copy AI authoring rules** to copy the service-neutral instructions in [`rules/KOTOTSUGI-RULES.md`](rules/KOTOTSUGI-RULES.md).

## Requirements

- WordPress 6.4 or later
- PHP 7.4 or later

## Installation

1. Download the latest ZIP from [GitHub Releases](https://github.com/at-shift/atshift-kototsugi/releases).
2. In WordPress, open **Plugins > Add Plugin > Upload Plugin**.
3. Upload the ZIP and activate KOTOTSUGI.
4. Open a post or page in the block editor and select KOTOTSUGI from the Options menu.

## Quick Post

Quick Post is a deliberately narrow posting page for contributors who should not need to learn the WordPress admin screen.

1. Open **Settings > KOTOTSUGI**.
2. Choose the display language, publishing destination, post author, default category, and whether submissions become drafts or are published immediately. The destination can be Posts, Pages, or an available custom post type that supports titles and the editor.
3. Set a passphrase of at least eight characters and enable Quick Post.
4. Share the displayed posting URL and passphrase with the contributor.

The contributor opens the URL and enters a title and article text. Plain text and pasted Markdown are both accepted. Blank lines create paragraphs, `・` creates lists, and a short line on its own becomes a heading. An optional **More ways to write** section introduces `@` for a map-linked place, `!` for important information, `※` for a note, `¥` for a price, and `☎` for a telephone link. Natural labels such as `Place:` and `Phone:` work too.

Up to five JPEG, PNG, GIF, or WebP images can be attached with editable alternative text; KOTOTSUGI saves them to the Media Library and adds image blocks after the article. The contributor then reviews the title and preview, acknowledges relevant conversion warnings, and submits the article. Front Matter `status` and `author` values are silently ignored because the administrator fixes those choices in Quick Post settings. The source textarea also works with the operating system's standard dictation; KOTOTSUGI does not request microphone access or add its own recorder.

The free workflow remains manual and intentional: a person supplies a draft, reviews it, and presses the final button. Planned Pro automation may add inbound email or webhook sources, rule-based automatic publishing, multiple posting profiles, approval flows, delivery logs, and retries. Those remote automation features are not part of the current plugin.

## Remote Image Import Safety

Importing remote images requires the WordPress `upload_files` capability. KOTOTSUGI rejects private-network URLs, SVG files, unsupported image formats, and files larger than the lower of the site's upload limit or 10 MB.

If an image cannot be imported, KOTOTSUGI keeps its original external URL and continues inserting the article.

## Tests

Run the Markdown parser tests with Node.js:

```sh
node tests/editor-parser.test.js
```

For the WordPress integration tests, set `KOTOTSUGI_WP_ROOT` to the path of a local WordPress installation:

```sh
KOTOTSUGI_WP_ROOT=/path/to/wordpress php tests/media-import.test.php
KOTOTSUGI_WP_ROOT=/path/to/wordpress php tests/quick-post.test.php
```

## Reporting Issues

Report problems in [GitHub Issues](https://github.com/at-shift/atshift-kototsugi/issues). Include reproduction steps and the versions of WordPress, PHP, and KOTOTSUGI in use.

## License

GPL-2.0-or-later
