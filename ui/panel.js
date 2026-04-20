// ============================================================
// PANEL — サイドパネル描画層
// ノード・エッジの詳細表示。
// ============================================================

import FSM from '../core/fsm.js';
import { uiState } from '../core/state.js';
import { escHtml } from '../core/utils.js';
import { markDirty } from './dirty.js';

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
          // @see EARS-003#REQ-E003
          const renderItem = d => `
            <div class="dod-item type-${d.type} ${d.checked ? 'checked' : ''}" data-id="${d.id}" draggable="true">
              <input type="checkbox" class="dod-check" ${d.checked ? 'checked' : ''}
                onchange="window.__fsm.toggleDoD('${node.id}', '${d.id}')" />
              <span class="dod-text" data-dod-id="${d.id}">${escHtml(d.text)}</span>
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
          onkeydown="window.__panel.handleDodAddKeydown(event,'${node.id}')" />
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

  // Phase 2: インライン編集イベントを付与
  // @see EARS-003#REQ-E003
  _attachDodInlineEdit(node);

  // Phase 3: D&D 並び替えイベントを付与
  // @see EARS-003#REQ-E003
  _attachDodDragAndDrop(node);
}

// -------------------------------------------------------
// Phase 1: IME対応 Enter抑制
// @see EARS-003#REQ-E003
// -------------------------------------------------------

/**
 * DoD 追加入力欄の keydown ハンドラ。
 * - IME変換中（isComposing=true）の Enter を無視する
 * - Ctrl+Enter は composing 状態に関わらず確定する
 */
function _handleDodAddKeydown(event, nodeId) {
  if (event.key !== 'Enter') return;
  // Ctrl+Enter は composing を無視して確定
  if (event.ctrlKey) {
    window.__fsm.addDoDFromInput(nodeId);
    return;
  }
  // IME 変換中は無視
  if (event.isComposing) return;
  window.__fsm.addDoDFromInput(nodeId);
}

// -------------------------------------------------------
// Phase 2: インライン編集
// @see EARS-003#REQ-E003
// -------------------------------------------------------

function _attachDodInlineEdit(node) {
  const dodList = document.getElementById('dodList');
  if (!dodList) return;

  dodList.querySelectorAll('.dod-text[data-dod-id]').forEach(span => {
    span.addEventListener('click', () => {
      const dodId = span.dataset.dodId;
      const prevText = span.textContent;

      // <span> → <input> に切り替え
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'dod-inline-input field-input';
      input.value = prevText;
      input.style.flex = '1';
      input.style.minWidth = '0';
      span.replaceWith(input);
      input.focus();
      input.select();

      const commit = () => {
        const newText = input.value.trim();
        // 空テキストは直前値に戻す（削除しない）
        const finalText = newText === '' ? prevText : newText;
        const restored = document.createElement('span');
        restored.className = 'dod-text';
        restored.dataset.dodId = dodId;
        restored.textContent = finalText;
        // 再クリックで再編集できるよう再付与
        input.replaceWith(restored);

        if (newText !== '' && finalText !== prevText) {
          // FSM データを更新して dirty マーク
          const dItem = node.dod.find(d => d.id === dodId);
          if (dItem) {
            dItem.text = finalText;
            markDirty();
          }
        }
        // 新しい span に再帰的にイベントを付与
        restored.addEventListener('click', () => {
          // 再付与のために親関数を再呼び出しするのではなく
          // 同じロジックをクロージャ内で適用する
          _activateInlineEdit(restored, node, dodId);
        });
      };

      const cancel = () => {
        const restored = document.createElement('span');
        restored.className = 'dod-text';
        restored.dataset.dodId = dodId;
        restored.textContent = prevText;
        input.replaceWith(restored);
        restored.addEventListener('click', () => {
          _activateInlineEdit(restored, node, dodId);
        });
      };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          input.removeEventListener('blur', commit);
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          input.removeEventListener('blur', commit);
          cancel();
        }
      });
    });
  });
}

/** インライン編集を span 要素に対して直接起動する（再付与用） */
function _activateInlineEdit(span, node, dodId) {
  const prevText = span.textContent;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'dod-inline-input field-input';
  input.value = prevText;
  input.style.flex = '1';
  input.style.minWidth = '0';
  span.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const newText = input.value.trim();
    const finalText = newText === '' ? prevText : newText;
    const restored = document.createElement('span');
    restored.className = 'dod-text';
    restored.dataset.dodId = dodId;
    restored.textContent = finalText;
    input.replaceWith(restored);

    if (newText !== '' && finalText !== prevText) {
      const dItem = node.dod.find(d => d.id === dodId);
      if (dItem) {
        dItem.text = finalText;
        markDirty();
      }
    }
    restored.addEventListener('click', () => {
      _activateInlineEdit(restored, node, dodId);
    });
  };

  const cancel = () => {
    const restored = document.createElement('span');
    restored.className = 'dod-text';
    restored.dataset.dodId = dodId;
    restored.textContent = prevText;
    input.replaceWith(restored);
    restored.addEventListener('click', () => {
      _activateInlineEdit(restored, node, dodId);
    });
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      input.removeEventListener('blur', commit);
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      input.removeEventListener('blur', commit);
      cancel();
    }
  });
}

// -------------------------------------------------------
// Phase 3: D&D 並び替え（グループ内のみ）
// @see EARS-003#REQ-E003
// -------------------------------------------------------

function _attachDodDragAndDrop(node) {
  const dodList = document.getElementById('dodList');
  if (!dodList) return;

  // ドラッグ中の状態
  let _dragSrcId   = null;  // ドラッグ元 DoD id
  let _dragSrcType = null;  // ドラッグ元グループ (verification / validation)

  const items = dodList.querySelectorAll('.dod-item[draggable="true"]');

  items.forEach(itemEl => {
    itemEl.addEventListener('dragstart', e => {
      _dragSrcId   = itemEl.dataset.id;
      _dragSrcType = itemEl.classList.contains('type-verification') ? 'verification' : 'validation';
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', _dragSrcId);
      // ドラッグ中は半透明
      setTimeout(() => { itemEl.style.opacity = '0.4'; }, 0);
    });

    itemEl.addEventListener('dragend', () => {
      itemEl.style.opacity = '';
      _dragSrcId   = null;
      _dragSrcType = null;
    });

    itemEl.addEventListener('dragover', e => {
      // グループ跨ぎ不可
      const targetType = itemEl.classList.contains('type-verification') ? 'verification' : 'validation';
      if (targetType !== _dragSrcType) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    itemEl.addEventListener('drop', e => {
      e.preventDefault();
      const targetId   = itemEl.dataset.id;
      const targetType = itemEl.classList.contains('type-verification') ? 'verification' : 'validation';

      // グループ跨ぎ・自己ドロップは無視
      if (!_dragSrcId || _dragSrcId === targetId || targetType !== _dragSrcType) return;

      // node.dod 配列を並び替え
      const srcIdx    = node.dod.findIndex(d => d.id === _dragSrcId);
      const targetIdx = node.dod.findIndex(d => d.id === targetId);
      if (srcIdx === -1 || targetIdx === -1) return;

      const [removed] = node.dod.splice(srcIdx, 1);
      node.dod.splice(targetIdx, 0, removed);

      markDirty();

      // パネルを再描画
      if (_render) _render();
    });
  });
}

// -------------------------------------------------------
// window.__panel — インライン ハンドラから呼び出す公開 API
// -------------------------------------------------------
window.__panel = {
  handleDodAddKeydown: _handleDodAddKeydown,
};

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

