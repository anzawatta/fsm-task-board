// ============================================================
// MAIN — エントリーポイント
// モジュール間の配線と初期化のみ担当。
// ビジネスロジック・DOM操作・イベント処理は各層に委譲。
// ============================================================

import FSM from './core/fsm.js';
import { render, applyView, fitView } from './ui/renderer.js';
import { initEvents, toggleEdgeMode, toggleShowIds, addNode, selectEdge,
         updateNodeName, updateNodeSize, setStatus, updateEdgeLabel,
         deleteSelectedNode, deleteSelectedEdge,
         addDoDFromInput, toggleDoD, removeDoDItem, toggleDoDType,
         groupSelectedNodes } from './interaction/events.js';
import { openFile, saveFile, saveFileAs, reloadFromHandle } from './interaction/file-io.js';
import { initBeforeUnload } from './ui/dirty.js';

// -------------------------------------------------------
// panel.js の innerHTML inline-handler から呼ばれる関数群を
// window.__fsm に束ねる。
// (型安全にしたければ TypeScript 化時に解消)
// -------------------------------------------------------
window.__fsm = {
  selectEdge,
  updateNodeName,
  updateNodeSize,
  setStatus,
  updateEdgeLabel,
  deleteSelectedNode,
  deleteSelectedEdge,
  addDoDFromInput,
  toggleDoD,
  removeDoDItem,
  toggleDoDType,
};

// -------------------------------------------------------
// toolbar の onclick から呼ばれる関数を window に公開
// -------------------------------------------------------
window.addNode             = addNode;
window.toggleEdgeMode      = toggleEdgeMode;
window.toggleShowIds       = toggleShowIds;
window.fitView             = fitView;
// @see EARS-011#REQ-E001
window.groupSelectedNodes  = groupSelectedNodes;
window.openFile          = () => openFile(render, fitView);
window.saveFile          = () => saveFile(render, fitView);
window.saveFileAs        = () => saveFileAs(render, fitView);
window.reloadFromHandle  = () => reloadFromHandle(render, fitView);

// -------------------------------------------------------
// 初期化
// -------------------------------------------------------
function init() {
  // イベント初期化 (render / applyView を注入)
  initEvents(render, applyView);

  // 未保存警告
  initBeforeUnload();

  // 初期データ
  const s1 = FSM.addNode('Node',  300,  50);

  FSM.addDoDItem(s1, 'verification1',   'verification');

  render();
  setTimeout(fitView, 100);
  // init完了時点はclean状態
}

init();
