=== KOTOTSUGI ===
Contributors: kototsugi
Tags: markdown, gutenberg, ai, editor, blocks
Requires at least: 6.4
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.4.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

AIが作成したMarkdownを、編集可能なWordPressブロックへ変換します。

== Description ==

KOTOTSUGIは、ブロックエディターにMarkdown取込専用の作業画面を追加します。ChatGPT、Claude、Geminiなどが作成した原稿を貼り付けるか、ローカルのMarkdownファイルを読み込み、広いプレビューで確認できます。変換後は、カーソル位置への追加、現在の本文の置換、新規下書き作成から反映方法を選べます。

見出し、段落、強調、リンク、画像、リスト、表、引用、コードブロック、水平線、`[!NOTE]` や `[!WARNING]` などのGitHub形式コールアウトに対応します。

== Installation ==

1. `kototsugi` ディレクトリを `/wp-content/plugins/` へアップロードします。
2. WordPressのプラグイン画面でKOTOTSUGIを有効化します。
3. ブロックエディターで投稿または固定ページを開きます。
4. エディターのオプションメニューからKOTOTSUGIを選択します。

== 使い方 ==

エディターサイドバーからKOTOTSUGIを開き、`.md`、`.markdown`、`.txt` ファイルを選択するか、作業画面へMarkdownを貼り付けます。デスクトップでは原稿とプレビューを並べて表示し、狭い画面ではタブで切り替えます。通常はプレビューを確認して挿入するだけで、事前チェック、反映方法、変換設定が必要な場合だけ「確認と調整」を開きます。

初回確認では「テスト用mdファイルをセット」を選択すると、同梱サンプルを読み込んで作業画面を自動で開きます。「AI用ルールをコピー」では、ChatGPT、Claude、Geminiなどで共通利用できるMarkdown執筆ルールをコピーできます。

事前チェックでは、未対応記法、不正または相対指定の画像URL、見出し階層の飛び、複数のH1、タイトル競合を反映前に確認できます。各結果から該当するMarkdown行へ戻れます。情報表示は挿入を妨げず、エラーがある場合だけ反映を停止します。

「カーソル位置へ追加」は現在位置へブロックを追加し、「本文を置き換え」は確認後に既存ブロックを置換します。「新規下書きを作成」は別のWordPress下書きとして保存します。追加と置換では現在の投稿を自動保存しません。

ファイルはブラウザ内で読み込み、KOTOTSUGIからサーバーへアップロードしません。ファイルサイズ上限は2MBです。

外部画像の保存を有効にすると、Markdown内のHTTP・HTTPS画像をWordPressへダウンロードし、メディア添付ファイルとして保存します。画像上限はサイトのアップロード上限または10MBのうち小さい方です。プライベートネットワークURL、未対応形式、SVGは拒否します。画像を保存できない場合は元の外部URLを維持し、記事の挿入を続行します。

== 対応Markdown ==

* ATX形式の見出し（`# 見出し`）
* 段落、太字、斜体、インラインコード、リンク
* 画像（`![代替テキスト](https://example.com/image.jpg)`）
* 番号付き・番号なしリスト
* シンプルなGitHub Flavored Markdown形式の表
* 引用とフェンス付きコードブロック
* 水平線
* コールアウト: `NOTE`、`TIP`、`IMPORTANT`、`WARNING`、`CAUTION`
* YAML Front Matterの投稿設定

== 対応Front Matter ==

KOTOTSUGIは、AIが作成するMarkdown向けの限定的なYAML互換形式に対応します。検出した値は反映前に編集または無効化できます。

* `title`: 投稿タイトル
* `excerpt` または `description`: 投稿の抜粋
* `slug`: 投稿スラッグ
* `tags`: インラインまたは複数行のタグ一覧
* `categories`: インラインまたは複数行のカテゴリー一覧
* `featured_image`、`cover`、`image`: 外部アイキャッチ画像URL
* `featured_image_alt` または `image_alt`: アイキャッチ画像の代替テキスト

未対応のFront Matter項目は作業画面へ表示し、投稿には反映しません。KOTOTSUGIはFront Matterから投稿者、公開状態、公開日時を変更しません。
