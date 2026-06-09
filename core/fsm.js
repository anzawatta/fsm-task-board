// ============================================================
// FSM TASK BOARD — Core Data Model
// DOM依存ゼロ。テスト可能な純粋データ操作層。
//
// JSON Schema準拠:
//   nodes[]      — Canvas必須 (旧: states[])
//   edges[].id   — Canvas必須
//   edges[].fromNode / toNode — Canvas必須 (旧: from / to)
//   node.width / height      — Canvas必須
//   node.status / dod        — 独自拡張フィールド
// ============================================================

export const DEFAULT_NODE_W = 160;
export const DEFAULT_NODE_H = 56;

const FSM = {
  nodes: {},   // Canvas準拠: 旧 states
  edges: {},
  _idCounter: 0,
  _edgeIdCounter: 0,
  // @see EARS-001#REQ-U002
  // Why: Independent counter for g{N} IDs — must never share state with _idCounter
  // so that resetting one counter cannot affect the other (EARS-001 REQ-W007).
  _groupIdCounter: 0,

  // @see EARS-001#REQ-U001
  // @see EARS-006#REQ-W002
  genId()     { return 's' + (++this._idCounter); },
  // @see EARS-001#REQ-U001
  // @see EARS-006#REQ-W002
  genEdgeId() { return 'e' + (++this._edgeIdCounter); },
  // @see EARS-001#REQ-E001
  // @see EARS-001#REQ-U002
  genGroupId() { return 'g' + (++this._groupIdCounter); },

  // @see EARS-001#REQ-E002
  // @see EARS-001#REQ-E003
  // @see EARS-006#REQ-U002
  addNode(name, x, y, width, height, opts) {
    const type     = (opts && opts.type)     || 'text';
    const parentId = (opts && opts.parentId != null) ? opts.parentId : null;
    // @see EARS-001#REQ-E002
    // Why: group nodes get g{N} IDs; text nodes get s{N} IDs — never share ID space.
    const id = type === 'group' ? this.genGroupId() : this.genId();
    this.nodes[id] = {
      id,
      name,
      x,
      y,
      width:  width  || DEFAULT_NODE_W,
      height: height || DEFAULT_NODE_H,
      status: 'idle',
      dod:    [],
      type,
      parentId,
    };
    return id;
  },

  // @see EARS-001#REQ-U002
  // @see EARS-006#REQ-U003
  addEdge(fromNode, toNode, label, guard) {
    const id = this.genEdgeId();
    this.edges[id] = { id, fromNode, toNode, label: label || '', guard: guard || null };
    return id;
  },

  // @see EARS-001#REQ-E005
  // @see EARS-001#REQ-S002
  // @see EARS-001#REQ-W001
  removeNode(id) {
    // @see EARS-001#REQ-S002
    // @see EARS-001#REQ-E005
    // Why: group deletion must orphan children (reset parentId → null) rather than
    // cascade-deleting them (EARS-001 REQ-S002, EARS-002 REQ-W002).
    const node = this.nodes[id];
    if (node && node.type === 'group') {
      Object.values(this.nodes).forEach(n => {
        if (n.parentId === id) n.parentId = null;
      });
    }
    delete this.nodes[id];
    Object.keys(this.edges).forEach(eid => {
      const e = this.edges[eid];
      // @see EARS-001#REQ-W001
      if (e.fromNode === id || e.toNode === id) delete this.edges[eid];
    });
  },

  // @see EARS-001#REQ-E006
  removeEdge(id) { delete this.edges[id]; },

  // @see EARS-003#REQ-E002
  addDoDItem(nodeId, text, type) {
    const node = this.nodes[nodeId];
    if (!node) return;
    const item = {
      id: 'd' + Date.now() + Math.random().toString(36).slice(2, 5),
      text, type: type || 'verification', checked: false
    };
    node.dod.push(item);
    return item;
  },

  // @see EARS-003#REQ-E006
  removeDoDItem(nodeId, dodId) {
    const node = this.nodes[nodeId];
    if (!node) return;
    node.dod = node.dod.filter(d => d.id !== dodId);
  },

  // @see EARS-003#REQ-E004
  updateDoDItemType(nodeId, dodId, newType) {
    const node = this.nodes[nodeId];
    if (!node) return;
    const item = node.dod.find(d => d.id === dodId);
    if (item) item.type = newType;
  },

  // @see EARS-004#REQ-U001
  // @see EARS-004#REQ-W001
  hasUncheckedVerification(nodeId) {
    const node = this.nodes[nodeId];
    if (!node) return false;
    return node.dod.some(d => d.type === 'verification' && !d.checked);
  },

  // 後方互換エイリアス
  hasUncheckedValidation(nodeId) { return this.hasUncheckedVerification(nodeId); },

  allValidationChecked(nodeId) {
    const node = this.nodes[nodeId];
    if (!node) return true;
    const validation = node.dod.filter(d => d.type === 'validation');
    if (validation.length === 0) return true;
    return validation.every(d => d.checked);
  },

  allDoDChecked(nodeId) {
    const node = this.nodes[nodeId];
    if (!node || node.dod.length === 0) return false;
    return node.dod.every(d => d.checked);
  },

  // -------------------------------------------------------
  // Canvas JSON Schema Export
  // -------------------------------------------------------
  // @see EARS-001#REQ-U006
  // @see EARS-006#REQ-U001
  // @see EARS-006#REQ-U002
  // @see EARS-006#REQ-U003
  toJSON() {
    return JSON.stringify({
      nodes: Object.values(this.nodes).map(n => ({
        id:       n.id,
        name:     n.name,
        x:        Math.round(n.x),
        y:        Math.round(n.y),
        width:    n.width,
        height:   n.height,
        status:   n.status,
        // @see EARS-001#REQ-U006
        // Why: explicit allowlist (no spread/Object.assign) ensures only known fields
        // are serialized; type and parentId must appear for every node including
        // text nodes with null parentId (EARS-001 REQ-U006).
        type:     n.type     || 'text',
        parentId: n.parentId != null ? n.parentId : null,
        dod: n.dod.map(d => ({
          text:    d.text,
          type:    d.type,
          checked: d.checked
        }))
      })),
      edges: Object.values(this.edges).map(e => {
        const obj = { id: e.id, fromNode: e.fromNode, toNode: e.toNode, label: e.label };
        if (e.guard) obj.guard = e.guard;
        return obj;
      })
    }, null, 2);
  },

  // -------------------------------------------------------
  // Canvas JSON Schema Import
  // (後方互換: states[] / from / to も受容)
  // -------------------------------------------------------
  // @see EARS-001#REQ-E004
  // @see EARS-001#REQ-U007
  // @see EARS-001#REQ-W001
  // @see EARS-001#REQ-W003
  // @see EARS-001#REQ-W004
  // @see EARS-001#REQ-W005
  // @see EARS-006#REQ-E001
  // @see EARS-006#REQ-U004
  // @see EARS-006#REQ-U005
  fromJSON(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;

    const rawNodes = data.nodes || data.states || [];

    // --- Validate type domain (EARS-001 REQ-W001) ---
    // @see EARS-001#REQ-W001
    // Why: undefined/null type is accepted for backward compat (EARS-001 REQ-W005);
    // any other non-standard string must halt loading with an error.
    for (const n of rawNodes) {
      const t = n.type;
      if (t !== undefined && t !== null && t !== 'text' && t !== 'group') {
        alert(`fromJSON: ノード "${n.id}" に無効な type 値 "${t}" が含まれています。読み込みを中止します。`);
        return null;
      }
    }

    // --- Build a temporary id→type map for parentId validation ---
    const idTypeMap = {};
    for (const n of rawNodes) {
      const id = n.id;
      if (id) idTypeMap[id] = n.type || 'text';
    }

    // --- Validate parentId references (EARS-001 REQ-W002) ---
    // @see EARS-001#REQ-W002
    for (const n of rawNodes) {
      if (n.parentId != null) {
        const parentType = idTypeMap[n.parentId];
        if (parentType === undefined) {
          alert(`fromJSON: ノード "${n.id}" の parentId "${n.parentId}" が存在しません。読み込みを中止します。`);
          return null;
        }
        if (parentType !== 'group') {
          alert(`fromJSON: ノード "${n.id}" の parentId "${n.parentId}" は group ノードではありません。読み込みを中止します。`);
          return null;
        }
      }
    }

    // --- Validate circular references and max depth (EARS-001 REQ-W003, REQ-W004) ---
    // @see EARS-001#REQ-W003
    // @see EARS-001#REQ-W004
    // @see EARS-001#REQ-U005
    const parentIdMap = {};
    for (const n of rawNodes) {
      if (n.id) parentIdMap[n.id] = n.parentId != null ? n.parentId : null;
    }
    for (const n of rawNodes) {
      let visited = new Set();
      let current = n.id;
      let depth = 0;
      while (parentIdMap[current] != null) {
        current = parentIdMap[current];
        depth++;
        if (visited.has(current)) {
          alert(`fromJSON: ノード "${n.id}" の parentId チェーンに循環参照が検出されました。読み込みを中止します。`);
          return null;
        }
        if (depth > 3) {
          alert(`fromJSON: ノード "${n.id}" の親子チェーンが深さ 3 を超えています。読み込みを中止します。`);
          return null;
        }
        visited.add(current);
      }
    }

    // --- All validation passed; commit state ---
    this.nodes = {};
    this.edges = {};
    this._idCounter = 0;
    this._edgeIdCounter = 0;
    // @see EARS-001#REQ-U007
    this._groupIdCounter = 0;

    rawNodes.forEach(n => {
      const id = n.id || this.genId();
      // @see EARS-006#REQ-U004 — recalculate s{N} counter
      if (id.startsWith('s')) {
        const numId = parseInt(id.slice(1));
        if (!isNaN(numId) && numId > this._idCounter) this._idCounter = numId;
      }
      // @see EARS-001#REQ-U007 — recalculate g{N} counter
      if (id.startsWith('g')) {
        const numId = parseInt(id.slice(1));
        if (!isNaN(numId) && numId > this._groupIdCounter) this._groupIdCounter = numId;
      }
      // @see EARS-001#REQ-W005 — undefined type is backward-compatible; do NOT set it
      const storedType     = n.type;       // may be undefined for old s{N} nodes
      const storedParentId = n.parentId != null ? n.parentId : null;
      this.nodes[id] = {
        id,
        name:     n.name,
        x:        n.x,
        y:        n.y,
        width:    n.width  || DEFAULT_NODE_W,
        height:   n.height || DEFAULT_NODE_H,
        status:   n.status || 'idle',
        dod: (n.dod || []).map(d => ({
          id:      'd' + Date.now() + Math.random().toString(36).slice(2, 5),
          text:    d.text,
          type:    d.type || 'verification',
          checked: d.checked || false
        })),
        type:     storedType,    // preserve undefined for legacy nodes (REQ-W005)
        parentId: storedParentId,
      };
    });

    (data.edges || []).forEach(e => {
      const id = e.id || this.genEdgeId();
      const numId = parseInt(id.replace('e', ''));
      if (!isNaN(numId) && numId > this._edgeIdCounter) this._edgeIdCounter = numId;
      this.edges[id] = {
        id,
        fromNode: e.fromNode || e.from,
        toNode:   e.toNode   || e.to,
        label:    e.label || '',
        guard:    e.guard || null
      };
    });
  }
};

export default FSM;
