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
    // @see EARS-001#REQ-E008
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
    // @see EARS-011#REQ-U005
    // Why: Shift+click adds to selectedNodeIds for multi-select (group creation);
    // regular click delegates to onNodeClick for single-select / edge mode.
    if (e.shiftKey) {
      const id = g._nodeId;
      // Why: Seed selectedNodeIds with the already-selected node on the first
      // Shift+click so "click A → Shift+click B" works without holding Shift
      // from the very first click.
      if (uiState.selectedNodeIds.size === 0 && uiState.selectedNodeId) {
        uiState.selectedNodeIds.add(uiState.selectedNodeId);
      }
      if (uiState.selectedNodeIds.has(id)) {
        uiState.selectedNodeIds.delete(id);
      } else {
        uiState.selectedNodeIds.add(id);
      }
      _render();
    } else {
      onNodeClick(g._nodeId);
    }
  });

  // @see EARS-011#REQ-U003
  // グループフレームへの委譲リスナー（グループノードも通常ノードと同じ操作をサポート）
  const gg = document.getElementById('groupsGroup');

  // @see EARS-011#REQ-E004
  // Why: drag must move all descendants, not only direct children — nested groups
  // would otherwise leave their own children behind (EARS-011 REQ-E004).
  function _allDescendants(groupId) {
    const result = [];
    const queue = [groupId];
    while (queue.length) {
      const pid = queue.shift();
      Object.values(FSM.nodes).forEach(n => {
        if (n.parentId === pid) {
          result.push(n);
          if (n.type === 'group') queue.push(n.id);
        }
      });
    }
    return result;
  }

  if (gg) {
    gg.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (uiState.edgeMode) return;
      const g = e.target.closest('.fsm-group');
      if (!g) return;
      e.stopPropagation();
      const id = g._nodeId;
      const node = FSM.nodes[id];
      if (!node) return;
      uiState.dragging = {
        id,
        startX: e.clientX, startY: e.clientY,
        origX: node.x, origY: node.y,
        moved: false,
        isGroup: true,
        // @see EARS-011#REQ-E004
        // Why: capture original positions of all children so drag applies the same
        // delta to each child (EARS-011 REQ-E004), avoiding accumulated rounding error.
        childOrigPositions: _allDescendants(id)
          .map(n => ({ id: n.id, origX: n.x, origY: n.y })),
      };
    });

    gg.addEventListener('click', e => {
      const g = e.target.closest('.fsm-group');
      if (!g) return;
      e.stopPropagation();
      if (e.shiftKey) {
        const id = g._nodeId;
        // Why: same seed logic as nodesGroup click — ensure the plain-selected node
        // is included when Shift+click starts a multi-select from a group frame.
        if (uiState.selectedNodeIds.size === 0 && uiState.selectedNodeId) {
          uiState.selectedNodeIds.add(uiState.selectedNodeId);
        }
        if (uiState.selectedNodeIds.has(id)) {
          uiState.selectedNodeIds.delete(id);
        } else {
          uiState.selectedNodeIds.add(id);
        }
        _render();
      } else {
        onNodeClick(g._nodeId);
      }
    });

    gg.addEventListener('contextmenu', e => {
      const g = e.target.closest('.fsm-group');
      if (!g) return;
      e.preventDefault();
      e.stopPropagation();
      selectNode(g._nodeId);
      showContextMenu(e.clientX, e.clientY, nodeContextItems(g._nodeId));
    });
  }

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
  // @see EARS-002#REQ-E002
  // @see EARS-004#REQ-W001
  // @see EARS-004#REQ-S001
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
        alert(`Transition blocked: "${srcNode.name}" is not done.\nguard: ${edge.guard}`);
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

  // @see EARS-002#REQ-E005
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

  // @see EARS-002#REQ-E003
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
    // @see EARS-001#REQ-E008
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
    // @see EARS-001#REQ-E007
    // @see EARS-011#REQ-E004
    if (uiState.dragging) {
      const dx = (e.clientX - uiState.dragging.startX) / uiState.viewScale;
      const dy = (e.clientY - uiState.dragging.startY) / uiState.viewScale;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) uiState.dragging.moved = true;
      FSM.nodes[uiState.dragging.id].x = uiState.dragging.origX + dx;
      FSM.nodes[uiState.dragging.id].y = uiState.dragging.origY + dy;
      // @see EARS-011#REQ-E004
      // Why: when dragging a group, apply the same delta to every child node so
      // member positions track the group frame (EARS-011 REQ-E004).
      if (uiState.dragging.isGroup && uiState.dragging.childOrigPositions) {
        uiState.dragging.childOrigPositions.forEach(cp => {
          const child = FSM.nodes[cp.id];
          if (child) {
            child.x = cp.origX + dx;
            child.y = cp.origY + dy;
          }
        });
      }
      _render();
    }
    // @see EARS-002#REQ-E005
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
    // @see EARS-001#REQ-S003
    // @see EARS-002#REQ-E004
    if (e.key === 'Escape') {
      if (uiState.edgeMode) toggleEdgeMode();
      document.getElementById('contextMenu').classList.remove('active');
    }
    // @see EARS-001#REQ-E005
    // @see EARS-001#REQ-E006
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

