# EARS-002: グループ UX / レンダリング

**Status:** Draft
**Date:** 2026-06-09
**Ward:** fsm-task-board

ブラウザ UI 上でのグループ化操作（作成・選択・移動・削除）と、SVG キャンバスへのグループ枠描画に関する要件。
アクターはブラウザユーザー。MCP 側の要件は EARS-003 が担当する。

---

## 不変条件 [INV]

1. REQ-U001: THE SYSTEM SHALL render group nodes as a distinct visual frame (SVG `<rect>`) drawn behind member nodes in the SVG layer order, so that member nodes remain fully visible above the group frame.

2. REQ-U002: THE SYSTEM SHALL display the group name as a text label positioned at the top-left of the group frame.

3. REQ-U003: THE SYSTEM SHALL support click-selection, drag-move, and delete operations on group nodes using the same interaction paths as text nodes. No separate code path for group-specific pointer events is required.

4. REQ-U004: THE SYSTEM SHALL re-render the group frame (position and size) on every full redraw (`render()` call) based on the current stored `x`, `y`, `width`, and `height` of the group node. The renderer SHALL NOT cache group frame geometry between renders.

5. REQ-U005: THE SYSTEM SHALL provide a "グループ化" (Group) button in the toolbar that is enabled only when two or more nodes are selected.

---

## 敵対条件 [UNWANTED]

1. REQ-W001: THE SYSTEM SHALL NOT create a group node when fewer than two nodes are selected. Clicking the "グループ化" button with zero or one selected node SHALL produce an `alert()` notification and take no further action.

2. REQ-W002: THE SYSTEM SHALL NOT cascade-delete child nodes when a group node is deleted. Deleting a group node SHALL only reset the `parentId` of its children to `null` (orphan behavior per EARS-001 REQ-E005).

3. REQ-W003: THE SYSTEM SHALL NOT allow a group node to be created with a `parentId` pointing to another group if that assignment would cause the nesting depth to exceed 3 (EARS-001 REQ-U005). The system SHALL display an `alert()` and abort group creation.

4. REQ-W004: THE SYSTEM SHALL NOT change the SVG full-redraw strategy. Group frames SHALL be rendered within the existing `render()` → `renderGroups()` → `renderNodes()` → `renderEdges()` pipeline, with `innerHTML = ''` clearing the groups layer on each redraw.

5. REQ-W005: THE SYSTEM SHALL NOT expose a new global function or window property for group operations beyond what is already managed in `main.js`.

---

## 状態駆動条件 [STATE-DRIVEN]

1. REQ-S001: WHILE a group node is selected (`uiState.selectedNodeId === groupId`), the group frame SHALL be rendered with the selected visual indicator (matching the existing `node-selected` CSS class behavior applied to text nodes).

2. REQ-S002: WHILE `isDirty` is `false` and a group creation completes successfully (new group node added, children's `parentId` updated), `isDirty` SHALL be set to `true` — identical to the dirty-marking behavior triggered by any other node mutation.

---

## イベント駆動条件 [EVENT-DRIVEN]

1. REQ-E001: WHEN the user clicks the "グループ化" button with two or more nodes selected, the system SHALL:
   a. Call `FSM.addNode()` with `type: "group"` to create a new `g{N}` node.
   b. Set `parentId` on each selected node to the new group's ID.
   c. Call `render()` to redraw the canvas.
   d. Mark `isDirty = true`.

2. REQ-E002: WHEN the user deletes a group node (via keyboard or toolbar delete action), the system SHALL call `FSM.removeNode(groupId)`, which resets children's `parentId` to `null` per EARS-001 REQ-E005, then call `render()`.

3. REQ-E003: WHEN `renderGroups()` is called during a full redraw, the system SHALL iterate all nodes whose `type === "group"`, and for each, append an SVG `<g>` element containing a `<rect>` and a `<text>` label to a dedicated SVG group layer that is ordered below the nodes layer (`nodesGroup`).

4. REQ-E004: WHEN a group node is drag-moved by the user, the system SHALL update the group node's `x` and `y` in `FSM.nodes`, apply the same delta (`dx`, `dy`) to the `x`/`y` of every node whose `parentId` equals the moved group's ID, and call `render()`.

5. REQ-E005: WHEN `render()` is called, the system SHALL execute `renderGroups()` before `renderNodes()` so that group frames are drawn beneath node bodies in the SVG paint order.

---

## Advisory [ADV]

- **ADV-001** (group frame visual design): グループ枠の線種（破線 vs 実線）・色・opacity は Gray zone（task-scaffold.md 参照）。実装前にユーザー確認が必要。仮実装として `stroke-dasharray` 付きの薄色 `<rect>` を使うことを推奨するが、確定値は別途記録すること。

- **ADV-002** (group member coordinate ownership): ~~Gray zone~~ **解決済み（2026-06-09）**。グループ移動時は子ノード座標を追従させる（delta 加算）。REQ-E004 に反映済み。

- **ADV-003** (multi-select UX): 現行の `uiState.selectedNodeId` は単一 ID のみ保持している。グループ化ボタンの有効化判定および「選択中ノード群」の収集方法は、既存 multi-select 実装の有無に応じて Phase 2 実装者が判断する。Gray zone 判定が必要な場合は止まること。

---

## 関連EARS

- EARS-001: ノードスキーマ拡張（`type` / `parentId` / `_groupIdCounter` / バリデーション）
- EARS-003: MCP グループサポート（UI 側と対称な削除時孤立化ルール）
- EARS-002（既存）: ブラウザ UI インタラクション全般（本 EARS はその拡張）
