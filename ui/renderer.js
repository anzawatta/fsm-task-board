// ============================================================
// RENDERER — SVG描画層
// 状態を受け取って描画する副作用関数群。DOM操作のみ担当。
// ============================================================

import FSM from '../core/fsm.js';
import { uiState } from '../core/state.js';
import { renderSidePanel } from './panel.js';

export function statusColor(status) {
  return status === 'wip'  ? 'var(--accent-wip)'  :
         status === 'done' ? 'var(--accent-done)'  :
                             'var(--accent-idle)';
}

export function statusLabel(status) {
  return status === 'wip'  ? '実装中' :
         status === 'done' ? '完了'   : '未着手';
}

export function render() {
  renderEdges();
  renderNodes();
  renderSidePanel();
}

export function applyView() {
  const ng = document.getElementById('nodesGroup');
  const eg = document.getElementById('edgesGroup');
  const { viewOffset, viewScale } = uiState;
  const t  = `translate(${viewOffset.x}px, ${viewOffset.y}px) scale(${viewScale})`;
  ng.style.transform       = t;
  eg.style.transform       = t;
  ng.style.transformOrigin = '0 0';
  eg.style.transformOrigin = '0 0';
}

export function fitView() {
  const nodes = Object.values(FSM.nodes);
  if (nodes.length === 0) {
    uiState.viewOffset = { x: 0, y: 0 };
    uiState.viewScale  = 1;
    applyView();
    return;
  }
  const rect = document.getElementById('canvas').getBoundingClientRect();
  const pad  = 80;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    minX = Math.min(minX, n.x - n.width  / 2);
    maxX = Math.max(maxX, n.x + n.width  / 2);
    minY = Math.min(minY, n.y - n.height / 2);
    maxY = Math.max(maxY, n.y + n.height / 2);
  });
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;
  uiState.viewScale    = Math.min(1.5, Math.min(rect.width / w, rect.height / h));
  uiState.viewOffset.x = (rect.width  - w * uiState.viewScale) / 2 - minX * uiState.viewScale + pad * uiState.viewScale;
  uiState.viewOffset.y = (rect.height - h * uiState.viewScale) / 2 - minY * uiState.viewScale + pad * uiState.viewScale;
  applyView();
}

// -------------------------------------------------------
// Nodes
// -------------------------------------------------------

export function renderNodes() {
  const g = document.getElementById('nodesGroup');
  g.innerHTML = '';

  Object.values(FSM.nodes).forEach(node => {
    const nw = node.width;
    const nh = node.height;

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('fsm-node');
    if (node.id === uiState.selectedNodeId) group.classList.add('node-selected');
    group.setAttribute('transform', `translate(${node.x}, ${node.y})`);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.classList.add('node-body');
    rect.setAttribute('x', -nw / 2);
    rect.setAttribute('y', -nh / 2);
    rect.setAttribute('width',  nw);
    rect.setAttribute('height', nh);
    rect.setAttribute('fill',   'var(--bg-secondary)');
    rect.setAttribute('stroke', statusColor(node.status));
    rect.setAttribute('stroke-width', node.id === uiState.selectedNodeId ? '2' : '1.5');

    if (FSM.hasUncheckedValidation(node.id)) {
      rect.setAttribute('stroke-dasharray', '6 3');
    }
    group.appendChild(rect);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.classList.add('node-label');
    label.setAttribute('y', -6);
    label.textContent = node.name.length > 14
      ? node.name.slice(0, 13) + '…'
      : node.name;
    group.appendChild(label);

    const statusText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    statusText.classList.add('node-status-indicator');
    statusText.setAttribute('y', 12);
    statusText.setAttribute('fill', statusColor(node.status));
    const dodDone  = node.dod.filter(d => d.checked).length;
    const dodTotal = node.dod.length;
    const dodStr   = dodTotal > 0 ? ` [${dodDone}/${dodTotal}]` : '';
    statusText.textContent = statusLabel(node.status) + dodStr;
    group.appendChild(statusText);

    group._nodeId = node.id;
    g.appendChild(group);
  });
}

// -------------------------------------------------------
// Edges
// -------------------------------------------------------

