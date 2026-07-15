#!/usr/bin/env python3
"""Regression tests for canvas_diff.py — embedded-newline handling.

Run:
    python3 -m pytest test_canvas_diff.py -v
"""
from canvas_diff import diff_canvas, format_diff, _flatten


# ---------------------------------------------------------------------------
# _flatten — direct unit coverage
# ---------------------------------------------------------------------------

class TestFlatten:
    def test_embedded_newline_becomes_space(self):
        assert _flatten("line1\nline2") == "line1 line2"

    def test_no_newline_unchanged(self):
        assert _flatten("plain") == "plain"

    def test_none_stringified(self):
        assert _flatten(None) == "None"


# ---------------------------------------------------------------------------
# format_diff — embedded newline in node name (Bug #3)
# ---------------------------------------------------------------------------

class TestFormatDiffNodeNameNewline:
    """Regression: an embedded \\n in a node name must not split a bullet
    line across multiple raw Markdown lines."""

    def test_node_added_name_with_newline(self):
        prev = {"nodes": [], "edges": []}
        curr = {
            "nodes": [
                {"id": "s1", "name": "Multi\nLine\nName", "status": None, "dod": []},
            ],
            "edges": [],
        }
        diff = diff_canvas(prev, curr)
        out = format_diff(diff)
        lines = out.split("\n")
        # Exactly 2 lines: the header and the single bullet.
        assert lines == ["**Nodes added:**", "- `s1` Multi Line Name"]
        assert not any("\n" in line for line in lines)

    def test_node_name_changed_with_newline(self):
        prev = {
            "nodes": [
                {"id": "s1", "name": "Old\nName", "status": None, "dod": []},
            ],
            "edges": [],
        }
        curr = {
            "nodes": [
                {"id": "s1", "name": "New\nName", "status": None, "dod": []},
            ],
            "edges": [],
        }
        diff = diff_canvas(prev, curr)
        out = format_diff(diff)
        for line in out.split("\n"):
            assert "\n" not in line
        assert "- `s1` New Name" in out.split("\n")
        assert "  - name: `Old Name` → `New Name`" in out.split("\n")


# ---------------------------------------------------------------------------
# format_diff — embedded newline in edge label (Bug #3)
# ---------------------------------------------------------------------------

class TestFormatDiffEdgeLabelNewline:
    def test_edge_added_label_with_newline(self):
        prev = {"nodes": [], "edges": []}
        curr = {
            "nodes": [],
            "edges": [
                {"id": "e1", "fromNode": "s1", "toNode": "s2", "label": "go\nnow"},
            ],
        }
        diff = diff_canvas(prev, curr)
        out = format_diff(diff)
        lines = out.split("\n")
        assert lines == ["**Edges added:**", "- `s1` → `s2` (label: go now)"]
        assert not any("\n" in line for line in lines)


# ---------------------------------------------------------------------------
# format_diff — embedded newline in DoD text (Bug #4)
# ---------------------------------------------------------------------------

class TestFormatDiffDodTextNewline:
    """Regression: DoD added/removed text with an embedded \\n must not
    split its bullet line."""

    def test_dod_added_text_with_newline(self):
        prev = {
            "nodes": [
                {"id": "s1", "name": "Node", "status": None, "dod": []},
            ],
            "edges": [],
        }
        curr = {
            "nodes": [
                {"id": "s1", "name": "Node", "status": None,
                 "dod": [{"text": "must\npass tests", "type": "verification"}]},
            ],
            "edges": [],
        }
        diff = diff_canvas(prev, curr)
        out = format_diff(diff)
        lines = out.split("\n")
        assert not any("\n" in line for line in lines)
        assert "  - DoD added: must pass tests" in lines
        # Expected bullet count: header, node bullet, DoD added bullet = 3 lines.
        assert lines == ["**Nodes changed:**", "- `s1` Node", "  - DoD added: must pass tests"]

    def test_dod_removed_text_with_newline(self):
        prev = {
            "nodes": [
                {"id": "s1", "name": "Node", "status": None,
                 "dod": [{"text": "old\ncriterion", "type": "verification"}]},
            ],
            "edges": [],
        }
        curr = {
            "nodes": [
                {"id": "s1", "name": "Node", "status": None, "dod": []},
            ],
            "edges": [],
        }
        diff = diff_canvas(prev, curr)
        out = format_diff(diff)
        lines = out.split("\n")
        assert not any("\n" in line for line in lines)
        assert "  - DoD removed: old criterion" in lines
