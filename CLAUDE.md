# fsm-task-board

FSM 状態遷移図をタスクボードとして使うインタラクティブビューア。
各ステートに DoD（受け入れ条件）を持ち、状態遷移の進捗を可視化する。

## Locale

### Landmarks
- `core/fsm.js`           — FSM データモデルの真実の源。CRUD・JSON serialize/deserialize
- `core/state.js`         — グローバル UI 状態（selectedNodeId・isDirty・fileHandle 等）。全モジュール依存
- `interaction/events.js` — ユーザー操作（ドラッグ・クリック・キー）→ state 更新の入口
- `ui/renderer.js`        — state → SVG グラフ描画パイプライン
- `ui/panel.js`           — DoD CRUD・ステータストグル・guard edge 編集 UI
- `main.js`               — モジュール配線・初期化・`window` API expose

### Districts
- `core/`        — データモデル・UI 状態管理（DOM 非依存）
- `interaction/` — ユーザー入力・ファイル I/O（File System Access API）
- `ui/`          — state → ビジュアル変換（SVG 描画・DOM 更新）
- `styles/`      — CSS 変数・レイアウト定義

### Edges
- `File System Access API` — Chromium 系のみ対応。Firefox/Safari は TypeError（設計上の割り切り）
- `fsm-tasks.json`         — ローカルファイル境界。`.gitignore` 除外・`sample-tasks.json` で代替提供
- `DOM 固定 ID`            — `#canvas` / `#panel` / `#toolbar` 等。変更時は renderer.js・panel.js 両方を確認
- セッションメモリ          — リロードで喪失。永続化は JSON export/import に依存

### Components
<!-- 詳細 → logs/components/fsm-task-board/（都度生成） -->
- `FSM ビューア`       — 状態遷移図の SVG 描画・ズーム・パン（renderer.js + fsm.js）
- `タスクボード UI`    — DoD チェックリスト・ステータストグル・guard edge（panel.js）
- `ファイル I/O`       — Open / Save / Save As、JSON 検証（file-io.js + state.js）
- `未保存インジケータ` — isDirty フラグ管理・ヘッダーバッジ点滅（dirty.js）

<!-- last-verified: 2026-04-26 -->
