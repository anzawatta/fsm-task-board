// ============================================================
// UI STATE — グローバル状態オブジェクト
// interaction / ui 層が参照・更新する共有状態。
// ============================================================

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
  resizing: null,
};
