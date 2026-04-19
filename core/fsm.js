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

  genId()     { return 's' + (++this._idCounter); },
  genEdgeId() { return 'e' + (++this._edgeIdCounter); },

  addNode(name, x, y, width, height) {
    const id = this.genId();
    this.nodes[id] = {
      id,
      name,
      x,
      y,
      width:  width  || DEFAULT_NODE_W,
      height: height || DEFAULT_NODE_H,
      status: 'idle',
      dod: []
    };
    return id;
  },

  addEdge(fromNode, toNode, label, guard) {
    const id = this.genEdgeId();
    this.edges[id] = { id, fromNode, toNode, label: label || '', guard: guard || null };
    return id;
  },

  removeNode(id) {
    delete this.nodes[id];
    Object.keys(this.edges).forEach(eid => {
      const e = this.edges[eid];
      if (e.fromNode === id || e.toNode === id) delete this.edges[eid];
    });
  },

  removeEdge(id) { delete this.edges[id]; },

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

  removeDoDItem(nodeId, dodId) {
    const node = this.nodes[nodeId];
    if (!node) return;
    node.dod = node.dod.filter(d => d.id !== dodId);
  },

  updateDoDItemType(nodeId, dodId, newType) {
    const node = this.nodes[nodeId];
    if (!node) return;
    const item = node.dod.find(d => d.id === dodId);
    if (item) item.type = newType;
  },

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
  toJSON() {
    return JSON.stringify({
      nodes: Object.values(this.nodes).map(n => ({
        id:     n.id,
        name:   n.name,
        x:      Math.round(n.x),
        y:      Math.round(n.y),
        width:  n.width,
        height: n.height,
        status: n.status,
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
  fromJSON(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    this.nodes = {};
    this.edges = {};
    this._idCounter = 0;
    this._edgeIdCounter = 0;

    const rawNodes = data.nodes || data.states || [];
    rawNodes.forEach(n => {
      const id = n.id || this.genId();
      const numId = parseInt(id.replace('s', ''));
      if (!isNaN(numId) && numId > this._idCounter) this._idCounter = numId;
      this.nodes[id] = {
        id,
        name:   n.name,
        x:      n.x,
        y:      n.y,
        width:  n.width  || DEFAULT_NODE_W,
        height: n.height || DEFAULT_NODE_H,
        status: n.status || 'idle',
        dod: (n.dod || []).map(d => ({
          id:      'd' + Date.now() + Math.random().toString(36).slice(2, 5),
          text:    d.text,
          type:    d.type || 'verification',
          checked: d.checked || false
        }))
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
