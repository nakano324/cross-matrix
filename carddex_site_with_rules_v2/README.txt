# CardDex + Rules（静的サイト）
公式カード図鑑と、世界観重視の「ルール」ページを同梱した静的サイト一式。GitHub Pagesで無料公開できます。

## 公開手順
1. GitHubで新規リポジトリ作成（例: carddex）
2. このフォルダ内のファイルをアップロード（`index.html` / `rules.html` / `style.css` / `script.js` / `rules.js` / `cards.json` / `rules-config.json`）
3. リポジトリの「Settings → Pages → Branch: main / root」を選択
4. 数十秒後、公開URLが生成されます（例: https://username.github.io/carddex/）

## ルールページのカスタム
- 主要な数値や用語は `rules-config.json` を編集すると自動反映されます。
  - `board_rows`, `board_cols`, `deck_size`, `starting_hand`, `base_count`, `resources_name`, `base_name`, `life_term`
  - `win_conditions`（配列）
  - `keywords`（オブジェクト）
  - `last_updated`（ISO日付）

## 図鑑のカスタム
- `cards.json` にカードを追記（画像URLも可）で自動反映されます。

## メモ
- すべて静的ファイルのみで動作（サーバー不要 / 完全無料）
- 印刷（Ctrl/Cmd+P）用に簡易スタイルを同梱
