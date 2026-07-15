// ============================================================
// RENDERER — SVG描画層
// 状態を受け取って描画する副作用関数群。DOM操作のみ担当。
// ============================================================

import FSM from '../core/fsm.js';
import { uiState } from '../core/state.js';
import { renderSidePanel } from './panel.js';

// アイコン定数（window経由で上書き可能）
const STATUS_ICONS  = window.__FSM_STATUS_ICONS  || { idle: '📝', wip: '▶️', done: '✅' };
const STATUS_LABELS = window.__FSM_STATUS_LABELS || { idle: 'Idle', wip: 'In progress', done: 'Done' };

const WRAP_CHARS = 13;
const EDGE_LABEL_LINE_HEIGHT = 16;

export function statusColor(status) {
  return status === 'wip'  ? 'var(--accent-wip)'  :
         status === 'done' ? 'var(--accent-done)'  :
                             'var(--accent-idle)';
}

// @see EARS-002#REQ-U001
// @see EARS-011#REQ-W004
// @see EARS-007#REQ-U005
export function render() {
  // @see EARS-011#REQ-E005
  // Why: renderGroups must execute before renderNodes so group frames are drawn
  // beneath node bodies in the SVG paint order (EARS-011 REQ-E005, REQ-W004).
  renderGroups();
  renderEdges();
  renderNodes();
  renderSidePanel();
  syncShowIdsCheckbox();
}

// Why: Edge Mode ボタンが render 時に uiState.edgeMode を反映するのと同じパターン。
// 状態をシリアライズ/復元するルートが将来増えたとき (例: localStorage 復元)、
// チェックボックスの DOM 状態を render() で必ず再同期させる構造にしておく。
function syncShowIdsCheckbox() {
  const cb = document.getElementById('showIdsCheckbox');
  if (cb) cb.checked = !!uiState.showIds;
}

export function applyView() {
  const ng = document.getElementById('nodesGroup');
  const eg = document.getElementById('edgesGroup');
  const gg = document.getElementById('groupsGroup');
  const { viewOffset, viewScale } = uiState;
  const t  = `translate(${viewOffset.x}px, ${viewOffset.y}px) scale(${viewScale})`;
  ng.style.transform       = t;
  eg.style.transform       = t;
  ng.style.transformOrigin = '0 0';
  eg.style.transformOrigin = '0 0';
  if (gg) {
    gg.style.transform       = t;
    gg.style.transformOrigin = '0 0';
  }
}

// @see EARS-002#REQ-E006
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
// Groups
// -------------------------------------------------------

