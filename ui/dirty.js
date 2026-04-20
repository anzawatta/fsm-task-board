// ============================================================
// DIRTY — 未保存状態の管理
// ============================================================

import { uiState } from '../core/state.js';

// @see EARS-005#REQ-U001
// @see EARS-005#REQ-U003
export function markDirty() {
  uiState.isDirty = true;
  document.getElementById('dirtyBadge').classList.add('visible');
}

// @see EARS-005#REQ-U002
export function clearDirty() {
  uiState.isDirty = false;
  document.getElementById('dirtyBadge').classList.remove('visible');
}

// @see EARS-005#REQ-S003
export function initBeforeUnload() {
  window.addEventListener('beforeunload', e => {
    if (!uiState.isDirty) return;
    e.preventDefault();
    e.returnValue = '';
  });
}
