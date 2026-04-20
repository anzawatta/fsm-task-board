// ============================================================
// UTILS — 汎用ユーティリティ
// ============================================================

// @see EARS-007#REQ-U001
// @see EARS-007#REQ-W001
export function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
