// ============================================================
// PANEL — サイドパネル描画層
// ノード・エッジの詳細表示。
// ============================================================

import FSM from '../core/fsm.js';
import { uiState } from '../core/state.js';
import { escHtml } from '../core/utils.js';

// render() からコールバックとして注入される
let _render = null;
export function setRenderCallback(fn) { _render = fn; }

// -------------------------------------------------------
// Side Panel
// -------------------------------------------------------

// @see EARS-002#REQ-S003
// @see EARS-002#REQ-S004
// @see EARS-002#REQ-S005
export function renderSidePanel() {
  const empty   = document.getElementById('panelEmpty');
  const content = document.getElementById('panelContent');

  if (uiState.selectedNodeId && FSM.nodes[uiState.selectedNodeId]) {
    empty.style.display   = 'none';
    content.style.display = 'block';
    renderNodePanel(FSM.nodes[uiState.selectedNodeId]);
  } else if (uiState.selectedEdgeId && FSM.edges[uiState.selectedEdgeId]) {
    empty.style.display   = 'none';
    content.style.display = 'block';
    renderEdgePanel(FSM.edges[uiState.selectedEdgeId]);
  } else {
    // @see EARS-002#REQ-S005
    empty.style.display   = 'block';
    content.style.display = 'none';
  }
}

// @see EARS-003#REQ-E001
// @see EARS-003#REQ-E002
// @see EARS-003#REQ-E003
// @see EARS-003#REQ-E004
// @see EARS-003#REQ-E005
// @see EARS-003#REQ-E006
function renderNodePanel(node) {
  const content  = document.getElementById('panelContent');
  const dodDone  = node.dod.filter(d => d.checked).length;
  const dodTotal = node.dod.length;

  content.innerHTML = `
    <div class="panel-section">
      <div class="panel-section-title">Node</div>
      <div class="field-group">
        <label class="field-label">Name</label>
        <input class="field-input" value="${escHtml(node.name)}"
          onchange="window.__fsm.updateNodeName('${node.id}', this.value)" />
      </div>
      <div class="field-group">
        <label class="field-label">Size (width × height)</label>
        <div style="display:flex;gap:6px">
          <input class="field-input" type="number" value="${node.width}" style="width:50%"
            onchange="window.__fsm.updateNodeSize('${node.id}', this.value, null)" />
          <input class="field-input" type="number" value="${node.height}" style="width:50%"
            onchange="window.__fsm.updateNodeSize('${node.id}', null, this.value)" />
        </div>
      </div>
      <div class="field-group">
        <label class="field-label">Status</label>
        <div class="status-toggle">
          <div class="status-option ${node.status === 'idle' ? 'active-idle' : ''}"
            onclick="window.__fsm.setStatus('${node.id}', 'idle')">未実施</div>
          <div class="status-option ${node.status === 'wip'  ? 'active-wip'  : ''}"
            onclick="window.__fsm.setStatus('${node.id}', 'wip')">作業中</div>
          <div class="status-option ${node.status === 'done' ? 'active-done' : ''}"
            onclick="window.__fsm.setStatus('${node.id}', 'done')">完了</div>
        </div>
      </div>
    </div>

    <div class="panel-section">
      <div class="panel-section-title">Definition of Done ${dodTotal > 0 ? `(${dodDone}/${dodTotal})` : ''}</div>
      <div class="dod-list" id="dodList">
        ${(() => {
          const verificationItems  = node.dod.filter(d => d.type === 'verification');
          const validationItems = node.dod.filter(d => d.type === 'validation');
          const renderItem = d => `
            <div class="dod-item type-${d.type} ${d.checked ? 'checked' : ''}" data-id="${d.id}">
              <input type="checkbox" class="dod-check" ${d.checked ? 'checked' : ''}
                onchange="window.__fsm.toggleDoD('${node.id}', '${d.id}')" />
              <span class="dod-text">${escHtml(d.text)}</span>
              <div class="dod-actions">
                <button class="dod-action-btn"
                  onclick="window.__fsm.toggleDoDType('${node.id}', '${d.id}')" title="タイプ切り替え">↕️</button>
                <button class="dod-action-btn"
                  onclick="window.__fsm.removeDoDItem('${node.id}', '${d.id}')" title="Delete">✕</button>
              </div>
            </div>`;
          let html = '';
          if (verificationItems.length > 0) {
            html += `<div class="dod-group-header dod-group-verification">📐 verification</div>`;
            html += verificationItems.map(renderItem).join('');
          }
          if (validationItems.length > 0) {
            html += `<div class="dod-group-header dod-group-validation">👍 validation</div>`;
            html += validationItems.map(renderItem).join('');
          }
          return html || '<div style="font-size:11px;color:var(--text-dim);padding:4px">No DoD items</div>';
        })()}
      </div>
      <div class="dod-add-row">
        <input class="dod-add-input" id="dodAddInput" placeholder="Add DoD item..."
          onkeydown="if(event.key==='Enter')window.__fsm.addDoDFromInput('${node.id}')" />
        <select class="dod-type-select" id="dodTypeSelect">
          <option value="verification">📐</option>
          <option value="validation">👍</option>
        </select>
        <button class="btn" style="padding:4px 8px;font-size:10px"
          onclick="window.__fsm.addDoDFromInput('${node.id}')">+</button>
      </div>
    </div>

    <div class="panel-section">
      <div class="panel-section-title">Edges</div>
      <div class="edge-list">
        ${Object.values(FSM.edges)
            .filter(e => e.fromNode === node.id || e.toNode === node.id)
            .map(e => {
              const other = e.fromNode === node.id
                ? FSM.nodes[e.toNode]
                : FSM.nodes[e.fromNode];
              const dir = e.fromNode === node.id ? '→' : '←';
              return `<div class="edge-list-item" onclick="window.__fsm.selectEdge('${e.id}')">
                <span class="edge-arrow">${dir}</span>
                ${other ? escHtml(other.name) : '?'}
                ${e.guard ? `<span style="color:var(--text-dim);margin-left:auto">🔒</span>` : ''}
                ${e.label
                  ? `<span style="color:var(--text-dim);margin-left:auto">${escHtml(e.label)}</span>`
                  : ''}
              </div>`;
            }).join('')
          || '<div style="font-size:11px;color:var(--text-dim);padding:4px">No edges</div>'}
      </div>
    </div>

    <div style="padding-top:4px">
      <button class="btn btn-danger" style="width:100%"
        onclick="window.__fsm.deleteSelectedNode()">Delete Node</button>
    </div>
  `;
}

