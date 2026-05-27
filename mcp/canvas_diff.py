"""Canvas JSON間の差分を計算(座標無視)"""
from typing import Any


def _node_signature(node: dict) -> dict:
    """比較対象フィールドのみ抽出(座標・サイズは除外)"""
    return {
        "name": node.get("name"),
        "status": node.get("status"),
        "dod": node.get("dod", []),
    }


def _edge_signature(edge: dict) -> dict:
    return {
        "fromNode": edge.get("fromNode"),
        "toNode": edge.get("toNode"),
        "label": edge.get("label", ""),
    }


def diff_canvas(prev: dict, curr: dict) -> dict:
    """前回と現在のCanvasを比較し、変更内容を返す"""
    prev_nodes = {n["id"]: n for n in prev.get("nodes", [])}
    curr_nodes = {n["id"]: n for n in curr.get("nodes", [])}
    prev_edges = {e["id"]: e for e in prev.get("edges", [])}
    curr_edges = {e["id"]: e for e in curr.get("edges", [])}

    node_added = [curr_nodes[i] for i in curr_nodes if i not in prev_nodes]
    node_removed = [prev_nodes[i] for i in prev_nodes if i not in curr_nodes]
    node_changed = []
    for i in curr_nodes.keys() & prev_nodes.keys():
        ps, cs = _node_signature(prev_nodes[i]), _node_signature(curr_nodes[i])
        if ps != cs:
            node_changed.append({
                "id": i,
                "name": curr_nodes[i].get("name"),
                "before": ps,
                "after": cs,
            })

    edge_added = [curr_edges[i] for i in curr_edges if i not in prev_edges]
    edge_removed = [prev_edges[i] for i in prev_edges if i not in curr_edges]
    edge_changed = []
    for i in curr_edges.keys() & prev_edges.keys():
        ps, cs = _edge_signature(prev_edges[i]), _edge_signature(curr_edges[i])
        if ps != cs:
            edge_changed.append({"id": i, "before": ps, "after": cs})

    return {
        "nodes": {"added": node_added, "removed": node_removed, "changed": node_changed},
        "edges": {"added": edge_added, "removed": edge_removed, "changed": edge_changed},
    }


def format_diff(diff: dict) -> str:
    """差分を人間可読なMarkdownに整形"""
    lines = []
    n = diff["nodes"]
    e = diff["edges"]

    if n["added"]:
        lines.append("**ノード追加:**")
        for x in n["added"]:
            lines.append(f"- `{x['id']}` {x.get('name', '')}")

    if n["removed"]:
        lines.append("**ノード削除:**")
        for x in n["removed"]:
            lines.append(f"- `{x['id']}` {x.get('name', '')}")

    if n["changed"]:
        lines.append("**ノード変更:**")
        for x in n["changed"]:
            lines.append(f"- `{x['id']}` {x['name']}")
            b, a = x["before"], x["after"]
            if b["name"] != a["name"]:
                lines.append(f"  - name: `{b['name']}` → `{a['name']}`")
            if b["status"] != a["status"]:
                lines.append(f"  - status: `{b['status']}` → `{a['status']}`")
            if b["dod"] != a["dod"]:
                bt = {d["text"] for d in b["dod"]}
                at = {d["text"] for d in a["dod"]}
                for t in at - bt:
                    lines.append(f"  - DoD追加: {t}")
                for t in bt - at:
                    lines.append(f"  - DoD削除: {t}")

    if e["added"]:
        lines.append("**エッジ追加:**")
        for x in e["added"]:
            label = f" (label: {x['label']})" if x.get("label") else ""
            lines.append(f"- `{x['fromNode']}` → `{x['toNode']}`{label}")

    if e["removed"]:
        lines.append("**エッジ削除:**")
        for x in e["removed"]:
            label = f" (label: {x['label']})" if x.get("label") else ""
            lines.append(f"- `{x['fromNode']}` → `{x['toNode']}`{label}")

    if e["changed"]:
        lines.append("**エッジ変更:**")
        for x in e["changed"]:
            b, a = x["before"], x["after"]
            lines.append(f"- `{x['id']}`: {b['fromNode']}→{b['toNode']} ⇒ {a['fromNode']}→{a['toNode']}")

    return "\n".join(lines) if lines else ""
