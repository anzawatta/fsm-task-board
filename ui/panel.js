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

  // Why: group nodes are containers — status/DoD are task-node concepts (EARS-011)
  const statusAndDodSections = node.type !== 'group' ? `
      <div class="field-group">
        <label class="field-label">Status</label>
        <div class="status-toggle">
          <div class="status-option ${node.status === 'idle' ? 'active-idle' : ''}"
            onclick="window.__fsm.setStatus('${node.id}', 'idle')">Idle</div>
          <div class="status-option ${node.status === 'wip'  ? 'active-wip'  : ''}"
            onclick="window.__fsm.setStatus('${node.id}', 'wip')">In progress</div>
          <div class="status-option ${node.status === 'done' ? 'active-done' : ''}"
            onclick="window.__fsm.setStatus('${node.id}', 'done')">Done</div>
        </div>
      </div>
    </div>

    <div class="panel-section">
      <div class="panel-section-title">Definition of Done ${dodTotal > 0 ? '(' + dodDone + '/' + dodTotal + ')' : ''}</div>
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
                  onclick="window.__fsm.toggleDoDType('${node.id}', '${d.id}')" title="Toggle type">↕️</button>
                <button class="dod-action-btn"
                  onclick="window.__fsm.removeDoDItem('${node.id}', '${d.id}')" title="Delete">✕</button>
              </div>
            </div>`;
          let html = '';
          if (verificationItems.length > 0) {
            html += '<div class="dod-group-header dod-group-verification">📐 verification</div>';
            html += verificationItems.map(renderItem).join('');
          }
          if (validationItems.length > 0) {
            html += '<div class="dod-group-header dod-group-validation">👍 validation</div>';
            html += validationItems.map(renderItem).join('');
          }
          return html || '<div style="font-size:11px;color:var(--text-dim);padding:4px">No DoD items</div>';
        })()}
      </div>
      <div class="dod-add-row">
        <textarea class="dod-add-input" id="dodAddInput" placeholder="Add DoD item..." rows="1"
          onkeydown="window.__panel.handleDodAddKeydown(event,'${node.id}')"
          onblur="window.__fsm.addDoDFromInput('${node.id}')"
          oninput="window.__panel.autoGrow(this)"></textarea>
        <select class="dod-type-select" id="dodTypeSelect">
          <option value="verification">📐</option>
          <option value="validation">👍</option>
        </select>
        <button class="btn" style="padding:4px 8px;font-size:10px"
          onclick="window.__fsm.addDoDFromInput('${node.id}')">+</button>
      </div>
    </div>
    ` : '</div>';

  content.innerHTML = `
    <div class="panel-section">
      <div class="panel-section-title">Node（id=${escHtml(node.id)}）</div>
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
      ${statusAndDodSections}

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
// Phase 1: DoD 追加 textarea（IME対応 Enter抑制・auto-grow・Ctrl+Enter確定）
// @see EARS-003#REQ-E003
// -------------------------------------------------------

/**
 * DoD 追加 textarea の scrollHeight ベース auto-grow。
 * height を一旦 auto に戻してから scrollHeight を測るのは、
 * 縮小方向のリサイズ（長文 → 短文）でも正しい高さに追従させるため。
 */
function _autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

/**
 * DoD 追加 textarea の keydown ハンドラ。
 * - 通常の Enter は textarea 標準動作（改行挿入）に任せる — IME 変換中かどうかは問わない
 * - Ctrl+Enter で確定する
 * - Escape で入力内容を破棄する（この textarea は毎回空から始まるため、
 *   「編集前のテキストに戻す」= 空文字に戻す、で仕様上等価）
 */
function _handleDodAddKeydown(event, nodeId) {
  if (event.key === 'Escape') {
    // @see EARS-003#REQ-E008
    // Why: 追加用 textarea には「直前値」という概念がなく、編集セッションは常に
    // 空文字から始まる。よって Escape の「編集前テキストへ復元」は空文字へのクリアと等価。
    event.preventDefault();
    event.target.value = '';
    _autoGrow(event.target);
    return;
  }
  if (event.key !== 'Enter') return;
  if (event.ctrlKey) {
    // Why: Ctrl+Enter は IME 変換中かどうかに関わらず確定する。既存の add-path
    // idiom を踏襲 — Ctrl+Enter は変換確定とは別の、明示的な「確定」操作である。
    // @see EARS-003#REQ-E007
    window.__fsm.addDoDFromInput(nodeId);
    return;
  }
  // plain Enter（IME 変換中を含む）は textarea 標準動作で改行を挿入する。何もしない。
}

// -------------------------------------------------------
// Phase 2: インライン編集
// @see EARS-003#REQ-E003
// -------------------------------------------------------

