# KOTOTSUGI

Turn AI-friendly Markdown into editable WordPress blocks.

KOTOTSUGI adds a focused Markdown import workspace to the WordPress block editor. Paste a draft from an AI writing tool or load a local Markdown file, review the result, and insert native editable blocks at the current cursor position.

The current stable release is version 0.3.0.

## Features

- Paste Markdown or load `.md`, `.markdown`, and `.txt` files
- Preview source and rendered content in a wide, responsive workspace
- Convert headings, paragraphs, emphasis, links, images, lists, tables, quotes, code blocks, horizontal rules, and GitHub-style callouts
- Use the first H1 or Front Matter `title` as the WordPress post title
- Import remote article images into the WordPress media library
- Keep the original external image URL when an import fails
- Insert standard WordPress blocks that remain editable after import

## Requirements

- WordPress 6.4 or later
- PHP 7.4 or later

## Installation

1. Download the latest ZIP from [GitHub Releases](https://github.com/at-shift/atshift-kototsugi/releases).
2. In WordPress, open **Plugins > Add Plugin > Upload Plugin**.
3. Upload the ZIP and activate **KOTOTSUGI**.
4. Open a post or page in the block editor and select KOTOTSUGI from the editor's Options menu.

## Image Import Safety

Remote image import requires the WordPress `upload_files` capability. KOTOTSUGI rejects private-network URLs, SVG files, unsupported image types, and files larger than the site's upload limit or 10 MB, whichever is smaller.

## Tests

Run the browser-side Markdown parser tests with Node.js:

```sh
node tests/editor-parser.test.js
```

The WordPress integration test accepts a local WordPress path through `KOTOTSUGI_WP_ROOT`:

```sh
KOTOTSUGI_WP_ROOT=/path/to/wordpress php tests/media-import.test.php
```

## Reporting Issues

Please use [GitHub Issues](https://github.com/at-shift/atshift-kototsugi/issues) and include reproduction steps together with your WordPress, PHP, and plugin versions.

## License

GPL-2.0-or-later
