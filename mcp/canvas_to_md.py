#!/usr/bin/env python3
"""JSON Canvas拡張 → Markdown(Mermaid + DoD) コンバータ"""
import json
import sys
from pathlib import Path


def sanitize_label(text: str) -> str:
    """Mermaidラベル内のダブルクォートをエスケープし、改行を<br/>に変換"""
    # Why: embedded-newline handling for Mermaid labels
    # Mermaid's flowchart grammar is line-oriented — a raw \n inside a quoted
    # node/edge label string would break the statement across physical lines
    # and corrupt parsing. Mermaid's renderer supports <br/> inside quoted
    # labels as an intentional line break, so substituting it here preserves
    # the multi-line content (which the browser-side UI already treats as
    # meaningful) instead of silently collapsing/destroying it.
    return text.replace('"', '\\"').replace("\n", "<br/>")


def _compute_depth(node_id: str, id_map: dict) -> int:
    """Return ancestor depth of node_id (0 = root)."""
    depth = 0
    current_id: str | None = node_id
    visited: set[str] = set()
    while True:
        node = id_map.get(current_id)
        if node is None:
            break
        parent_id = node.get("parentId")
        if parent_id is None:
            break
        if parent_id in visited:
            break  # circular — treat as root
        visited.add(current_id)  # type: ignore[arg-type]
        current_id = parent_id
        depth += 1
    return depth


# @see EARS-012#REQ-U005
# @see EARS-012#REQ-U006
# @see EARS-012#REQ-W005
def to_mermaid(nodes: list, edges: list) -> str:
    """Generate a Mermaid flowchart, emitting group nodes as subgraph blocks.

    EARS-012 REQ-U005: group nodes with children → subgraph … end.
    EARS-012 REQ-U006: subgraph nesting capped at depth 2; deeper groups rendered flat.
    EARS-012 REQ-W005: empty group nodes rendered as plain flowchart nodes.
    """
    lines = ["```mermaid", "flowchart LR"]

    id_map: dict = {n["id"]: n for n in nodes}

    # Collect children for each group node
    group_children: dict[str, list[str]] = {}
    for n in nodes:
        pid = n.get("parentId")
        if pid is not None:
            group_children.setdefault(pid, []).append(n["id"])

    # Track which node IDs have been emitted (inside a subgraph)
    emitted: set[str] = set()

    def emit_node_line(n: dict) -> str:
        nid = n["id"]
        name = sanitize_label(n.get("name", nid))
        return f'    {nid}["{name}"]'

    def emit_subgraph(group_node: dict, indent: str = "    ") -> list[str]:
        """Recursively emit a subgraph block for a group node."""
        nid = group_node["id"]
        name = sanitize_label(group_node.get("name", nid))
        block: list[str] = [f'{indent}subgraph {nid} ["{name}"]']
        children = group_children.get(nid, [])
        # Sort children for stable output (total-order key: id)
        for cid in sorted(children):
            child = id_map.get(cid)
            if child is None:
                continue
            child_depth = _compute_depth(cid, id_map)
            # @see EARS-012#REQ-U006
            # Why: Mermaid subgraph nesting is capped at 2 levels (depth 0 outer,
            # depth 1 inner). Child groups at depth >= 2 are rendered as plain nodes
            # to avoid Mermaid parser limitations (ADV-001). REQ-U006 says
            # "Group nodes at depth 3 shall be flat" — conservative: cap at depth ≤ 1.
            if child.get("type") == "group" and child_depth <= 1:
                block.extend(emit_subgraph(child, indent + "    "))
            else:
                block.append(f'{indent}    {cid}["{sanitize_label(child.get("name", cid))}"]')
            emitted.add(cid)
        block.append(f'{indent}end')
        emitted.add(nid)
        return block

    # Identify top-level group nodes (parentId is null/None) that have children
    # Emit them first so their members are declared before edges.
    top_level_groups = [
        n for n in nodes
        if n.get("type") == "group" and n.get("parentId") is None
    ]
    # Sort for stable output
    for grp in sorted(top_level_groups, key=lambda n: n["id"]):
        children = group_children.get(grp["id"], [])
        grp_depth = _compute_depth(grp["id"], id_map)
        # @see EARS-012#REQ-W005 — empty group rendered as plain node
        if not children:
            lines.append(emit_node_line(grp))
            emitted.add(grp["id"])
        elif grp_depth <= 1:
            # @see EARS-012#REQ-U005
            lines.extend(emit_subgraph(grp))
        else:
            # depth > 1 top-level group shouldn't exist, but handle defensively
            lines.append(emit_node_line(grp))
            emitted.add(grp["id"])

    # Emit remaining nodes that haven't been emitted inside a subgraph
    for n in nodes:
        if n["id"] not in emitted:
            lines.append(emit_node_line(n))

    for e in edges:
        label = e.get("label", "")
        arrow = f'-->|{sanitize_label(label)}|' if label else "-->"
        lines.append(f'    {e["fromNode"]} {arrow} {e["toNode"]}')
    lines.append("```")
    return "\n".join(lines)


def to_dod_section(nodes: list) -> str:
    parts = ["## 各ノードの DoD"]
    has_any = False
    for n in nodes:
        dod = n.get("dod", [])
        if not dod:
            continue
        has_any = True
        parts.append(f"### {n['name']}")
        for item in dod:
            if isinstance(item, str):
                # Why: defensive handling for pre-existing canvas data where dod items
                # may be plain strings instead of {"text":...,"type":...} dicts.
                parts.append(f"- {item}")
            else:
                t = item.get("type", "")
                suffix = f" _({t})_" if t else ""
                parts.append(f"- {item.get('text', str(item))}{suffix}")
        parts.append("")  # blank line
    return "\n".join(parts) if has_any else ""


def convert(canvas: dict) -> str:
    nodes = canvas.get("nodes", [])
    edges = canvas.get("edges", [])
    md = [to_mermaid(nodes, edges), ""]
    dod = to_dod_section(nodes)
    if dod:
        md.append(dod)
    return "\n".join(md)


def main():
    if len(sys.argv) < 2:
        print("Usage: canvas_to_md.py <input.json> [output.md]", file=sys.stderr)
        sys.exit(1)
    src = Path(sys.argv[1])
    canvas = json.loads(src.read_text(encoding="utf-8"))
    out_md = convert(canvas)
    if len(sys.argv) >= 3:
        Path(sys.argv[2]).write_text(out_md, encoding="utf-8")
    else:
        print(out_md)


if __name__ == "__main__":
    main()