function _attachDodInlineEdit(node) {
  const dodList = document.getElementById('dodList');
  if (!dodList) return;

  dodList.querySelectorAll('.dod-text[data-dod-id]').forEach(span => {
    const dodId = span.dataset.dodId;
    // Why: delegate to _activateInlineEdit instead of duplicating
    // The click-to-edit body used to be byte-for-byte identical to
    // _activateInlineEdit's logic (both take span/node/dodId and perform the
    // same replace-with-editable-field → commit/cancel flow). Delegating means
    // the textarea conversion (auto-grow, Ctrl+Enter, Escape) lives in one place.
    span.addEventListener('click', () => {
      _activateInlineEdit(span, node, dodId);
    });
  });
}

/** インライン編集を span 要素に対して直接起動する（初回クリック・再付与の両方から呼ばれる） */
function _activateInlineEdit(span, node, dodId) {
  const prevText = span.textContent;

  // <span> → <textarea> に切り替え
  const textarea = document.createElement('textarea');
  textarea.className = 'dod-inline-input field-input';
  textarea.value = prevText;
  textarea.rows = 1;
  textarea.style.flex = '1';
  textarea.style.minWidth = '0';
  span.replaceWith(textarea);
  textarea.focus();
  textarea.select();
  // 複数行の既存テキストを編集開始した場合でも、開いた瞬間から全文が見える高さにする
  _autoGrow(textarea);

  const commit = () => {
    // @see EARS-003#REQ-W003
    const newText = textarea.value.trim();
    // 空テキストは直前値に戻す（削除しない）
    const finalText = newText === '' ? prevText : newText;
    const restored = document.createElement('span');
    restored.className = 'dod-text';
    restored.dataset.dodId = dodId;
    restored.textContent = finalText;
    // 再クリックで再編集できるよう再付与
    textarea.replaceWith(restored);

    if (newText !== '' && finalText !== prevText) {
      // @see EARS-003#REQ-E007
      // FSM データを更新して dirty マーク（改行を含め入力値をそのまま保存）
      const dItem = node.dod.find(d => d.id === dodId);
      if (dItem) {
        dItem.text = finalText;
        markDirty();
      }
    }
    // 新しい span に再帰的にイベントを付与
    restored.addEventListener('click', () => {
      _activateInlineEdit(restored, node, dodId);
    });
  };

  const cancel = () => {
    // @see EARS-003#REQ-E008
    const restored = document.createElement('span');
    restored.className = 'dod-text';
    restored.dataset.dodId = dodId;
    restored.textContent = prevText;
    textarea.replaceWith(restored);
    restored.addEventListener('click', () => {
      _activateInlineEdit(restored, node, dodId);
    });
  };

  textarea.addEventListener('input', () => _autoGrow(textarea));
  textarea.addEventListener('blur', commit);
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      textarea.removeEventListener('blur', commit);
      cancel();
      return;
    }
    if (e.key !== 'Enter') return;
    if (e.ctrlKey) {
      // Why: Ctrl+Enter は IME 変換中かどうかに関わらず確定する — DoD 追加
      // textarea の既存 idiom（_handleDodAddKeydown）と挙動を揃える。明示的な
      // Ctrl+Enter は IME 確定とは別の「確定」操作なので isComposing は無視してよい。
      e.preventDefault();
      textarea.removeEventListener('blur', commit);
      commit();
    }
    // plain Enter（IME 変換中を含む）は textarea 標準動作で改行を挿入する。何もしない。
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
  autoGrow: _autoGrow,
};

// @see EARS-001#REQ-E004
// @see EARS-004#REQ-E001
function renderEdgePanel(edge) {
  const content = document.getElementById('panelContent');
  const from    = FSM.nodes[edge.fromNode];
  const to      = FSM.nodes[edge.toNode];

  // Why: 旧実装ではタイトル "Edge" 直下に独立した <div>id: xxx</div> が並んでいた。
  // 仕様 (feat-fsm-id-visibility) で ID は panel-section-title に統合する方針に変更。
  // 縦方向の情報密度を上げ、Node パネルと表現を揃える。
  content.innerHTML = `
    <div class="panel-section">
      <div class="panel-section-title">Edge（id=${escHtml(edge.id)}）</div>
      <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);margin-bottom:10px">
        ${from ? escHtml(from.name) : '?'} → ${to ? escHtml(to.name) : '?'}
      </div>
      <div class="field-group">
        <label class="field-label">Label (transition condition)</label>
        <input class="field-input" value="${escHtml(edge.label)}"
          onchange="window.__fsm.updateEdgeLabel('${edge.id}', this.value)" />
      </div>
      ${edge.guard ? `
      <div class="verification-gate" style="margin-top:8px">
        <span class="verification-gate-icon">🔒</span>
        Guard: ${escHtml(edge.guard)} — transition requires source to be done
      </div>` : ''}
    </div>
    <div style="padding-top:4px">
      <button class="btn btn-danger" style="width:100%"
        onclick="window.__fsm.deleteSelectedEdge()">Delete Edge</button>
    </div>
  `;
}