export function renderEdges() {
  const g = document.getElementById('edgesGroup');
  g.innerHTML = '';

  const edges = Object.values(FSM.edges);

  const parallelGroups = {};
  const selfLoopGroups = {};

  edges.forEach(e => {
    if (e.fromNode === e.toNode) {
      if (!selfLoopGroups[e.fromNode]) selfLoopGroups[e.fromNode] = [];
      selfLoopGroups[e.fromNode].push(e.id);
    } else {
      const key = `${e.fromNode}→${e.toNode}`;
      if (!parallelGroups[key]) parallelGroups[key] = [];
      parallelGroups[key].push(e.id);
    }
  });

  const edgeLayout = {};

  Object.entries(parallelGroups).forEach(([key, ids]) => {
    const [fn, tn] = key.split('→');
    const hasBidi  = !!parallelGroups[`${tn}→${fn}`];
    ids.forEach((id, i) => {
      edgeLayout[id] = { index: i, groupSize: ids.length, hasBidi };
    });
  });

  Object.entries(selfLoopGroups).forEach(([, ids]) => {
    ids.forEach((id, i) => {
      edgeLayout[id] = { loopIndex: i, loopGroupSize: ids.length };
    });
  });

  const STEP      = 30;
  const BIDI_BASE = 15;

  edges.forEach(edge => {
    const from = FSM.nodes[edge.fromNode];
    const to   = FSM.nodes[edge.toNode];
    if (!from || !to) return;

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('fsm-edge');

    const layout = edgeLayout[edge.id];

    if (edge.fromNode === edge.toNode) {
      const { loopIndex, loopGroupSize } = layout;
      const spread = loopGroupSize > 1 ? loopIndex / (loopGroupSize - 1) : 0.5;
      const loopW  = 44 + spread * 20;
      const loopH  = 48 + loopIndex * 20;

      const cx = from.x;
      const cy = from.y - from.height / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.classList.add('edge-line');
      path.setAttribute('d',
        `M ${cx - loopW/2} ${cy}` +
        ` C ${cx - loopW} ${cy - loopH},` +
        `   ${cx + loopW} ${cy - loopH},` +
        `   ${cx + loopW/2} ${cy}`
      );
      group.appendChild(path);
      if (edge.label) addEdgeLabel(group, cx, cy - loopH + 8, edge.label);

    } else {
      const { index, groupSize, hasBidi } = layout;

      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const x1 = from.x + Math.cos(angle) * (from.width  / 2 + 2);
      const y1 = from.y + Math.sin(angle) * (from.height / 2 + 2);
      const x2 = to.x   - Math.cos(angle) * (to.width    / 2 + 8);
      const y2 = to.y   - Math.sin(angle) * (to.height   / 2 + 8);

      const parallelOffset = (index - (groupSize - 1) / 2) * STEP;
      const bidiOffset     = hasBidi ? BIDI_BASE : 0;
      const totalOffset    = parallelOffset + bidiOffset;

      if (totalOffset === 0) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.classList.add('edge-line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        group.appendChild(line);
        if (edge.label) addEdgeLabel(group, (x1+x2)/2, (y1+y2)/2, edge.label);

      } else {
        const dx  = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx*dx + dy*dy) || 1;
        const nx = -dy / len;
        const ny =  dx / len;
        const mx = (x1+x2)/2 + nx * totalOffset;
        const my = (y1+y2)/2 + ny * totalOffset;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('edge-line');
        path.setAttribute('d', `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`);
        group.appendChild(path);
        if (edge.label) addEdgeLabel(group, mx, my, edge.label);
      }
    }

    group._edgeId = edge.id;
    g.appendChild(group);
  });
}

export function addEdgeLabel(group, x, y, text) {
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.classList.add('edge-label-bg');
  const textLen = text.length * 6 + 12;
  bg.setAttribute('x', x - textLen / 2);
  bg.setAttribute('y', y - 8);
  bg.setAttribute('width',  textLen);
  bg.setAttribute('height', 16);
  group.appendChild(bg);

  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.classList.add('edge-label');
  label.setAttribute('x', x);
  label.setAttribute('y', y);
  label.textContent = text;
  group.appendChild(label);
}
