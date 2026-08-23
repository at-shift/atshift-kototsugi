---
title: "KOTOTSUGI Front Matter 動作確認"
excerpt: >
  AIが作成したMarkdown原稿を想定した、Front Matter拡張の確認用記事です。
  投稿設定と本文ブロックが一度に反映されるかを確認します。
slug: kototsugi-front-matter-test
tags: [KOTOTSUGI Test, "AI Markdown", WordPress]
categories:
  - KOTOTSUGI Demo
  - Markdown Import
featured_image: https://s.w.org/style/images/about/WordPress-logotype-simplified.png
featured_image_alt: WordPressロゴのアイキャッチ画像
status: draft
author: kototsugi
---

# KOTOTSUGI Front Matter 動作確認

この原稿は、**Front Matterの投稿設定**とMarkdown本文の変換をまとめて確認するためのテストデータです。

## 確認する投稿設定

- 投稿タイトル
- 抜粋
- スラッグ
- タグ
- カテゴリー
- アイキャッチ画像

`status`と`author`は未対応項目として表示され、投稿には反映されません。

## リスト

1. `.md`ファイルを読み込む
2. 「投稿設定」タブを確認する
3. 「本文と設定を反映」を実行する

## 表

| 項目 | 期待する結果 |
| --- | --- |
| title | 投稿タイトルに反映される |
| tags | タグとして登録される |
| featured_image | メディアへ保存される |

> [!NOTE]
> Front MatterがないMarkdownでは、従来どおりMarkdownとプレビューの画面だけが表示されます。

> 通常の引用ブロックも変換対象です。

```php
$article = 'KOTOTSUGI';
echo $article;
```

![本文内のWordPressロゴ](https://s.w.org/style/images/about/WordPress-logotype-standard.png)

---

以上でテスト原稿は終了です。
