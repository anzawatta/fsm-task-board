# fsm-task-board System Principle

## Problem: 解決する課題

**現状:**
FSM（有限状態機械）の状態遷移図は設計ツールに留まりがちで、
タスク進捗の管理と切り離されている。各ステートに「完了条件（DoD）」を持たせる
仕組みがなく、どのタスクが done か / wip かを可視化しにくい。

**目指す状態:**
状態遷移図そのものがタスクボードになる。
各ノードに DoD チェックリストを持たせ、status（done / wip / idle）と連動させることで、
FSM の構造と作業の進捗を一枚のビューで把握できる。

**設計の核心:**
サーバーレス・依存ゼロのブラウザアプリ。
ローカル JSON ファイルが single source of truth であり、
MCP サーバーはその JSON への別口アクセスとして機能する。
**ビューは状態の鏡——状態が変われば SVG が再描画される。**

---

## Design Principles: 設計原則

### 1. SVG 全再描画（Full-Redraw, No Diff）

- **説明**: `render()` は毎回 `innerHTML = ''` でクリアしてから全要素を再生成する。
  差分更新・仮想 DOM・パッチは使わない。
- **理由**: グラフ構造は要素間の依存が密で、差分パッチのバグ（残留要素・ID衝突）が
  デバッグしにくい。再描画コストよりも実装の単純さと正確さを優先する。
  インタラクティブなビューアとして十分なパフォーマンスが得られている。

### 2. ローカル JSON が canonical（File System Access API）

- **説明**: 永続化は File System Access API（`showOpenFilePicker` / `showSaveFilePicker`）
  による ローカル JSON ファイルへの直接読み書きに依存する。
  セッションメモリはリロードで消える——永続化はユーザーの明示的な Save 操作に委ねる。
- **理由**: サーバー・バックエンド・クラウドストレージを持たないシングルページアプリ設計。
  File System Access API は Chromium 系のみ対応（Firefox / Safari は動作しない）。
  この制約は意図的な割り切りであり、動作環境は Chromium に固定されている。

### 3. フラットノードモデル（Flat Node Model）

- **説明**: データモデルは `{ nodes[], edges[] }` の 2 配列で完結する。
  グループ化は専用の `group` ノード + 子側 `parentId` フィールドで表現し、
  ネストした木構造は持たない。深さ制限は 3。
- **理由**: ネスト構造を持つと直列化・デシリアライズ・クエリの複雑さが非線形に増大する。
  フラット配列は JSON と 1:1 対応し、MCP・ブラウザ・スクリプトが同じ形式を無変換で扱える。

### 4. `toJSON` 許可リスト方式（Explicit Allowlist Serialization）

- **説明**: `FSM.toJSON()` は出力するフィールドを明示的に列挙する（スプレッド・`Object.assign` 禁止）。
  新フィールドを永続化したい場合は `toJSON` への追加が必須。
- **理由**: 暗黙スプレッドは内部状態（ランタイム専用フィールド）が意図せず JSON に混入するリスクがある。
  許可リスト方式ならスキーマの変更意図がコードに明示される。

### 5. MCP は JSON への別口（MCP as an Independent Access Layer）

- **説明**: MCP サーバーはブラウザと同一の JSON ファイルを読み書きする。
  書き込みは `tempfile + os.replace` によるアトミック操作で行い、
  ブラウザとの競合によるファイル破損を防ぐ。
- **理由**: ブラウザ・LLM エージェント・スクリプトという複数クライアントが同じファイルを触る設計では、
  アトミック書き込みが唯一の整合性保証手段になる。MCP は UI の代替インターフェースに過ぎず、
  single source of truth（JSON ファイル）は変わらない。

### 6. 状態モジュールの中央集権（Centralized UI State）

- **説明**: グローバル UI 状態（`selectedNodeId` / `isDirty` / `fileHandle` / `viewOffset` 等）は
  `core/state.js` の `uiState` オブジェクトに集約する。モジュールは state を読み書きするが、
  独自の状態キャッシュを持たない。
