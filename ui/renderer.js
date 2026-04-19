// ============================================================
// RENDERER — SVG描画層
// 状態を受け取って描画する副作用関数群。DOM操作のみ担当。
// ============================================================

import FSM from '../core/fsm.js';
import { uiState } from '../core/state.js';
import { renderSidePanel } from './panel.js';

// アイコン定数（window経由で上書き可能）
const STATUS_ICONS  = window.__FSM_STATUS_ICONS  || { idle: '📝', wip: '▶️', done: '✅' };
const STATUS_LABELS = window.__FSM_STATUS_LABELS || { idle: '未実施', wip: '作業中', done: '完了' };

const WRAP_CHARS = 13;

export function statusColor(status) {
  return status === 'wip'  ? 'var(--accent-wip)'  :
         status === 'done' ? 'var(--accent-done)'  :
                             'var(--accent-idle)';
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

function wrapText(name) {
  const lines = [];
  let pos = 0;
  while (pos < name.length) {
    lines.push(name.slice(pos, pos + WRAP_CHARS));
    pos += WRAP_CHARS;
  }
  return lines;
}

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
    group.setAttribute('pointer-events', 'bounding-box');

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.classList.add('node-body');
    rect.setAttribute('x', -nw / 2);
    rect.setAttribute('y', -nh / 2);
    rect.setAttribute('width',  nw);
    rect.setAttribute('height', nh);
    rect.setAttribute('fill',   'var(--bg-secondary)');
    rect.setAttribute('stroke', statusColor(node.status));
    rect.setAttribute('stroke-width', node.id === uiState.selectedNodeId ? '2' : '1.5');
    rect.setAttribute('pointer-events', 'bounding-box');

    if (FSM.hasUncheckedVerification(node.id)) {
      rect.setAttribute('stroke-dasharray', '6 3');
    }
    group.appendChild(rect);

    // ノード名: tspan 複数行折り返し
    const lines = wrapText(node.name);
    const lineHeight = 14;
    const totalTextH = lines.length * lineHeight;
    const textStartY = -(totalTextH / 2) + lineHeight / 2;

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.classList.add('node-label');
    label.setAttribute('pointer-events', 'none');
    lines.forEach((line, i) => {
      const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan.setAttribute('x', '0');
      tspan.setAttribute('dy', i === 0 ? `${textStartY}` : `${lineHeight}`);
      tspan.textContent = line;
      label.appendChild(tspan);
    });
    group.appendChild(label);

    // ステータスアイコン + ラベル + DoDカウント（左上）
    const dodDone       = node.dod.filter(d => d.checked).length;
    const dodTotal      = node.dod.length;
    const statusIcon    = STATUS_ICONS[node.status]  || '';
    const statusLbl     = STATUS_LABELS[node.status] || '';
    const dodCount      = dodTotal > 0 ? `${dodDone}/${dodTotal}` : '';
    const isNarrow      = nw < 120;
    const statusIconContent = isNarrow
      ? statusIcon + (dodCount ? ' ' + dodCount : '')
      : statusIcon + ' ' + statusLbl + (dodCount ? '[' + dodCount + ']' : '');

    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconText.classList.add('node-status-icon');
    iconText.setAttribute('x', -nw / 2 + 6);
    iconText.setAttribute('y', -nh / 2 + 12);
    iconText.setAttribute('font-size', '10');
    iconText.setAttribute('text-anchor', 'start');
    iconText.setAttribute('dominant-baseline', 'central');
    iconText.setAttribute('pointer-events', 'none');
    iconText.setAttribute('fill', statusColor(node.status));
    iconText.textContent = statusIconContent;
    group.appendChild(iconText);

    // リサイズハンドル（選択時のみ）
    if (node.id === uiState.selectedNodeId) {
      const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      handle.classList.add('resize-handle');
      handle.setAttribute('x', nw / 2 - 8);
      handle.setAttribute('y', nh / 2 - 8);
      handle.setAttribute('width', 8);
      handle.setAttribute('height', 8);
      handle.setAttribute('fill', 'var(--accent-wip)');
      handle.setAttribute('cursor', 'se-resize');
      handle.setAttribute('rx', '2');
      handle._resizeNodeId = node.id;
      group.appendChild(handle);
    }

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
      if (edge.guard) path.classList.add('guard-edge');
      path.setAttribute('d',
        `M ${cx - loopW/2} ${cy}` +
        ` C ${cx - loopW} ${cy - loopH},` +
        `   ${cx + loopW} ${cy - loopH},` +
        `   ${cx + loopW/2} ${cy}`
      );
      group.appendChild(path);
      if (edge.label || edge.guard) addEdgeLabel(group, cx, cy - loopH + 8, edge.label, edge.guard);

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
        if (edge.guard) line.classList.add('guard-edge');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        group.appendChild(line);
        if (edge.label || edge.guard) addEdgeLabel(group, (x1+x2)/2, (y1+y2)/2, edge.label, edge.guard);

      } else {
        const dx  = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx*dx + dy*dy) || 1;
        const nx = -dy / len;
        const ny =  dx / len;
        const mx = (x1+x2)/2 + nx * totalOffset;
        const my = (y1+y2)/2 + ny * totalOffset;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('edge-line');
        if (edge.guard) path.classList.add('guard-edge');
        path.setAttribute('d', `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`);
        group.appendChild(path);
        if (edge.label || edge.guard) addEdgeLabel(group, mx, my, edge.label, edge.guard);
      }
    }

    group._edgeId = edge.id;
    g.appendChild(group);
  });
}

export function addEdgeLabel(group, x, y, text, guard) {
  const displayText = (guard ? '🔒 ' : '') + (text || '');
  if (!displayText.trim()) {
    if (guard) {
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      icon.classList.add('edge-guard-lock');
      icon.setAttribute('x', x);
      icon.setAttribute('y', y);
      icon.textContent = '🔒';
      group.appendChild(icon);
    }
    return;
  }
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.classList.add('edge-label-bg');
  const textLen = displayText.length * 6 + 12;
  bg.setAttribute('x', x - textLen / 2);
  bg.setAttribute('y', y - 8);
  bg.setAttribute('width',  textLen);
  bg.setAttribute('height', 16);
  group.appendChild(bg);

  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.classList.add('edge-label');
  label.setAttribute('x', x);
  label.setAttribute('y', y);
  label.textContent = displayText;
  group.appendChild(label);
}
