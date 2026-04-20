# EARS-005: File I/O

**Status:** Active
**Date:** 2026-04-20

ファイルの Open / Save / Save As・Dirty フラグ・未保存警告に関する要件。
File System Access API (Chromium 専用) を使用する。

---

## 不変条件

1. REQ-U001: `isDirty` SHALL be set to `true` whenever any FSM state changes (node/edge add/delete/edit, DoD change, status change)
2. REQ-U002: After a successful open or save, `isDirty` SHALL be `false`
3. REQ-U003: The filename badge in the toolbar SHALL display a `*` prefix when `isDirty` is `true`

## 敵対条件

1. REQ-W001: System SHALL NOT discard unsaved changes without explicit user confirmation
2. REQ-W002: System SHALL NOT expose `FileSystemFileHandle` to the `window` global scope; it SHALL be held only in `uiState.fileHandle`
3. REQ-W003: System SHALL NOT proceed with file operations in browsers that lack File System Access API — it SHALL alert the user and abort

## State-driven requirements

1. REQ-S001: While `fileHandle` is held, when Save is triggered, the system SHALL write directly to the existing file without showing a dialog
2. REQ-S002: While `fileHandle` is not held, when Save is triggered, the system SHALL fall back to Save As behavior
3. REQ-S003: While `isDirty` is `true`, when the user attempts to leave the page, the system SHALL trigger a browser `beforeunload` warning

## Event-driven requirements

1. REQ-E001: When the user clicks "Open", the system SHALL display the OS file picker dialog filtered to `.json`
2. REQ-E002: When a JSON file is selected via Open, the system SHALL read it, parse it via `FSM.fromJSON()`, and update the canvas
3. REQ-E003: When a file is successfully opened, the system SHALL store the `FileSystemFileHandle`, update the filename badge, and clear `isDirty`
4. REQ-E004: When the user clicks "Save As", the system SHALL display the OS file save dialog and write the FSM JSON to the chosen file
5. REQ-E005: When a file is successfully saved, the system SHALL update `fileHandle`, update the filename badge, and clear `isDirty`
