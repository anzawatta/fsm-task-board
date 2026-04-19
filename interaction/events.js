// ============================================================
// EVENTS — イベントハンドラ層
// イベント委譲（Event Delegation）パターンを採用。
// renderer.js との循環依存を回避するため、
// nodesGroup / edgesGroup に対してまとめてリスナーを設定する。
// ============================================================

import FSM from '../core/fsm.js';
import { uiState } from '../core/state.js';
import { markDirty } from '../ui/dirty.js';
import { DEFAULT_NODE_W, DEFAULT_NODE_H } from '../core/fsm.js';

// render / applyView / fitView は main.js から注入
let _render    = null;
let _applyView = null;

export function initEvents(renderFn, applyViewFn) {
  _render    = renderFn;
  _applyView = applyViewFn;

  // ノードグループへの委譲リスナー
  const ng = document.getElementById('nodesGroup');
  ng.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (uiState.edgeMode) return;

    // リサイズハンドルの判定（先に処理）
    if (e.target.classList.contains('resize-handle')) {
      e.stopPropagation();
      const nodeId = e.target._resizeNodeId || e.target.closest('.fsm-node')._nodeId;
      const node = FSM.nodes[nodeId];
      uiState.resizing = {
        id: nodeId,
        startX: e.clientX, startY: e.clientY,
        origW: node.width, origH: node.height
      };
      return;
    }

    const g = e.target.closest('.fsm-node');
    if (!g) return;
    e.stopPropagation();
    const id = g._nodeId;
    uiState.dragging = {
      id,
      startX: e.clientX, startY: e.clientY,
      origX: FSM.nodes[id].x, origY: FSM.nodes[id].y,
      moved: false
    };
  });

  ng.addEventListener('click', e => {
    const g = e.target.closest('.fsm-node');
    if (!g) return;
    e.stopPropagation();
    onNodeClick(g._nodeId);
  });

  ng.addEventListener('contextmenu', e => {
    const g = e.target.closest('.fsm-node');
    if (!g) return;
    e.preventDefault();
    e.stopPropagation();
    selectNode(g._nodeId);
    showContextMenu(e.clientX, e.clientY, nodeContextItems(g._nodeId));
  });

  // エッジグループへの委譲リスナー
  const eg = document.getElementById('edgesGroup');
  eg.addEventListener('click', e => {
    const g = e.target.closest('.fsm-edge');
    if (!g) return;
    e.stopPropagation();
    const edgeId = g._edgeId;
    const edge   = FSM.edges[edgeId];
    // guard チェック: dod_complete の場合は source が done でないとブロック
    if (edge && edge.guard === 'dod_complete') {
      const srcNode = FSM.nodes[edge.fromNode];
      if (srcNode && srcNode.status !== 'done') {
        alert(`遷移ブロック: "${srcNode.name}" が完了 (done) ではありません。\nguard: ${edge.guard}`);
        return;
      }
    }
    selectEdge(edgeId);
  });

  eg.addEventListener('contextmenu', e => {
    const g = e.target.closest('.fsm-edge');
    if (!g) return;
    e.preventDefault();
    e.stopPropagation();
    selectEdge(g._edgeId);
    showContextMenu(e.clientX, e.clientY, edgeContextItems(g._edgeId));
  });

  // キャンバスのパン
  const canvas = document.getElementById('canvas');

  canvas.addEventListener('mousedown', e => {
    const svgEl = document.getElementById('svgCanvas');
    if (e.target === canvas || e.target === svgEl || e.target.tagName === 'svg') {
      if (uiState.edgeMode) {
        if (uiState.edgeModeSource) uiState.edgeModeSource = null;
        return;
      }
      uiState.panState = {
        startX: e.clientX, startY: e.clientY,
        origOffX: uiState.viewOffset.x,
        origOffY: uiState.viewOffset.y
      };
    }
  });

  canvas.addEventListener('click', e => {
    const svgEl = document.getElementById('svgCanvas');
    const isBackground =
      e.target === canvas ||
      e.target === svgEl  ||
      (e.target.closest('svg') === svgEl &&
       !e.target.closest('.fsm-node') &&
       !e.target.closest('.fsm-edge'));
    if (isBackground && !uiState.edgeMode && !uiState.panState) {
      deselect();
    }
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const delta    = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.2, Math.min(3, uiState.viewScale * delta));
    const rect     = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    uiState.viewOffset.x = mx - (mx - uiState.viewOffset.x) * (newScale / uiState.viewScale);
    uiState.viewOffset.y = my - (my - uiState.viewOffset.y) * (newScale / uiState.viewScale);
    uiState.viewScale    = newScale;
    _applyView();
  }, { passive: false });

  // グローバル mousemove / mouseup
  document.addEventListener('mousemove', e => {
    if (uiState.resizing) {
      const dx = (e.clientX - uiState.resizing.startX) / uiState.viewScale;
      const dy = (e.clientY - uiState.resizing.startY) / uiState.viewScale;
      const node = FSM.nodes[uiState.resizing.id];
      if (node) {
        node.width  = Math.max(80, uiState.resizing.origW + dx * 2);
        node.height = Math.max(40, uiState.resizing.origH + dy * 2);
        _render();
      }
      return;
    }
    if (uiState.dragging) {
      const dx = (e.clientX - uiState.dragging.startX) / uiState.viewScale;
      const dy = (e.clientY - uiState.dragging.startY) / uiState.viewScale;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) uiState.dragging.moved = true;
      FSM.nodes[uiState.dragging.id].x = uiState.dragging.origX + dx;
      FSM.nodes[uiState.dragging.id].y = uiState.dragging.origY + dy;
      _render();
    }
    if (uiState.panState) {
      uiState.viewOffset.x = uiState.panState.origOffX + (e.clientX - uiState.panState.startX);
      uiState.viewOffset.y = uiState.panState.origOffY + (e.clientY - uiState.panState.startY);
      _applyView();
    }
  });

  document.addEventListener('mouseup', () => {
    if (uiState.resizing) { markDirty(); uiState.resizing = null; }
    if (uiState.dragging && uiState.dragging.moved) markDirty();
    uiState.dragging = null;
    uiState.panState = null;
  });

  // キーボード
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (uiState.edgeMode) toggleEdgeMode();
      document.getElementById('contextMenu').classList.remove('active');
      if (document.getElementById('modalOverlay').classList.contains('active')) {
        document.getElementById('modalOverlay').classList.remove('active');
      }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (uiState.selectedNodeId) deleteSelectedNode();
      if (uiState.selectedEdgeId) deleteSelectedEdge();
    }
  });

  // コンテキストメニュー閉じ
  document.addEventListener('click', () => {
    document.getElementById('contextMenu').classList.remove('active');
  });
}