// @see EARS-001#REQ-E004
// @see EARS-004#REQ-E001
function renderEdgePanel(edge) {
  const content = document.getElementById('panelContent');
  const from    = FSM.nodes[edge.fromNode];
  const to      = FSM.nodes[edge.toNode];

  content.innerHTML = `
    <div class="panel-section">
      <div class="panel-section-title">Edge</div>
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);margin-bottom:4px">
        id: ${escHtml(edge.id)}
      </div>
      <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);margin-bottom:10px">
        ${from ? escHtml(from.name) : '?'} → ${to ? escHtml(to.name) : '?'}
      </div>
      <div class="field-group">
        <label class="field-label">Label (遷移条件)</label>
        <input class="field-input" value="${escHtml(edge.label)}"
          onchange="window.__fsm.updateEdgeLabel('${edge.id}', this.value)" />
      </div>
      ${edge.guard ? `
      <div class="verification-gate" style="margin-top:8px">
        <span class="verification-gate-icon">🔒</span>
        Guard: ${escHtml(edge.guard)} — source が done でないと遷移不可
      </div>` : ''}
    </div>
    <div style="padding-top:4px">
      <button class="btn btn-danger" style="width:100%"
        onclick="window.__fsm.deleteSelectedEdge()">Delete Edge</button>
    </div>
  `;
}

