# EARS-003: MCP グループサポート

**Status:** Draft
**Date:** 2026-06-09
**Ward:** fsm-task-board

`canvas_reader_mcp.py` および `canvas_to_md.py` に対するグループ化機能の拡張要件。
アクターは MCP ツールを呼び出すエージェント（Claude Code 等）。
ブラウザ UI 側の要件は EARS-002 が担当する。

---

## ツール変更概要

| Tool | 変更内容 |
|------|---------|
| `add_node` | `type` (省略可, default `"text"`) と `parentId` (省略可, default `null`) 引数を追加 |
| `remove_node` | グループ削除時に子の `parentId` を `null` リセット（孤立化）を追加 |
| `read_canvas` / `to_mermaid` | グループノードを `subgraph` ブロックとして Mermaid 出力 |

> `update_node` のシグネチャは変更しない（EARS-008 REQ-E006 維持）。

---

## 不変条件 [INV]

1. REQ-U001: THE SYSTEM SHALL compute group node IDs in `_next_group_id()` by scanning all node IDs with the `g` prefix and returning `g{max_numeric_suffix + 1}`, mirroring the existing `_next_node_id()` logic for `s{N}` nodes.

2. REQ-U002: THE SYSTEM SHALL validate the `type` argument in `add_node` against the allowed set `{"text", "group"}` before writing. An unrecognised `type` value SHALL result in `{"status": "error", "reason": "invalid type"}` being returned.

3. REQ-U003: THE SYSTEM SHALL validate that the `parentId` argument in `add_node`, if provided and non-null, references an existing node whose `type` is `"group"`. A `parentId` pointing to a `"text"` node or a non-existent node SHALL result in `{"status": "error", "reason": "invalid parentId"}`.

4. REQ-U004: THE SYSTEM SHALL validate the resulting nesting depth when `parentId` is set in `add_node`. If the resolved depth would exceed 3, the tool SHALL return `{"status": "error", "reason": "nesting depth exceeds 3"}` and abort the write.

5. REQ-U005: THE SYSTEM SHALL emit `subgraph` blocks in the Mermaid output of `to_mermaid()` for nodes whose `type` is `"group"`. A group node SHALL be represented as a `subgraph` containing all nodes whose `parentId` equals the group's ID.

6. REQ-U006: THE SYSTEM SHALL cap Mermaid `subgraph` nesting at 2 levels. Group nodes at depth 3 SHALL be rendered as plain flowchart nodes (not a nested `subgraph`) to avoid Mermaid parser limitations.

---

## 敵対条件 [UNWANTED]

1. REQ-W001: THE SYSTEM SHALL NOT create a node with `type: "group"` using a `s{N}` ID. Group nodes created via `add_node(type="group")` SHALL use `_next_group_id()` and receive a `g{N}` ID.

2. REQ-W002: THE SYSTEM SHALL NOT create a node with `type: "text"` using a `g{N}` ID. Text nodes created via `add_node()` (default or explicit `type="text"`) SHALL use `_next_node_id()` and receive a `s{N}` ID.

3. REQ-W003: THE SYSTEM SHALL NOT accept a `parentId` that would introduce a circular reference. If the resolved `parentId` chain leads back to the node being created, the tool SHALL return `{"status": "error", "reason": "circular parentId reference"}` and abort.

4. REQ-W004: THE SYSTEM SHALL NOT modify the `update_node` tool signature or behavior. Coordinates, sizes, and `dod` fields SHALL remain un-settable via MCP (EARS-008 REQ-E006 maintained).

5. REQ-W005: THE SYSTEM SHALL NOT emit a `subgraph` block for a group node that has no member nodes. An empty group node SHALL be rendered as a plain flowchart node (e.g., `gN["group name"]`) in the Mermaid output.

6. REQ-W006: THE SYSTEM SHALL NOT cascade-delete child nodes when `remove_node` is called on a group node. Only the group node itself (and its connected edges) SHALL be deleted; children SHALL have their `parentId` set to `null`.

---

## 状態駆動条件 [STATE-DRIVEN]

1. REQ-S001: WHILE a group node `g{N}` exists in the canvas, `add_node` calls with `parentId: g{N}` SHALL be accepted (subject to depth and type validation in REQ-U003 and REQ-U004).

2. REQ-S002: WHILE `force=False` and the canvas file's mtime has changed since the MCP server last read it, all write operations (including the new `type`/`parentId` paths in `add_node` and the orphan-reset in `remove_node`) SHALL be refused, consistent with EARS-008 REQ-U010 and REQ-W007.

---

## イベント駆動条件 [EVENT-DRIVEN]

1. REQ-E001: WHEN `add_node` is called with `type="group"`, the system SHALL:
   a. Call `_next_group_id(nodes)` to compute a `g{N}` ID.
   b. Auto-place the new group node using the existing `_auto_place()` logic.
   c. Store `type: "group"` and `parentId` (supplied value or `null`) on the new node.
   d. Write atomically and return the full created node object with `"status": "created"`.

2. REQ-E002: WHEN `add_node` is called with `type="text"` (or `type` omitted), the system SHALL behave identically to the pre-existing `add_node` implementation, with the addition of storing `parentId` (supplied value or `null`) on the node.

3. REQ-E003: WHEN `remove_node` is called and the target node has `type: "group"`, the system SHALL:
   a. Iterate all nodes in the canvas whose `parentId` equals the removed group's ID.
   b. Set `parentId = null` on each such node.
   c. Delete the group node.
   d. Delete all edges whose `fromNode` or `toNode` matches the removed group ID (existing cascade-delete for edges is unchanged).
   e. Write the modified canvas atomically.

4. REQ-E004: WHEN `to_mermaid()` builds the Mermaid output, the system SHALL:
   a. Identify all nodes with `type: "group"` that have at least one child.
   b. For each such group (up to depth 2), emit a `subgraph gN ["group name"]` … `end` block containing the member node lines.
   c. Place non-group nodes and ungrouped nodes outside any `subgraph` block.
   d. Emit edges after all node and subgraph declarations.

5. REQ-E005: WHEN `read_canvas` is called, the system SHALL pass the full node list (including `type` and `parentId` fields) to `convert()` / `to_mermaid()` so that group hierarchy is reflected in the Mermaid output.

---

## Advisory [ADV]

- **ADV-001** (subgraph depth cap): Mermaid の `subgraph` ネストは renderer によってサポート度が異なる。深度上限 2 段（REQ-U006）はこの制約への対応。深度 3 のグループはフラットなノードとして出力する。この挙動は `read_canvas` 結果の説明文に記載することを推奨する。

- **ADV-002** (backward-compatible read): 既存の `s{N}` ノード（`type` フィールドなし）は `to_mermaid()` でフラットな flowchart ノードとして出力され続ける。`type` フィールドの存在チェックは `n.get("type") == "group"` で十分。

- **ADV-003** (auto-place for group nodes): `_auto_place()` はノードリスト全体（グループノードを含む）から最大 x を計算する。グループ枠はブラウザ UI でリサイズ・移動されるため、MCP の auto-place は初期位置として使われるにとどまる。

---

## 関連EARS

- EARS-001: ノードスキーマ拡張（`type` 値域・`g{N}` カウンタ・バリデーション不変条件）
- EARS-002: グループ UX / レンダリング（UI 側の削除時孤立化と対称）
- EARS-008（既存）: MCP write tools（`add_node` / `remove_node` / `update_node` の基底要件）
