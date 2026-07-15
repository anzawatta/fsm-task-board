#!/usr/bin/env python3
"""Regression tests for canvas_to_md.py — embedded-newline handling.

Run:
    python3 -m pytest test_canvas_to_md.py -v
"""
from canvas_to_md import to_mermaid, sanitize_label, convert


# ---------------------------------------------------------------------------
# sanitize_label — direct unit coverage
# ---------------------------------------------------------------------------

class TestSanitizeLabel:
    def test_embedded_newline_becomes_br(self):
        assert sanitize_label("line1\nline2") == "line1<br/>line2"

    def test_quote_still_escaped(self):
        assert sanitize_label('say "hi"') == 'say \\"hi\\"'

    def test_quote_and_newline_together(self):
        assert sanitize_label('a "b"\nc') == 'a \\"b\\"<br/>c'


# ---------------------------------------------------------------------------
# to_mermaid — embedded newline in node name / edge label
# ---------------------------------------------------------------------------

class TestToMermaidEmbeddedNewline:
    """Regression: a raw \\n in node.name / edge.label must not corrupt
    Mermaid's line-oriented flowchart grammar — it must become a single
    physical line with a <br/> in place of the newline."""

    def test_node_name_with_newline_is_single_line(self):
        nodes = [
            {"id": "s1", "name": "Multi\nLine\nName", "status": None, "dod": []},
        ]
        edges = []
        out = to_mermaid(nodes, edges)
        assert "<br/>" in out
        # No physical line inside the mermaid block should contain a raw
        # embedded newline splitting a single node statement — i.e. the
        # node's rendered name never appears as a bare "Multi" on its own
        # line followed by "Line" on the next.
        for line in out.split("\n"):
            assert "Multi" not in line or "s1[" in line
        # The full multi-line name (flattened via <br/>) appears on one line.
        assert '    s1["Multi<br/>Line<br/>Name"]' in out.split("\n")

    def test_edge_label_with_newline_is_single_line(self):
        nodes = [
            {"id": "s1", "name": "A", "status": None, "dod": []},
            {"id": "s2", "name": "B", "status": None, "dod": []},
        ]
        edges = [
            {"id": "e1", "fromNode": "s1", "toNode": "s2", "label": "go\nnow"},
        ]
        out = to_mermaid(nodes, edges)
        assert "<br/>" in out
        assert '    s1 -->|go<br/>now| s2' in out.split("\n")
        # No raw "go" / "now" split across two physical lines.
        lines = out.split("\n")
        assert not any(line.strip() == "go" for line in lines)
        assert not any(line.strip() == "now" for line in lines)

    def test_group_subgraph_name_with_newline(self):
        """Embedded newline in a group node's name (subgraph header) must
        also be flattened to <br/>, not left as a raw line break."""
        nodes = [
            {"id": "g1", "name": "Group\nHeader", "type": "group", "parentId": None},
            {"id": "s1", "name": "Child", "status": None, "dod": [], "parentId": "g1"},
        ]
        edges = []
        out = to_mermaid(nodes, edges)
        assert '    subgraph g1 ["Group<br/>Header"]' in out.split("\n")

    def test_convert_end_to_end_no_raw_newline_in_mermaid_block(self):
        canvas = {
            "nodes": [
                {"id": "s1", "name": "Line A\nLine B", "status": None, "dod": []},
            ],
            "edges": [],
        }
        out = convert(canvas)
        # Extract the mermaid fenced block.
        start = out.index("```mermaid")
        end = out.index("```", start + 1)
        block = out[start:end]
        assert "<br/>" in block
        assert "\nLine B" not in block  # would indicate an unescaped raw newline
