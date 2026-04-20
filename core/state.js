// ============================================================
// UI STATE — グローバル状態オブジェクト
// interaction / ui 層が参照・更新する共有状態。
// ============================================================

// @see EARS-002#REQ-U002
// @see EARS-005#REQ-U001
// @see EARS-005#REQ-W002
export const uiState = {
  selectedNodeId: null,
  selectedEdgeId: null,
  edgeMode:       false,
  edgeModeSource: null,
  dragging:       null,
  panState:       null,
  viewOffset:     { x: 0, y: 0 },
  viewScale:      1,
  isDirty:        false,
  resizing:       null,
  fileHandle:     null,
  fileName:       'untitled',
};
