# EARS-001: Graph Editing

**Status:** Active
**Date:** 2026-04-20

ノード・エッジの追加・編集・削除・移動に関する要件。

---

## 不変条件

1. REQ-U001: Each node SHALL have a unique ID within the FSM (`s0`, `s1`, ...)
2. REQ-U002: Each edge SHALL reference a `fromNode` and `toNode` that both exist in the FSM

## 敵対条件

1. REQ-W001: System SHALL NOT retain edges whose `fromNode` or `toNode` no longer exists after node deletion
2. REQ-W002: System SHALL NOT assign duplicate IDs to nodes
3. REQ-W003: System SHALL NOT assign duplicate IDs to edges

## State-driven requirements

1. REQ-S001: While in edge-creation mode, when the user clicks a source node, the system SHALL record it as edge start and highlight it
2. REQ-S002: While in edge-creation mode, when the user clicks a target node different from the source, the system SHALL create a new edge and exit edge-creation mode
3. REQ-S003: While in edge-creation mode, when the user presses Escape, the system SHALL cancel creation and exit edge-creation mode

## Event-driven requirements

1. REQ-E001: When the user clicks "+ Node", the system SHALL add a new node with a default name at a default position
2. REQ-E002: When the user double-clicks a node name label, the system SHALL make the name field inline-editable
3. REQ-E003: When the user clicks "+ Edge", the system SHALL enter edge-creation mode
4. REQ-E004: When the user double-clicks an edge label, the system SHALL make the label inline-editable
5. REQ-E005: When the user presses Delete while a node is selected, the system SHALL delete that node and all edges connected to it
6. REQ-E006: When the user presses Delete while an edge is selected, the system SHALL delete that edge
7. REQ-E007: When the user drags a node, the system SHALL update its `(x, y)` in real-time and re-render connected edges
8. REQ-E008: When the user drags the resize handle of a node, the system SHALL update the node's `width` and `height`
