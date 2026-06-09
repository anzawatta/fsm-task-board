# EARS-001: ノードスキーマ拡張（type + parentId）

**Status:** Draft
**Date:** 2026-06-09
**Ward:** fsm-task-board

`core/fsm.js` のノードスキーマに `type` フィールドと `parentId` フィールドを追加し、
グループ化を支える ID 体系・シリアライズ・デシリアライズ・バリデーション不変条件を定義する。

---

## 不変条件 [INV]

1. REQ-U001: THE SYSTEM SHALL support exactly two values for `type`: `"text"` and `"group"`. No other string value SHALL be stored in the `type` field.

2. REQ-U002: THE SYSTEM SHALL allocate group node IDs using the prefix `g` followed by a positive integer (pattern: `g{N}`), using a counter (`_groupIdCounter`) that is independent of the existing `_idCounter` used for `s{N}` node IDs.

3. REQ-U003: THE SYSTEM SHALL keep the `s{N}` ID counter and the `g{N}` ID counter in non-overlapping namespaces — an ID beginning with `s` SHALL never be assigned to a group node, and an ID beginning with `g` SHALL never be assigned to a text node.

4. REQ-U004: THE SYSTEM SHALL represent the top-level (no parent) membership state with `parentId: null`. Absence of a `parentId` field in a stored node SHALL be treated as equivalent to `parentId: null` during import.

5. REQ-U005: THE SYSTEM SHALL limit the nesting depth of the parent-child hierarchy to a maximum of 3 levels. A depth of 1 means a node's `parentId` references a group at the root level; depth 3 is the maximum permitted.

6. REQ-U006: THE SYSTEM SHALL include `type` and `parentId` in the `toJSON()` serialization output for every node. Nodes whose `type` is `"text"` and whose `parentId` is `null` SHALL still emit both fields explicitly.

7. REQ-U007: THE SYSTEM SHALL recompute `_groupIdCounter` during `fromJSON()` by scanning all node IDs with the `g` prefix and setting the counter to the maximum numeric suffix found, mirroring the existing `_idCounter` recomputation for `s{N}` nodes.

---

## 敵対条件 [UNWANTED]

1. REQ-W001: THE SYSTEM SHALL NOT store a `type` value other than `"text"` or `"group"`. If `fromJSON()` or MCP import encounters an unrecognised `type` value, it SHALL halt processing and report an error to the caller. It SHALL NOT silently coerce the value to a default.

2. REQ-W002: THE SYSTEM SHALL NOT permit a `parentId` that references a node whose `type` is `"text"`. Only `"group"` nodes may act as parents.

3. REQ-W003: THE SYSTEM SHALL NOT permit a circular parent-child reference. If `fromJSON()` detects that following the `parentId` chain from any node eventually returns to that same node, it SHALL halt processing and report an error.

4. REQ-W004: THE SYSTEM SHALL NOT permit a parent-child chain whose depth exceeds 3. If `fromJSON()` detects a depth > 3, it SHALL halt processing and report an error.

5. REQ-W005: THE SYSTEM SHALL NOT retroactively set `type` on nodes loaded from existing JSON files that do not contain a `type` field. Such nodes SHALL be treated as `type: undefined` (backward-compatible) and SHALL NOT cause a load failure.

6. REQ-W006: THE SYSTEM SHALL NOT modify the `edge` schema. Group membership is expressed solely through the `parentId` field on node objects; edges remain independent of the group hierarchy.

7. REQ-W007: THE SYSTEM SHALL NOT share the `_groupIdCounter` with `_idCounter`. Resetting one counter SHALL NOT affect the other.

---

## 状態駆動条件 [STATE-DRIVEN]

1. REQ-S001: WHILE a group node `g{N}` exists in `FSM.nodes`, the `type` field of that node SHALL remain `"group"`. Updating its `name`, `x`, `y`, `width`, or `height` SHALL NOT change its `type`.

2. REQ-S002: WHILE a node has `parentId` set to a valid group ID, `removeNode()` called on that group SHALL reset the node's `parentId` to `null` before (or atomically with) deleting the group node. The child node SHALL remain in `FSM.nodes`.

---

## イベント駆動条件 [EVENT-DRIVEN]

1. REQ-E001: WHEN `genGroupId()` is called, the system SHALL increment `_groupIdCounter` by 1 and return the string `"g" + _groupIdCounter`.

2. REQ-E002: WHEN `addNode()` is called with `type: "group"`, the system SHALL use `genGroupId()` for the ID instead of `genId()`, and SHALL store `type: "group"` and the supplied `parentId` (defaulting to `null`) on the node object.

3. REQ-E003: WHEN `addNode()` is called without a `type` argument, the system SHALL default `type` to `"text"` and `parentId` to `null`.

4. REQ-E004: WHEN `fromJSON()` completes successfully, the system SHALL have recomputed both `_idCounter` (from `s{N}` nodes) and `_groupIdCounter` (from `g{N}` nodes) so that subsequent calls to `genId()` and `genGroupId()` produce IDs that do not collide with any loaded node.

5. REQ-E005: WHEN `removeNode(id)` is called and `id` belongs to a `"group"` node, the system SHALL iterate all nodes in `FSM.nodes` and set `parentId = null` on every node whose `parentId === id`, before deleting the group node itself.

---

## Advisory [ADV]

- **ADV-001** (backward-compatible undefined type): 既存の `s{N}` JSON ファイルには `type` フィールドが存在しない。`fromJSON()` でのロード時に `type: undefined` は受容し、エラーにしない（REQ-W005）。ただし UI レンダリング側では `type === "group"` か否かを判定すること。`undefined` はグループ枠を描かない通常ノードとして扱う。

- **ADV-002** (depth check cost): 循環参照・深度チェックは `fromJSON()` 実行時に全ノード分を O(N×depth) で走査する。ノード数が数百程度のキャンバスを想定しており、実用上の性能問題は生じない。ノード数が 1000 を超えるケースは本スコープ外とする。

- **ADV-003** (parentId on text nodes): `"text"` ノードも `parentId` を持てる（グループの子になれる）。ただし `"text"` ノードが他ノードの親になることは REQ-W002 で禁止している。

---

## 関連EARS

- EARS-002: グループ UX / レンダリング（グループ枠 SVG・グループ化ボタン）
- EARS-003: MCP グループサポート（`add_node` type/parentId 引数・`to_mermaid` subgraph 出力）
- EARS-006（既存）: ノード・エッジのデータスキーマ定義（本 EARS はその拡張）
- EARS-008（既存）: MCP write tools（`update_node` REQ-E006 の維持確認）
