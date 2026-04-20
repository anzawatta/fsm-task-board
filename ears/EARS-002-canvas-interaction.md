# EARS-002: Canvas Interaction

**Status:** Active
**Date:** 2026-04-20

キャンバス操作（パン・Fit View）・要素の選択とハイライトに関する要件。

---

## 不変条件

1. REQ-U001: The system SHALL render nodes and edges on an SVG canvas using internally computed layout, without external graph libraries
2. REQ-U002: At most one node OR one edge SHALL be in the selected state at any time

## State-driven requirements

1. REQ-S001: While a node is selected, the system SHALL visually highlight it on the canvas
2. REQ-S002: While an edge is selected, the system SHALL visually highlight it on the canvas
3. REQ-S003: While a node is selected, the system SHALL show its details in the side panel
4. REQ-S004: While an edge is selected, the system SHALL show its details in the side panel
5. REQ-S005: While no element is selected, the system SHALL show a placeholder message in the side panel

## Event-driven requirements

1. REQ-E001: When the user clicks a node, the system SHALL select it and deselect any previously selected element
2. REQ-E002: When the user clicks an edge, the system SHALL select it and deselect any previously selected element
3. REQ-E003: When the user clicks an empty area of the canvas, the system SHALL deselect any currently selected element
4. REQ-E004: When the user presses Escape (outside edge-creation mode), the system SHALL deselect any currently selected element
5. REQ-E005: When the user drags the canvas background, the system SHALL pan the viewport by updating `viewOffset`
6. REQ-E006: When the user clicks "Fit View", the system SHALL compute the bounding box of all nodes and adjust `viewOffset` and `viewScale` so all nodes fit within the visible area
