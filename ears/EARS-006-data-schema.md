# EARS-006: Data Schema

**Status:** Active
**Date:** 2026-04-20

FSM グラフの JSON シリアライズ形式・後方互換・ID 管理に関する要件。

---

## 不変条件

1. REQ-U001: Serialized FSM SHALL have top-level keys `nodes` (array) and `edges` (array)
2. REQ-U002: Each serialized node SHALL include: `id`, `x`, `y`, `width`, `height`, `name`, `status`, `dod`
3. REQ-U003: Each serialized edge SHALL include: `id`, `fromNode`, `toNode`, `label`; `guardCondition` is optional
4. REQ-U004: After deserialization, `_idCounter` SHALL be set to `max(existing node numeric IDs) + 1` to prevent ID collisions
5. REQ-U005: After deserialization, `_edgeIdCounter` SHALL be set to `max(existing edge numeric IDs) + 1` to prevent ID collisions

## 敵対条件

1. REQ-W001: System SHALL NOT silently accept JSON whose top-level `nodes` or `edges` value is not an array — it SHALL report a schema error and abort
2. REQ-W002: System SHALL NOT generate a node or edge ID that already exists in the current FSM

## Event-driven requirements

1. REQ-E001: When loading JSON, the system SHALL accept legacy field aliases for backward compatibility: `states` → `nodes`, `from` → `fromNode`, `to` → `toNode`
