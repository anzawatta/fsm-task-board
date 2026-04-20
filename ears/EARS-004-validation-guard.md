# EARS-004: Validation Guard

**Status:** Active
**Date:** 2026-04-20

Guard 付きエッジの遷移制約に関する要件。
`behavioral` 型 DoD が未完了のノードからの遷移を構造的に防止する。

---

## 不変条件

1. REQ-U001: An edge with `guardCondition: "dod_complete"` SHALL only be traversable when **all** `behavioral` DoD items on the source node have `done: true`

## 敵対条件

1. REQ-W001: System SHALL NOT allow traversal of a guarded edge when the source node has any `behavioral` DoD item with `done: false`
2. REQ-W002: System SHALL NOT render a locked edge with the same visual style as an unlocked edge

## State-driven requirements

1. REQ-S001: While an edge has `guardCondition: "dod_complete"` and the source node has at least one `behavioral` DoD item with `done: false`, the system SHALL render the edge with a distinct locked style (bold stroke + lock label) and SHALL ignore click events on it
2. REQ-S002: While an edge has `guardCondition: "dod_complete"` and all `behavioral` DoD items on the source node have `done: true`, the system SHALL render the edge as traversable and allow click interaction

## Event-driven requirements

1. REQ-E001: When the user toggles the "Guard" checkbox in the edge details panel, the system SHALL set `guardCondition: "dod_complete"` or remove it from the selected edge
