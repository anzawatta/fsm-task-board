# fsm-task-board Architecture

設計原則は `PRINCIPLE.md` を参照。このドキュメントは確定済みの実装上の決定を記録する。

---

## グループ化アーキテクチャ（feat-fsm-node-parent-group で確定）

グループは専用ノード型（`type: "group"`）と子側 `parentId` フィールドで実現する。

| 論点 | 決定 |
|------|------|
| グループ ID 体系 | `g{N}`（`_groupIdCounter` 管理、`s{N}` と完全分離） |
| 子側 vs 親側の参照 | 子側 `parentId`（フラット配列のまま扱える） |
| グループ削除 | orphan 化（子の `parentId` を null にリセット） |
| 深さ制限 | 最大 3（`fromJSON` でバリデーション） |
| SVG 描画順序 | `renderGroups()` → `renderEdges()` → `renderNodes()`（グループ枠が最背面） |
| レガシー互換 | `type` 未定義ノードは `text` として扱う（`fromJSON` REQ-W005） |

---

## `toJSON` 許可リスト方式（確立済み）

`FSM.toJSON()` は出力フィールドを列挙する方式を採用。
スプレッド演算子・`Object.assign` は使用しない。
グループ化に伴い `type` / `parentId` を追加した際もこの方針を踏襲した。

---

## MCP アトミック書き込み（`mcp/canvas_reader_mcp.py`）

`_write_atomic()` は `tempfile.NamedTemporaryFile` + `os.replace` でアトミック書き込みを実現。
バックアップは `SNAPSHOT_DIR/writes/` に分離保存（読み取り差分スナップショットと衝突しない）。
mtime 追跡（`_last_mtime`）により同一セッション内での並行書き込みを検出する。

---

## DoD 区分（verification / validation）

| 区分 | 意味 | 遷移ブロック |
|------|------|------------|
| `verification` | 実装・機能確認（必須チェック） | 未チェックで done への遷移をブロック |
| `validation` | ユーザー受け入れ確認（任意） | ブロックしない（警告のみ） |
