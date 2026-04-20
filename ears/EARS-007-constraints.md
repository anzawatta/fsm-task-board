# EARS-007: Constraints

**Status:** Active
**Date:** 2026-04-20

セキュリティ・エラーハンドリング・アーキテクチャ制約に関する要件。
機能要件ではなく「やってはいけないこと・常に満たすべきこと」を定義する。

---

## 不変条件

1. REQ-U001: The system SHALL escape all user-provided text via `escapeHtml()` before inserting it into the DOM
2. REQ-U002: `core/fsm.js` SHALL have no DOM dependencies and SHALL be independently testable
3. REQ-U003: The system SHALL operate without any external JavaScript framework (no React, Vue, etc.)
4. REQ-U004: The system SHALL provide a committed sample data file so that a fresh clone has working initial state
5. REQ-U005: The system SHALL render the graph using SVG computed entirely within the application, without external graph layout libraries

## 敵対条件

1. REQ-W001: System SHALL NOT insert unescaped user-provided text into the DOM
2. REQ-W002: System SHALL NOT expose `FileSystemFileHandle` to the `window` global scope
3. REQ-W003: System SHALL NOT depend on external graph layout libraries (e.g., Dagre, ELK) for node/edge positioning

## State-driven requirements (error handling)

1. REQ-S001: If loaded JSON contains invalid syntax, the system SHALL display an error alert and abort without modifying the current FSM state
2. REQ-S002: If loaded JSON fails schema validation (`nodes`/`edges` not arrays), the system SHALL display a schema error alert and abort
3. REQ-S003: If file write permission is denied by the browser, the system SHALL display an alert and suggest using "Save As"
4. REQ-S004: Where the browser does not support File System Access API, the system SHALL notify the user with an alert and abort the file operation
