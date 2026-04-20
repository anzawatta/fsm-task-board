# EARS-003: Task State

**Status:** Active
**Date:** 2026-04-20

ノードのステータス管理と DoD（受け入れ条件）チェックリストに関する要件。

---

## 不変条件

1. REQ-U001: Node `status` SHALL be one of: `null` (未着手), `"wip"` (実装中), `"done"` (完了)
2. REQ-U002: Each DoD item SHALL have `text` (string), `type` (string), and `done` (boolean) fields
3. REQ-U003: DoD `type` SHALL be one of: `"existence"` or `"behavioral"`

## 敵対条件

1. REQ-W001: System SHALL NOT accept `status` values other than `null`, `"wip"`, or `"done"`
2. REQ-W002: System SHALL NOT accept DoD `type` values other than `"existence"` or `"behavioral"`

## State-driven requirements

1. REQ-S001: While a node has `status: "wip"`, the system SHALL display a WIP indicator icon on that node
2. REQ-S002: While a node has `status: "done"`, the system SHALL display a DONE indicator icon on that node

## Event-driven requirements

1. REQ-E001: When the user clicks a status button in the side panel, the system SHALL update the selected node's `status` and re-render its icon
2. REQ-E002: When the user clicks "+ Add DoD" in the side panel, the system SHALL append a new DoD item with empty `text` and `type: "existence"` to the selected node
3. REQ-E003: When the user edits a DoD item's text field, the system SHALL update the corresponding item's `text`
4. REQ-E004: When the user changes the DoD type selector, the system SHALL update the item's `type`
5. REQ-E005: When the user toggles a DoD item's checkbox, the system SHALL flip its `done` boolean
6. REQ-E006: When the user clicks the delete button of a DoD item, the system SHALL remove that item from the node's DoD list
