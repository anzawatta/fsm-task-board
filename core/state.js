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
  // @see EARS-011#REQ-U005
  // Why: selectedNodeIds is a Set of node IDs for multi-select, used by the
  // "グループ化" button.  selectedNodeId (single) is kept for backward compat
  // with panel.js / renderer highlight logic.
  selectedNodeIds: new Set(),
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
  // Why: ボード上にノード ID を可視化するデバッグ向けトグル。
  // 既定 off — 通常の閲覧ノイズにならないようにする。
  showIds:        false,
};