- **理由**: マルチモジュール構成で状態が分散すると、`render()` の前後で矛盾が生じやすい。
  単一の state オブジェクトにより、「どのモジュールも同じ状態を見ている」ことが保証される。

---

## Conflict Resolution: 原則間の衝突ルール

**優先順位: データ整合性 ＞ 実装の単純さ ＞ 描画パフォーマンス ＞ ブラウザ互換性**

| 衝突パターン | 解決ルール |
|---|---|
| 差分更新 vs 全再描画 | 全再描画を優先。描画バグの再現コストが最適化コストより高い |
| 新フィールドの暗黙 vs 明示シリアライズ | 明示（許可リスト）を優先。`toJSON` を変更するコストは許容範囲 |
| ブラウザ互換性 vs File System Access API | Chromium 固定を許容。他ブラウザ対応のためにアーキテクチャを複雑化しない |
| ネスト木 vs フラット配列 | フラット配列を優先。グループ化は `parentId` 参照で表現する |
| MCP の利便性 vs ファイル整合性 | アトミック書き込みを必須とする。非アトミックな書き込みは導入しない |
| グループ削除時のカスケード vs orphan化 | orphan 化を優先（parentId → null）。子ノードのデータを親の削除に巻き込まない |

---

## Non-Goals: 意図的にやらないこと

- **差分レンダリング / 仮想 DOM**: 全再描画で十分な複雑さのグラフを対象としている
- **サーバーサイド永続化**: ローカル JSON + File System Access API が設計の前提
- **Firefox / Safari での File I/O**: Chromium 固定は意図的な割り切り
- **多段ネスト（深さ 3 超）**: フラットモデルの単純さを維持するため上限を設ける
- **グループ削除によるカスケード削除**: 子ノードは親の削除後も生き残り独立ノードになる
- **MCP を single source of truth にすること**: MCP はアクセス手段であり、JSON ファイルが canonical

---

## Decisions: 設計決定済み事項

### グループ化アーキテクチャ（feat-fsm-node-parent-group で確定）

グループは専用ノード型（`type: "group"`）と子側 `parentId` フィールドで実現する。

| 論点 | 決定 |
|------|------|
| グループ ID 体系 | `g{N}`（`_groupIdCounter` 管理、`s{N}` と完全分離） |
| 子側 vs 親側の参照 | 子側 `parentId`（フラット配列のまま扱える） |
| グループ削除 | orphan 化（子の `parentId` を null にリセット） |
| 深さ制限 | 最大 3（`fromJSON` でバリデーション） |
| SVG 描画順序 | `renderGroups()` → `renderEdges()` → `renderNodes()`（グループ枠が最背面） |
| レガシー互換 | `type` 未定義ノードは `text` として扱う（`fromJSON` REQ-W005） |

### `toJSON` 許可リスト（2025年〜確立）

`FSM.toJSON()` は出力フィールドを列挙する方式を採用。
スプレッド演算子・`Object.assign` は使用しない。
グループ化に伴い `type` / `parentId` を追加した際もこの方針を踏襲した。

### MCP アトミック書き込み（canvas_reader_mcp.py）

`_write_atomic()` は `tempfile.NamedTemporaryFile` + `os.replace` でアトミック書き込みを実現。
バックアップは `SNAPSHOT_DIR/writes/` に分離保存（読み取り差分スナップショットと衝突しない）。
mtime 追跡（`_last_mtime`）により同一セッション内での並行書き込みを検出する。

### DoD 区分（verification / validation）

| 区分 | 意味 | 遷移ブロック |
|------|------|------------|
| `verification` | 実装・機能確認（必須チェック） | 未チェックで done への遷移をブロック |
| `validation` | ユーザー受け入れ確認（任意） | ブロックしない（警告のみ） |