// -------------------------------------------------------
// Selection
// -------------------------------------------------------

export function selectNode(id) {
  uiState.selectedNodeId = id;
  uiState.selectedEdgeId = null;
  _render();
}

export function selectEdge(id) {
  uiState.selectedEdgeId = id;
  uiState.selectedNodeId = null;
  _render();
}

export function deselect() {
  uiState.selectedNodeId = null;
  uiState.selectedEdgeId = null;
  _render();
}

// -------------------------------------------------------
// Node click (edge mode 対応)
// -------------------------------------------------------

function onNodeClick(id) {
  if (uiState.edgeMode) {
    if (!uiState.edgeModeSource) {
      uiState.edgeModeSource = id;
      document.getElementById('edgeModeBanner').textContent =
        `Edge: ${FSM.nodes[id].name} → ? (click target)  |  ESC to cancel`;
    } else {
      FSM.addEdge(uiState.edgeModeSource, id, '');
      uiState.edgeModeSource = null;
      markDirty();
      toggleEdgeMode();
      _render();
    }
  } else {
    selectNode(id);
  }
}

// -------------------------------------------------------
// Edge Mode
// -------------------------------------------------------

export function toggleEdgeMode() {
  uiState.edgeMode       = !uiState.edgeMode;
  uiState.edgeModeSource = null;
  document.getElementById('edgeModeBtn').classList.toggle('btn-accent', uiState.edgeMode);
  document.getElementById('edgeModeBanner').classList.toggle('active', uiState.edgeMode);
  document.getElementById('canvas').style.cursor = uiState.edgeMode ? 'crosshair' : 'grab';
}

// -------------------------------------------------------
// CRUD actions (panel の onclick から window.__fsm 経由で呼ばれる)
// -------------------------------------------------------

export function addNode() {
  const canvasRect = document.getElementById('canvas').getBoundingClientRect();
  const x = (canvasRect.width  / 2 - uiState.viewOffset.x) / uiState.viewScale;
  const y = (canvasRect.height / 2 - uiState.viewOffset.y) / uiState.viewScale;
  const id = FSM.addNode(
    'New Node',
    x + (Math.random() - 0.5) * 60,
    y + (Math.random() - 0.5) * 40
  );
  markDirty();
  selectNode(id);
  setTimeout(() => {
    const input = document.querySelector('#panelContent .field-input');
    if (input) { input.focus(); input.select(); }
  }, 50);
}