// @see EARS-002#REQ-E001
// @see EARS-002#REQ-S001
// @see EARS-002#REQ-S003
export function selectNode(id) {
  uiState.selectedNodeId = id;
  uiState.selectedEdgeId = null;
  // Clear multi-select when switching to single selection
  uiState.selectedNodeIds.clear();
  _render();
}

// @see EARS-002#REQ-E002
// @see EARS-002#REQ-S002
// @see EARS-002#REQ-S004
export function selectEdge(id) {
  uiState.selectedEdgeId = id;
  uiState.selectedNodeId = null;
  _render();
}

// @see EARS-002#REQ-E003
// @see EARS-002#REQ-E004
// @see EARS-002#REQ-S005
export function deselect() {
  uiState.selectedNodeId = null;
  uiState.selectedEdgeId = null;
  uiState.selectedNodeIds.clear();
  _render();
}

// -------------------------------------------------------
// Node click (edge mode 対応)
// -------------------------------------------------------

// @see EARS-001#REQ-S001
// @see EARS-001#REQ-S002
function onNodeClick(id) {
  if (uiState.edgeMode) {
    if (!uiState.edgeModeSource) {
      // @see EARS-001#REQ-S001
      uiState.edgeModeSource = id;
      document.getElementById('edgeModeBanner').textContent =
        `Edge: ${FSM.nodes[id].name} → ? (click target)  |  ESC to cancel`;
    } else {
      // @see EARS-001#REQ-S002
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

// @see EARS-001#REQ-E003
// @see EARS-001#REQ-S003
export function toggleEdgeMode() {
  uiState.edgeMode       = !uiState.edgeMode;
  uiState.edgeModeSource = null;
  document.getElementById('edgeModeBtn').classList.toggle('btn-accent', uiState.edgeMode);
  document.getElementById('edgeModeBanner').classList.toggle('active', uiState.edgeMode);
  document.getElementById('canvas').style.cursor = uiState.edgeMode ? 'crosshair' : 'grab';
}

// -------------------------------------------------------
// Show IDs toggle
// -------------------------------------------------------

// Why: チェックボックス onchange から呼ばれるトグル。
// uiState を反転 → 再描画で renderNodes() が ID ラベルを書くかどうか分岐する。
// チェックボックスの checked 状態は render() 側で uiState.showIds を反映させない
// （= ここでは DOM 直接更新せず、index.html の checked 属性更新は render 経由）。
export function toggleShowIds() {
  uiState.showIds = !uiState.showIds;
  if (_render) _render();
}

// -------------------------------------------------------
// CRUD actions (panel の onclick から window.__fsm 経由で呼ばれる)
// -------------------------------------------------------

// @see EARS-001#REQ-E001
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

// @see EARS-011#REQ-E001
// @see EARS-011#REQ-W001
// @see EARS-011#REQ-W003
export function groupSelectedNodes() {
  const ids = Array.from(uiState.selectedNodeIds);
  // @see EARS-011#REQ-W001
  if (ids.length < 2) {
    alert('Select 2 or more nodes to group (Shift+click for multiple selection).');
    return;
  }

  const selectedNodes = ids.map(id => FSM.nodes[id]).filter(Boolean);
  if (selectedNodes.length < 2) return;

  // Bounding box of selected nodes + 20px padding on all sides
  // @see EARS-011#REQ-E001
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  selectedNodes.forEach(n => {
    minX = Math.min(minX, n.x - n.width  / 2);
    maxX = Math.max(maxX, n.x + n.width  / 2);
    minY = Math.min(minY, n.y - n.height / 2);
    maxY = Math.max(maxY, n.y + n.height / 2);
  });
  const PAD  = 20;
  const cx   = (minX + maxX) / 2;
  const cy   = (minY + maxY) / 2;
  const gw   = (maxX - minX) + PAD * 2;
  const gh   = (maxY - minY) + PAD * 2;

  // @see EARS-011#REQ-E001
  const groupId = FSM.addNode('Group', cx, cy, gw, gh, { type: 'group' });

  // @see EARS-011#REQ-W003
  // @see EARS-010#REQ-U005
  // Why: the new group is placed at depth 0 (no parent). Selected nodes become
  // depth 1. Any descendants of selected nodes inherit depth+1. The total depth
  // of the deepest descendant must not exceed 3.
  // subtreeHeight of a node = max descendant depth below it (0 = leaf).
  // After grouping: new node depth = 1 + subtreeHeight must be ≤ 3.
  for (const n of selectedNodes) {
    const subtreeHeight = _maxDescendantDepth(n.id, 0);
    // After wrapping: n is at depth 1, deepest descendant at depth 1 + subtreeHeight
    if (1 + subtreeHeight > 3) {
      alert(`Grouping would exceed nesting depth 3. Grouping cancelled.`);
      // Rollback the created group node
      delete FSM.nodes[groupId];
      FSM._groupIdCounter--;
      return;
    }
  }

  // Set parentId of selected nodes to the new group
  ids.forEach(id => {
    if (FSM.nodes[id]) FSM.nodes[id].parentId = groupId;
  });

  uiState.selectedNodeIds.clear();
  uiState.selectedNodeId = groupId;
  markDirty();
  _render();
}

/** Returns the maximum depth from node `id` downward (0 = leaf). */
function _maxDescendantDepth(id, current) {
  const children = Object.values(FSM.nodes).filter(n => n.parentId === id);
  if (children.length === 0) return current;
  return Math.max(...children.map(c => _maxDescendantDepth(c.id, current + 1)));
}

// @see EARS-001#REQ-E002
export function updateNodeName(id, name) {
  if (FSM.nodes[id]) {
    FSM.nodes[id].name = name;
    markDirty();
    _render();
  }
}

// @see EARS-001#REQ-E008
export function updateNodeSize(id, w, h) {
  const node = FSM.nodes[id];
  if (!node) return;
  if (w !== null && w !== undefined) node.width  = Math.max(80,  parseInt(w) || DEFAULT_NODE_W);
  if (h !== null && h !== undefined) node.height = Math.max(40,  parseInt(h) || DEFAULT_NODE_H);
  markDirty();
  _render();
}

// @see EARS-003#REQ-E001
export function setStatus(id, status) {
  if (FSM.nodes[id]) {
    if (status === 'done') {
      const uncheckedValidation = FSM.nodes[id].dod.filter(d => d.type === 'validation' && !d.checked).length;
      if (uncheckedValidation > 0 || FSM.hasUncheckedVerification(id)) {
        if (!confirm('DoD items are unchecked. Mark as done?')) return;
      }
    }
    FSM.nodes[id].status = status;
    markDirty();
    _render();
  }
}

// @see EARS-001#REQ-E004
export function updateEdgeLabel(id, label) {
  if (FSM.edges[id]) {
    FSM.edges[id].label = label;
    markDirty();
    _render();
  }
}

// @see EARS-001#REQ-E005
// @see EARS-001#REQ-W001
export function deleteSelectedNode() {
  if (uiState.selectedNodeId) {
    FSM.removeNode(uiState.selectedNodeId);
    uiState.selectedNodeId = null;
    markDirty();
    _render();
  }
}

// @see EARS-001#REQ-E006
export function deleteSelectedEdge() {
  if (uiState.selectedEdgeId) {
    FSM.removeEdge(uiState.selectedEdgeId);
    uiState.selectedEdgeId = null;
    markDirty();
    _render();
  }
}

// @see EARS-003#REQ-E002
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

// @see EARS-003#REQ-E005
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

// @see EARS-003#REQ-E004
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

// @see EARS-003#REQ-E006
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
    { label: 'Status: Idle', action: () => setStatus(id, 'idle') },
    { label: 'Status: In progress', action: () => setStatus(id, 'wip')  },
    { label: 'Status: Done',   action: () => setStatus(id, 'done') },
    { type: 'separator' },
    { label: 'Delete', danger: true, action: () => {
        FSM.removeNode(id);
        uiState.selectedNodeId = null;
        _render();
    }}
  ];
}

function edgeContextItems(id) {
  return [
    { label: 'Delete', danger: true, action: () => {
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
