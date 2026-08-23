# KOTOTSUGI

AIが作成したMarkdownを、編集可能なWordPressブロックへ変換します。

KOTOTSUGIは、WordPressブロックエディターにMarkdown取込専用の作業画面を追加します。AIライティングツールが作成した原稿を貼り付けるか、ローカルのMarkdownファイルを読み込み、プレビューで確認してから編集可能な標準ブロックとして挿入できます。

現在のバージョンは0.4.0です。

## 主な機能

- Markdownの貼り付けと `.md`、`.markdown`、`.txt` ファイルの読み込み
- 同梱テスト原稿による1クリックの動作確認
- ChatGPT、Claude、Geminiなどで使えるAI向け執筆ルールのコピー
- 広いレスポンシブ作業画面での原稿とプレビューの並列表示
- 見出し、段落、強調、リンク、画像、リスト、表、引用、コードブロック、水平線、GitHub形式コールアウトの変換
- 最初のH1またはFront Matterの `title` をWordPress投稿タイトルとして使用
- Front Matterのタイトル、抜粋、スラッグ、タグ、カテゴリー、アイキャッチ画像を確認して反映
- 必要なときだけ「確認と調整」を開き、未対応記法、画像URL、見出し階層、タイトル競合を確認
- カーソル位置への追加、確認付き本文置換、新規下書き作成
- 外部画像のWordPressメディアライブラリへの保存
- 画像保存に失敗した場合は元の外部URLを維持
- 挿入後も編集できるWordPress標準ブロックを生成

通常は、原稿を読み込み、プレビューを確認して挿入するだけです。詳細な事前チェック、反映方法、変換設定は「確認と調整」にまとめ、通常画面を複雑にしない構成にしています。カーソル追加と本文置換では現在の投稿を自動保存せず、新規下書き作成を選んだ場合だけ新しい下書きを保存します。

初回確認では、エディターサイドバーの「テスト用mdファイルをセット」を選択してください。[`examples/kototsugi-sample.md`](examples/kototsugi-sample.md) を読み込み、作業画面を自動で開きます。「AI用ルールをコピー」では、サービスに依存しない執筆ルール [`rules/KOTOTSUGI-RULES.md`](rules/KOTOTSUGI-RULES.md) をコピーできます。

## 動作要件

- WordPress 6.4以上
- PHP 7.4以上

## インストール

1. [GitHub Releases](https://github.com/at-shift/atshift-kototsugi/releases)から最新のZIPをダウンロードします。
2. WordPress管理画面の「プラグイン > プラグインを追加 > プラグインのアップロード」を開きます。
3. ZIPをアップロードしてKOTOTSUGIを有効化します。
4. ブロックエディターで投稿または固定ページを開き、オプションメニューからKOTOTSUGIを選択します。

## 画像取込の安全性

外部画像の取込にはWordPressの `upload_files` 権限が必要です。KOTOTSUGIは、プライベートネットワークのURL、SVG、未対応画像形式、サイトのアップロード上限または10MBのうち小さい方を超えるファイルを拒否します。

## テスト

Node.jsでMarkdownパーサーテストを実行します。

```sh
node tests/editor-parser.test.js
```

WordPress連携テストには、`KOTOTSUGI_WP_ROOT` でローカルWordPressのパスを指定します。

```sh
KOTOTSUGI_WP_ROOT=/path/to/wordpress php tests/media-import.test.php
```

## 問題の報告

[GitHub Issues](https://github.com/at-shift/atshift-kototsugi/issues)へ、再現手順とWordPress、PHP、プラグインの各バージョンを添えて報告してください。

## ライセンス

GPL-2.0-or-later
