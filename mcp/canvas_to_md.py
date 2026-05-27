#!/usr/bin/env python3
"""JSON Canvas拡張 → Markdown(Mermaid + DoD) コンバータ"""
import json
import sys
from pathlib import Path


def sanitize_label(text: str) -> str:
    """Mermaidラベル内のダブルクォートをエスケープ"""
    return text.replace('"', '\\"')


def to_mermaid(nodes: list, edges: list) -> str:
    lines = ["```mermaid", "flowchart LR"]
    for n in nodes:
        nid = n["id"]
        name = sanitize_label(n.get("name", nid))
        lines.append(f'    {nid}["{name}"]')
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
            t = item.get("type", "")
            suffix = f" _({t})_" if t else ""
            parts.append(f"- {item['text']}{suffix}")
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