// @see EARS-011#REQ-U001
// @see EARS-011#REQ-U002
// @see EARS-011#REQ-E003
// @see EARS-011#REQ-W004
export function renderGroups() {
  const g = document.getElementById('groupsGroup');
  if (!g) return;
  g.innerHTML = '';

  // @see EARS-011#REQ-E003
  // Why: iterate only nodes with type === "group"; legacy nodes without type field
  // are treated as regular text nodes and never rendered as group frames (ADV-001).
  Object.values(FSM.nodes).forEach(node => {
    if (node.type !== 'group') return;

    const nw = node.width;
    const nh = node.height;

    const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    wrapper.classList.add('fsm-group');
    if (node.id === uiState.selectedNodeId) wrapper.classList.add('node-selected');
    wrapper.setAttribute('transform', `translate(${node.x}, ${node.y})`);
    wrapper.setAttribute('pointer-events', 'bounding-box');

    // @see EARS-011#REQ-U001
    // Why: dashed semi-transparent rect distinguishes the group frame visually
    // from regular node boxes while staying behind member nodes in paint order.
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', -nw / 2);
    rect.setAttribute('y', -nh / 2);
    rect.setAttribute('width',  nw);
    rect.setAttribute('height', nh);
    rect.setAttribute('fill',   'rgba(100, 149, 237, 0.08)');
    rect.setAttribute('stroke', node.id === uiState.selectedNodeId ? 'var(--accent-wip)' : 'cornflowerblue');
    rect.setAttribute('stroke-width', node.id === uiState.selectedNodeId ? '2' : '1.5');
    rect.setAttribute('stroke-dasharray', '8 4');
    rect.setAttribute('rx', '6');
    rect.setAttribute('pointer-events', 'bounding-box');
    wrapper.appendChild(rect);

    // @see EARS-011#REQ-U002
    // @see EARS-001#REQ-U004
    // Why: group names break ONLY on user-entered \n (no 13-char chunk wrap,
    // unlike renderNodes' wrapText()). Group frames are typically wide
    // containers, not fixed-width boxes, so width-based wrapping isn't
    // appropriate here — the user controls line breaks manually instead.
    // This must NOT be unified with renderNodes'/addEdgeLabel's wrap logic:
    // doing so previously caused short group names without \n to get
    // force-wrapped, a regression.
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', -nw / 2 + 8);
    label.setAttribute('y', -nh / 2 + 14);
    label.setAttribute('font-size', '11');
    label.setAttribute('fill', 'cornflowerblue');
    label.setAttribute('font-weight', 'bold');
    label.setAttribute('pointer-events', 'none');
    const groupNameLines = splitLines(node.name);
    const groupLineHeight = 12;
    groupNameLines.forEach((line, i) => {
      const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan.setAttribute('x', -nw / 2 + 8);
      tspan.setAttribute('dy', i === 0 ? '0' : `${groupLineHeight}`);
      tspan.textContent = line;
      label.appendChild(tspan);
    });
    wrapper.appendChild(label);

    wrapper._nodeId = node.id;
    g.appendChild(wrapper);
  });
}

// -------------------------------------------------------
// Nodes
// -------------------------------------------------------

function wrapText(name) {
  // Why: preserve empty segments (blank lines) from split('\n')
  // An empty input must map to a single empty line [''], not [] — otherwise
  // flatMap in renderNodes() drops user-entered leading/trailing/consecutive blank lines.
  if (name.length === 0) return [''];
  const lines = [];
  let pos = 0;
  while (pos < name.length) {
    lines.push(name.slice(pos, pos + WRAP_CHARS));
    pos += WRAP_CHARS;
  }
  return lines;
}

// Why: single shared \n-split primitive used by all three multi-line render
// paths (renderNodes, renderGroups, addEdgeLabel). This function ONLY splits
// on user-entered line breaks — it never does width-based chunking. Each
// call site decides on its own whether to layer wrapText()'s 13-char
// chunking on top (renderNodes does; renderGroups/addEdgeLabel do not).
// Do not fold this together with wrapText() into one "smart" wrap function —
// see the @see EARS-001#REQ-U003/U004 comments at each call site for why the
// three paths must stay separate.
function splitLines(text) {
  return String(text == null ? '' : text).split('\n');
}

