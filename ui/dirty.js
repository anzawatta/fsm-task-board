// ============================================================
// DIRTY — 未保存状態の管理
// ============================================================

import { uiState } from '../core/state.js';

export function markDirty() {
  uiState.isDirty = true;
  document.getElementById('dirtyBadge').classList.add('visible');
}

export function clearDirty() {
  uiState.isDirty = false;
  document.getElementById('dirtyBadge').classList.remove('visible');
}

export function initBeforeUnload() {
  window.addEventListener('beforeunload', e => {
    if (!uiState.isDirty) return;
    e.preventDefault();
    e.returnValue = '';
  });
}
