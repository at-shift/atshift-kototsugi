# KOTOTSUGI

Turn AI-friendly Markdown into editable WordPress blocks.

KOTOTSUGI adds a focused Markdown import workspace to the WordPress block editor. Paste a draft created by an AI writing tool or load a local Markdown file, review the result in a live preview, and insert it as standard WordPress blocks that remain fully editable.

The current version is 0.4.1.

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
```

## Reporting Issues

Report problems in [GitHub Issues](https://github.com/at-shift/atshift-kototsugi/issues). Include reproduction steps and the versions of WordPress, PHP, and KOTOTSUGI in use.

## License

GPL-2.0-or-later