// @see EARS-002#REQ-S001
// @see EARS-003#REQ-S001
// @see EARS-003#REQ-S002
export function renderNodes() {
  const g = document.getElementById('nodesGroup');
  g.innerHTML = '';

  Object.values(FSM.nodes).forEach(node => {
    // @see EARS-011#REQ-U001
    // Why: group nodes are rendered exclusively by renderGroups() in the groupsGroup
    // layer (below nodesGroup). Rendering them again here would overlay a second
    // box on top of the group frame, breaking the visual layering.
    if (node.type === 'group') return;

    const nw = node.width;
    const nh = node.height;

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('fsm-node');
    if (node.id === uiState.selectedNodeId) group.classList.add('node-selected');
    // @see EARS-011#REQ-U005
    // Why: nodes in the multi-select set get a subtle visual indicator (dashed outline)
    // so the user knows which nodes will be grouped.
    if (uiState.selectedNodeIds.has(node.id)) group.classList.add('node-multi-selected');
    if (node.status === 'done') group.classList.add('node-done');
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
    // @see EARS-001#REQ-U003
    // Why: node names break on user-entered \n FIRST, then each resulting
    // segment is wrapped to the node's fixed 13-char display width via
    // wrapText(). This two-pass composition (splitLines -> wrapText per
    // segment) is intentional and must stay a two-pass composition — do NOT
    // collapse it into wrapText() itself, and do NOT reuse this exact
    // composition for renderGroups()/addEdgeLabel() (those two paths
    // deliberately skip the width-based wrapText() chunk pass; see the Why
    // comments there). A prior attempt to unify all three paths into one
    // "smart wrap" helper caused short group-names/edge-labels without \n to
    // get force-wrapped — keep the three paths separate.
    const lines = splitLines(node.name).flatMap(wrapText);
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

    // Why: Show IDs トグル ON のときだけ ID ラベルをノード左下に描画する。
    // 既存の左上 status icon (-nw/2 + 6, -nh/2 + 12) と対称の位置で、ボーダーから内側に
    // 6px / 6px オフセット。エッジ ID をボードに描かないのは、エッジラベル位置が
    // パラレル/セルフループ間で詰まっており追加文字を載せる余地がないため
    // (ID 表示はサイドパネル側に集約する設計に従う)。
    if (uiState.showIds) {
      const idText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      idText.classList.add('node-id-label');
      idText.setAttribute('x', -nw / 2 + 6);
      idText.setAttribute('y', nh / 2 - 6);
      idText.setAttribute('text-anchor', 'start');
      idText.setAttribute('dominant-baseline', 'alphabetic');
      idText.setAttribute('pointer-events', 'none');
      idText.textContent = node.id;
      group.appendChild(idText);
    }

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

// @see EARS-004#REQ-S001
// @see EARS-004#REQ-S002
// @see EARS-004#REQ-W002
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

// @see EARS-004#REQ-W002
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
  // @see EARS-001#REQ-U004
  // @see EARS-001#REQ-U005
  // Why: edge labels break ONLY on user-entered \n (no 13-char chunk wrap),
  // same rationale as renderGroups() — edge labels are short annotations,
  // not fixed-width boxes. Must NOT be unified with renderNodes'/
  // renderGroups' wrap logic (see the Why comments at those two call
  // sites) — a prior unification attempt force-wrapped short single-line
  // labels that previously rendered on one line, which is the regression
  // this separation guards against.
  const lines = splitLines(displayText);
  const totalTextH  = lines.length * EDGE_LABEL_LINE_HEIGHT;
  const textStartY  = -(totalTextH / 2) + EDGE_LABEL_LINE_HEIGHT / 2;

  // @see EARS-001#REQ-U005
  // Why: pill width/height must fit the widest rendered line and the total
  // line count — NOT the raw pre-split displayText.length (which would
  // undersize the pill for multi-line labels). The single-line case
  // (lines.length === 1) reduces exactly to the pre-existing width/height
  // formula (textLen = displayText.length*6+12, height = 16), so existing
  // single-line edge labels render pixel-identical to before.
  const widestLine = Math.max(...lines.map(l => l.length));
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.classList.add('edge-label-bg');
  const textLen = widestLine * 6 + 12;
  const bgHeight = lines.length * EDGE_LABEL_LINE_HEIGHT;
  bg.setAttribute('x', x - textLen / 2);
  bg.setAttribute('y', y - bgHeight / 2);
  bg.setAttribute('width',  textLen);
  bg.setAttribute('height', bgHeight);
  group.appendChild(bg);

  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.classList.add('edge-label');
  label.setAttribute('x', x);
  label.setAttribute('y', y);
  lines.forEach((line, i) => {
    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    tspan.setAttribute('x', x);
    tspan.setAttribute('dy', i === 0 ? `${textStartY}` : `${EDGE_LABEL_LINE_HEIGHT}`);
    tspan.textContent = line;
    label.appendChild(tspan);
  });
  group.appendChild(label);
}
