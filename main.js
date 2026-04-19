// ============================================================
// MAIN — エントリーポイント
// モジュール間の配線と初期化のみ担当。
// ビジネスロジック・DOM操作・イベント処理は各層に委譲。
// ============================================================

import FSM from './core/fsm.js';
import { render, applyView, fitView } from './ui/renderer.js';
import { initEvents, toggleEdgeMode, addNode, selectEdge,
         updateNodeName, updateNodeSize, setStatus, updateEdgeLabel,
         deleteSelectedNode, deleteSelectedEdge,
         addDoDFromInput, toggleDoD, removeDoDItem, toggleDoDType } from './interaction/events.js';
import { openFile, saveFile, saveFileAs } from './interaction/file-io.js';
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
window.addNode        = addNode;
window.toggleEdgeMode = toggleEdgeMode;
window.fitView        = fitView;
window.openFile       = () => openFile(render, fitView);
window.saveFile       = () => saveFile(render, fitView);
window.saveFileAs     = () => saveFileAs(render, fitView);

// -------------------------------------------------------
// 初期化
// -------------------------------------------------------
function init() {
  // イベント初期化 (render / applyView を注入)
  initEvents(render, applyView);

  // 未保存警告
  initBeforeUnload();

  // サンプルデータ (PDCA)
  const s1 = FSM.addNode('Plan',  300,  50);
  const s2 = FSM.addNode('Do',    300, 300);
  const s3 = FSM.addNode('Check', 600, 300);
  const s4 = FSM.addNode('Act',   600,  50);

  FSM.addEdge(s1, s2, 'plan');
  FSM.addEdge(s2, s3, 'do');
  FSM.addEdge(s2, s2, 'do');
  FSM.addEdge(s3, s4, 'check');
  FSM.addEdge(s4, s1, 'act');

  FSM.addDoDItem(s1, 'verification1',   'verification');
  FSM.addDoDItem(s1, 'validation1',     'validation');
  FSM.addDoDItem(s2, 'verification2',   'verification');
  FSM.addDoDItem(s2, 'validation2',     'validation');
  FSM.addDoDItem(s3, 'verification3-1', 'verification');
  FSM.addDoDItem(s3, 'verification3-2', 'verification');
  FSM.addDoDItem(s4, 'validation4-1',   'verification');
  FSM.addDoDItem(s4, 'validation4-2',   'validation');

  render();
  setTimeout(fitView, 100);
  // init完了時点はclean状態
}

init();
