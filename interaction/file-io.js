// ============================================================
// FILE-IO — File System Access API による Open / Save / Save As
// Chromium 系ブラウザのみ対象。polyfill なし。
// ============================================================

import FSM from '../core/fsm.js';
import { uiState } from '../core/state.js';
import { clearDirty } from '../ui/dirty.js';

// -------------------------------------------------------
// スキーマ検証: nodes / edges が配列で各要素に id があること
// -------------------------------------------------------
// @see EARS-006#REQ-W001
// @see EARS-007#REQ-S002
function validateSchema(data) {
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('JSON に nodes / edges 配列が存在しません。');
  }
  for (const n of data.nodes) {
    if (!n.id) throw new Error('node に id フィールドがありません。');
  }
  for (const e of data.edges) {
    if (!e.id) throw new Error('edge に id フィールドがありません。');
  }
}

// -------------------------------------------------------
// ヘッダーのファイル名バッジを更新するヘルパー
// -------------------------------------------------------
function updateFileNameBadge() {
  const badge = document.getElementById('fileNameBadge');
  if (badge) badge.textContent = uiState.fileName;
}

// -------------------------------------------------------
// ファイルへの書き込み共通処理
// -------------------------------------------------------
async function writeToHandle(handle) {
  const writable = await handle.createWritable();
  await writable.write(FSM.toJSON());
  await writable.close();
}

// -------------------------------------------------------
// Open
// -------------------------------------------------------
// @see EARS-005#REQ-E001
// @see EARS-005#REQ-E002
// @see EARS-005#REQ-E003
// @see EARS-005#REQ-W001
// @see EARS-007#REQ-S001
export async function openFile(renderFn, fitViewFn) {
  // @see EARS-005#REQ-W001
  if (uiState.isDirty) {
    const ok = confirm('未保存の変更があります。破棄して開きますか？');
    if (!ok) return;
  }
  let fileHandles;
  try {
    fileHandles = await window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
  } catch (e) {
    if (e.name === 'AbortError') return;
    alert('ファイルを開けませんでした: ' + e.message);
    return;
  }
  const handle = fileHandles[0];
  const file = await handle.getFile();
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // @see EARS-007#REQ-S001
    alert('JSON の構文エラーです。ファイルを確認してください。');
    return;
  }
  try {
    validateSchema(data);
  } catch (e) {
    // @see EARS-007#REQ-S002
    alert('スキーマエラー: ' + e.message);
    return;
  }
  // @see EARS-005#REQ-E002
  FSM.fromJSON(data);
  // @see EARS-005#REQ-E003
  uiState.fileHandle = handle;
  uiState.fileName = file.name;
  uiState.selectedNodeId = null;
  uiState.selectedEdgeId = null;
  clearDirty();
  updateFileNameBadge();
  renderFn();
  fitViewFn();
}

// -------------------------------------------------------
// Save
// -------------------------------------------------------
// @see EARS-005#REQ-S001
// @see EARS-005#REQ-S002
// @see EARS-007#REQ-S003
export async function saveFile(renderFn, fitViewFn) {
  // @see EARS-005#REQ-S002
  if (!uiState.fileHandle) {
    return saveFileAs(renderFn, fitViewFn);
  }
  try {
    // @see EARS-005#REQ-S001
    await writeToHandle(uiState.fileHandle);
    clearDirty();
  } catch (e) {
    if (e.name === 'AbortError') return;
    // @see EARS-007#REQ-S003
    alert('保存できませんでした。Save As で別ファイルを選択してください。');
  }
}

// -------------------------------------------------------
// Save As
// -------------------------------------------------------
// @see EARS-005#REQ-E004
// @see EARS-005#REQ-E005
export async function saveFileAs(renderFn, fitViewFn) {
  let handle;
  try {
    handle = await window.showSaveFilePicker({
      suggestedName: uiState.fileName,
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
  } catch (e) {
    if (e.name === 'AbortError') return;
    alert('ファイルを選択できませんでした: ' + e.message);
    return;
  }
  try {
    await writeToHandle(handle);
  } catch (e) {
    alert('保存できませんでした。Save As で別ファイルを選択してください。');
    return;
  }
  uiState.fileHandle = handle;
  uiState.fileName = handle.name;
  clearDirty();
  updateFileNameBadge();
}