export function updateNodeName(id, name) {
  if (FSM.nodes[id]) {
    FSM.nodes[id].name = name;
    markDirty();
    _render();
  }
}

export function updateNodeSize(id, w, h) {
  const node = FSM.nodes[id];
  if (!node) return;
  if (w !== null && w !== undefined) node.width  = Math.max(80,  parseInt(w) || DEFAULT_NODE_W);
  if (h !== null && h !== undefined) node.height = Math.max(40,  parseInt(h) || DEFAULT_NODE_H);
  markDirty();
  _render();
}

export function setStatus(id, status) {
  if (FSM.nodes[id]) {
    if (status === 'done') {
      const uncheckedValidation = FSM.nodes[id].dod.filter(d => d.type === 'validation' && !d.checked).length;
      if (uncheckedValidation > 0 || FSM.hasUncheckedVerification(id)) {
        if (!confirm('DoDが未チェックです。完了にしますか？')) return;
      }
    }
    FSM.nodes[id].status = status;
    markDirty();
    _render();
  }
}

export function updateEdgeLabel(id, label) {
  if (FSM.edges[id]) {
    FSM.edges[id].label = label;
    markDirty();
    _render();
  }
}

export function deleteSelectedNode() {
  if (uiState.selectedNodeId) {
    FSM.removeNode(uiState.selectedNodeId);
    uiState.selectedNodeId = null;
    markDirty();
    _render();
  }
}

export function deleteSelectedEdge() {
  if (uiState.selectedEdgeId) {
    FSM.removeEdge(uiState.selectedEdgeId);
    uiState.selectedEdgeId = null;
    markDirty();
    _render();
  }
}

export function addDoDFromInput(nodeId) {
  const input  = document.getElementById('dodAddInput');
  const select = document.getElementById('dodTypeSelect');
  if (!input || !input.value.trim()) return;
  FSM.addDoDItem(nodeId, input.value.trim(), select.value);
  markDirty();
  _render();
  setTimeout(() => {
    const newInput = document.getElementById('dodAddInput');
    if (newInput) newInput.focus();
  }, 50);
}

export function toggleDoD(nodeId, dodId) {
  const node = FSM.nodes[nodeId];
  if (!node) return;
  const item = node.dod.find(d => d.id === dodId);
  if (item) {
    item.checked = !item.checked;
    if (FSM.allValidationChecked(nodeId) && !FSM.hasUncheckedVerification(nodeId) && FSM.allDoDChecked(nodeId)) {
      node.status = 'done';
    }
    markDirty();
    _render();
  }
}

export function toggleDoDType(nodeId, dodId) {
  const node = FSM.nodes[nodeId];
  if (!node) return;
  const item = node.dod.find(d => d.id === dodId);
  if (item) {
    item.type = item.type === 'validation' ? 'verification' : 'validation';
    FSM.updateDoDItemType(nodeId, dodId, item.type);
    markDirty();
    _render();
  }
}

export function removeDoDItem(nodeId, dodId) {
  FSM.removeDoDItem(nodeId, dodId);
  markDirty();
  _render();
}

// -------------------------------------------------------
// Context Menu
// -------------------------------------------------------

function nodeContextItems(id) {
  return [
    { label: 'ステータス: 未実施', action: () => setStatus(id, 'idle') },
    { label: 'ステータス: 作業中', action: () => setStatus(id, 'wip')  },
    { label: 'ステータス: 完了',   action: () => setStatus(id, 'done') },
    { type: 'separator' },
    { label: '削除', danger: true, action: () => {
        FSM.removeNode(id);
        uiState.selectedNodeId = null;
        _render();
    }}
  ];
}

function edgeContextItems(id) {
  return [
    { label: '削除', danger: true, action: () => {
        FSM.removeEdge(id);
        uiState.selectedEdgeId = null;
        _render();
    }}
  ];
}

export function showContextMenu(x, y, items) {
  const menu = document.getElementById('contextMenu');
  menu.innerHTML = items.map(item => {
    if (item.type === 'separator')
      return '<div style="height:1px;background:var(--border-dim);margin:4px 0"></div>';
    return `<div class="context-menu-item ${item.danger ? 'danger' : ''}">${item.label}</div>`;
  }).join('');
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  menu.classList.add('active');

  const menuItems = menu.querySelectorAll('.context-menu-item');
  let idx = 0;
  items.forEach(item => {
    if (item.type === 'separator') return;
    menuItems[idx].addEventListener('click', () => {
      item.action();
      menu.classList.remove('active');
    });
    idx++;
  });
}
