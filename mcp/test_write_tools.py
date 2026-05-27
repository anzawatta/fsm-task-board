#!/usr/bin/env python3
"""Negative-fixture tests for canvas_reader_mcp write tools.

All adversarial conditions must return error dicts — never raise exceptions.

Run:
    python3 -m pytest test_write_tools.py -v
"""
import json
import os
import sys
import tempfile
from pathlib import Path

# ---------------------------------------------------------------------------
# Setup: point CANVAS_DIR at a temp directory so _safe_path() works
# ---------------------------------------------------------------------------
_tmpdir = tempfile.mkdtemp(prefix="canvas_mcp_test_")
os.environ["CANVAS_DIR"] = _tmpdir
os.environ["CANVAS_SNAPSHOT_DIR"] = str(Path(_tmpdir) / "snapshots")

# Import after env is set so module-level paths are evaluated with test env.
# Why: avoid importlib.reload — FastMCP wraps tool functions at import time;
# reload rebinds the module-level names but the MCP wrapper captures the
# original function object, so reload would leave callers calling the
# un-wrapped originals. Instead we import fresh (env already set above).
import canvas_reader_mcp as mcp_mod

# Re-bind the tool functions from the module.
add_node = mcp_mod.add_node
update_node = mcp_mod.update_node
add_edge = mcp_mod.add_edge
change_edge = mcp_mod.change_edge
remove_node = mcp_mod.remove_node
remove_edge = mcp_mod.remove_edge


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_canvas(filename: str, nodes=None, edges=None) -> Path:
    """Write a minimal canvas JSON to the test CANVAS_DIR."""
    canvas = {
        "nodes": nodes or [],
        "edges": edges or [],
    }
    path = Path(_tmpdir) / filename
    path.write_text(json.dumps(canvas, ensure_ascii=False), encoding="utf-8")
    # Reset mtime tracker so tests are independent.
    mcp_mod._last_mtime.pop(filename, None)
    return path


def _read_canvas(filename: str) -> dict:
    path = Path(_tmpdir) / filename
    return json.loads(path.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# add_node — negative fixtures
# ---------------------------------------------------------------------------

class TestAddNodeInvalidStatus:
    """REQ-W001: invalid status → error dict, no exception."""

    def test_todo_is_invalid(self):
        _make_canvas("n_status.json")
        result = add_node("n_status.json", name="X", status="todo")
        assert result["status"] == "error"
        assert result["reason"] == "invalid status"
        assert result["conflicting_id"] is None

    def test_done_and_more_is_invalid(self):
        _make_canvas("n_status2.json")
        result = add_node("n_status2.json", name="X", status="done_and_more")
        assert result["status"] == "error"
        assert result["reason"] == "invalid status"

    def test_in_progress_is_invalid(self):
        _make_canvas("n_status3.json")
        result = add_node("n_status3.json", name="X", status="in-progress")
        assert result["status"] == "error"
        assert result["reason"] == "invalid status"


class TestAddNodeNameTooLong:
    """REQ-W008: name > 80 chars → error dict."""

    def test_name_81_chars(self):
        _make_canvas("n_long.json")
        result = add_node("n_long.json", name="A" * 81)
        assert result["status"] == "error"
        assert result["reason"] == "name exceeds 80 characters"

    def test_name_exactly_80_chars_ok(self):
        _make_canvas("n_80.json")
        result = add_node("n_80.json", name="A" * 80)
        assert result["status"] == "created"
        assert "node" in result


class TestAddNodeIdSequence:
    """REQ-U002: IDs must be s{max+1}, never duplicate."""

    def test_first_node_gets_s1(self):
        _make_canvas("n_seq1.json")
        result = add_node("n_seq1.json", name="First")
        assert result["status"] == "created"
        assert result["node"]["id"] == "s1"

    def test_second_node_gets_s2(self):
        _make_canvas("n_seq2.json", nodes=[{"id": "s1", "x": 0, "y": 0,
                                            "width": 120, "height": 60,
                                            "name": "Existing", "status": None, "dod": []}])
        result = add_node("n_seq2.json", name="Second")
        assert result["node"]["id"] == "s2"

    def test_gap_in_ids_uses_max_plus_one(self):
        # Existing IDs: s1, s5 → next should be s6
        _make_canvas("n_gap.json", nodes=[
            {"id": "s1", "x": 0, "y": 0, "width": 120, "height": 60,
             "name": "A", "status": None, "dod": []},
            {"id": "s5", "x": 200, "y": 0, "width": 120, "height": 60,
             "name": "B", "status": None, "dod": []},
        ])
        result = add_node("n_gap.json", name="Third")
        assert result["node"]["id"] == "s6"

    def test_no_duplicate_ids_on_repeated_calls(self):
        """Each add_node re-reads → IDs must not collide."""
        _make_canvas("n_dup.json")
        r1 = add_node("n_dup.json", name="Node1", force=True)
        r2 = add_node("n_dup.json", name="Node2", force=True)
        assert r1["node"]["id"] != r2["node"]["id"]


# ---------------------------------------------------------------------------
# add_edge — negative fixtures
# ---------------------------------------------------------------------------

class TestAddEdgeOrphanNodes:
    """REQ-W002 / REQ-W003: fromNode / toNode must exist."""

    def _canvas_with_two_nodes(self, filename):
        _make_canvas(filename, nodes=[
            {"id": "s1", "x": 0, "y": 0, "width": 120, "height": 60,
             "name": "A", "status": None, "dod": []},
            {"id": "s2", "x": 200, "y": 0, "width": 120, "height": 60,
             "name": "B", "status": None, "dod": []},
        ])

    def test_from_node_not_found(self):
        self._canvas_with_two_nodes("e_orphan1.json")
        result = add_edge("e_orphan1.json", from_node="s99", to_node="s2")
        assert result["status"] == "error"
        assert result["reason"] == "fromNode not found"
        assert result["conflicting_id"] == "s99"

    def test_to_node_not_found(self):
        self._canvas_with_two_nodes("e_orphan2.json")
        result = add_edge("e_orphan2.json", from_node="s1", to_node="s99")
        assert result["status"] == "error"
        assert result["reason"] == "toNode not found"
        assert result["conflicting_id"] == "s99"

    def test_both_nodes_valid_succeeds(self):
        self._canvas_with_two_nodes("e_valid.json")
        result = add_edge("e_valid.json", from_node="s1", to_node="s2", label="go")
        assert result["status"] == "created"
        assert result["edge"]["id"] == "e1"


class TestAddEdgeLabelTooLong:
    """REQ-W008: label > 80 chars → error dict."""

    def test_label_81_chars(self):
        _make_canvas("e_long.json", nodes=[
            {"id": "s1", "x": 0, "y": 0, "width": 120, "height": 60,
             "name": "A", "status": None, "dod": []},
            {"id": "s2", "x": 200, "y": 0, "width": 120, "height": 60,
             "name": "B", "status": None, "dod": []},
        ])
        result = add_edge("e_long.json", from_node="s1", to_node="s2", label="L" * 81)
        assert result["status"] == "error"
        assert result["reason"] == "label exceeds 80 characters"


class TestAddEdgeIdSequence:
    """REQ-U003: edge IDs must be e{max+1}."""

    def test_first_edge_gets_e1(self):
        _make_canvas("e_seq.json", nodes=[
            {"id": "s1", "x": 0, "y": 0, "width": 120, "height": 60,
             "name": "A", "status": None, "dod": []},
            {"id": "s2", "x": 200, "y": 0, "width": 120, "height": 60,
             "name": "B", "status": None, "dod": []},
        ])
        result = add_edge("e_seq.json", from_node="s1", to_node="s2")
        assert result["edge"]["id"] == "e1"


# ---------------------------------------------------------------------------
# update_node — negative fixtures
# ---------------------------------------------------------------------------

class TestUpdateNodeInvalidStatus:
    """REQ-W001: invalid status on update_node."""

    def test_invalid_status_returns_error(self):
        _make_canvas("upd_status.json", nodes=[
            {"id": "s1", "x": 0, "y": 0, "width": 120, "height": 60,
             "name": "X", "status": None, "dod": []}
        ])
        result = update_node("upd_status.json", id="s1", status="todo")
        assert result["status"] == "error"
        assert result["reason"] == "invalid status"

    def test_valid_wip_succeeds(self):
        _make_canvas("upd_wip.json", nodes=[
            {"id": "s1", "x": 0, "y": 0, "width": 120, "height": 60,
             "name": "X", "status": None, "dod": []}
        ])
        result = update_node("upd_wip.json", id="s1", status="wip")
        assert result["status"] == "updated"
        assert result["node"]["status"] == "wip"


class TestUpdateNodeNameTooLong:
    """REQ-W008: name > 80 on update_node."""

    def test_name_too_long_returns_error(self):
        _make_canvas("upd_long.json", nodes=[
            {"id": "s1", "x": 0, "y": 0, "width": 120, "height": 60,
             "name": "X", "status": None, "dod": []}
        ])
        result = update_node("upd_long.json", id="s1", name="N" * 81)
        assert result["status"] == "error"
        assert result["reason"] == "name exceeds 80 characters"


class TestUpdateNodeDodPreserved:
    """REQ-E006: update_node must not touch dod field."""

    def test_dod_unchanged_after_name_update(self):
        dod = [{"text": "must pass tests", "type": "acceptance"}]
        _make_canvas("upd_dod.json", nodes=[
            {"id": "s1", "x": 0, "y": 0, "width": 120, "height": 60,
             "name": "X", "status": None, "dod": dod}
        ])
        result = update_node("upd_dod.json", id="s1", name="Y")
        assert result["status"] == "updated"
        canvas = _read_canvas("upd_dod.json")
        assert canvas["nodes"][0]["dod"] == dod


# ---------------------------------------------------------------------------
# change_edge — negative fixtures
# ---------------------------------------------------------------------------

class TestChangeEdgeOrphanNodes:
    """REQ-W002 / REQ-W003 applied to change_edge."""

    def _canvas(self, filename):
        _make_canvas(filename, nodes=[
            {"id": "s1", "x": 0, "y": 0, "width": 120, "height": 60,
             "name": "A", "status": None, "dod": []},
            {"id": "s2", "x": 200, "y": 0, "width": 120, "height": 60,
             "name": "B", "status": None, "dod": []},
        ], edges=[
            {"id": "e1", "fromNode": "s1", "toNode": "s2", "label": ""}
        ])

    def test_from_node_not_found(self):
        self._canvas("ce_from.json")
        result = change_edge("ce_from.json", edge_id="e1", from_node="s99")
        assert result["status"] == "error"
        assert result["reason"] == "fromNode not found"

    def test_to_node_not_found(self):
        self._canvas("ce_to.json")
        result = change_edge("ce_to.json", edge_id="e1", to_node="s99")
        assert result["status"] == "error"
        assert result["reason"] == "toNode not found"

    def test_edge_not_found(self):
        self._canvas("ce_missing.json")
        result = change_edge("ce_missing.json", edge_id="e99")
        assert result["status"] == "error"
        assert result["reason"] == "edge not found"

    def test_label_too_long(self):
        self._canvas("ce_long.json")
        result = change_edge("ce_long.json", edge_id="e1", label="L" * 81)
        assert result["status"] == "error"
        assert result["reason"] == "label exceeds 80 characters"


# ---------------------------------------------------------------------------
# remove_node — cascade delete
# ---------------------------------------------------------------------------

class TestRemoveNodeCascade:
    """REQ-E004: remove_node cascade-deletes connected edges."""

    def test_cascade_removes_connected_edges(self):
        _make_canvas("rm_node.json", nodes=[
            {"id": "s1", "x": 0, "y": 0, "width": 120, "height": 60,
             "name": "A", "status": None, "dod": []},
            {"id": "s2", "x": 200, "y": 0, "width": 120, "height": 60,
             "name": "B", "status": None, "dod": []},
            {"id": "s3", "x": 400, "y": 0, "width": 120, "height": 60,
             "name": "C", "status": None, "dod": []},
        ], edges=[
            {"id": "e1", "fromNode": "s1", "toNode": "s2", "label": ""},
            {"id": "e2", "fromNode": "s2", "toNode": "s3", "label": ""},
            {"id": "e3", "fromNode": "s1", "toNode": "s3", "label": ""},
        ])
        result = remove_node("rm_node.json", id="s2")
        assert result["status"] == "removed"
        assert set(result["removed_edges"]) == {"e1", "e2"}
        canvas = _read_canvas("rm_node.json")
        assert len(canvas["nodes"]) == 2
        assert len(canvas["edges"]) == 1
        assert canvas["edges"][0]["id"] == "e3"

    def test_node_not_found_returns_error(self):
        _make_canvas("rm_missing.json")
        result = remove_node("rm_missing.json", id="s99")
        assert result["status"] == "error"
        assert result["reason"] == "node not found"


# ---------------------------------------------------------------------------
# remove_edge — only edge deleted
# ---------------------------------------------------------------------------

class TestRemoveEdge:
    """REQ-E005: remove_edge deletes only the edge, nodes intact."""

    def test_removes_edge_leaves_nodes(self):
        _make_canvas("rm_edge.json", nodes=[
            {"id": "s1", "x": 0, "y": 0, "width": 120, "height": 60,
             "name": "A", "status": None, "dod": []},
            {"id": "s2", "x": 200, "y": 0, "width": 120, "height": 60,
             "name": "B", "status": None, "dod": []},
        ], edges=[
            {"id": "e1", "fromNode": "s1", "toNode": "s2", "label": ""}
        ])
        result = remove_edge("rm_edge.json", id="e1")
        assert result["status"] == "removed"
        canvas = _read_canvas("rm_edge.json")
        assert len(canvas["nodes"]) == 2
        assert len(canvas["edges"]) == 0

    def test_edge_not_found_returns_error(self):
        _make_canvas("rm_edge_miss.json")
        result = remove_edge("rm_edge_miss.json", id="e99")
        assert result["status"] == "error"
        assert result["reason"] == "edge not found"


# ---------------------------------------------------------------------------
# mtime check
# ---------------------------------------------------------------------------

class TestMtimeCheck:
    """REQ-W007: refuse write if file changed since last read."""

    def test_write_refused_when_mtime_changed(self):
        import time
        path = _make_canvas("mtime_test.json", nodes=[
            {"id": "s1", "x": 0, "y": 0, "width": 120, "height": 60,
             "name": "A", "status": None, "dod": []}
        ])
        # Simulate a previous read by recording mtime
        mcp_mod._last_mtime["mtime_test.json"] = path.stat().st_mtime

        # Simulate external modification: bump mtime by writing the file again
        # Use a fake future mtime so we don't depend on filesystem resolution.
        original = path.stat().st_mtime
        os.utime(str(path), (original + 10, original + 10))

        result = add_node("mtime_test.json", name="New")
        assert result["status"] == "error"
        assert result["reason"] == "file modified since last read"

    def test_force_bypasses_mtime_check(self):
        import time
        path = _make_canvas("mtime_force.json", nodes=[
            {"id": "s1", "x": 0, "y": 0, "width": 120, "height": 60,
             "name": "A", "status": None, "dod": []}
        ])
        mcp_mod._last_mtime["mtime_force.json"] = path.stat().st_mtime
        original = path.stat().st_mtime
        os.utime(str(path), (original + 10, original + 10))

        result = add_node("mtime_force.json", name="Forced", force=True)
        assert result["status"] == "created", f"Expected created, got: {result}"


# ---------------------------------------------------------------------------
# Auto-placement
# ---------------------------------------------------------------------------

class TestAutoPlacement:
    """REQ-E001: x = max(x+width)+20, y = median(y)."""

    def test_first_node_at_origin(self):
        _make_canvas("place_empty.json")
        result = add_node("place_empty.json", name="First")
        assert result["status"] == "created"
        assert result["node"]["x"] == 0.0
        assert result["node"]["y"] == 0.0

    def test_second_node_placed_to_right(self):
        _make_canvas("place_right.json", nodes=[
            {"id": "s1", "x": 0, "y": 50, "width": 120, "height": 60,
             "name": "A", "status": None, "dod": []}
        ])
        result = add_node("place_right.json", name="B")
        # x = 0 + 120 + 20 = 140
        assert result["node"]["x"] == 140.0
        # y = median([50]) = 50
        assert result["node"]["y"] == 50.0


# ---------------------------------------------------------------------------
# Path traversal — safe_path error dict
# ---------------------------------------------------------------------------

class TestSafePathTraversal:
    """REQ-U011: path traversal attempt returns error dict."""

    def test_traversal_returns_error_dict(self):
        result = add_node("../outside.json", name="X")
        assert result["status"] == "error"
        assert "error" in result["reason"].lower() or "禁止" in result["reason"]


# ---------------------------------------------------------------------------
# String dod regression
# ---------------------------------------------------------------------------

class TestStringDodHandling:
    """Regression: add_node with string dod items must not crash read_canvas (canvas_to_md)."""

    def test_add_node_with_string_dod_normalizes(self):
        """add_node with string dod items converts them to dict format."""
        _make_canvas("dod_str.json")
        result = add_node("dod_str.json", name="Node", dod=["requirement 1", "requirement 2"])
        assert result["status"] == "created"
        # dod items should be normalized to dicts
        node_dod = result["node"]["dod"]
        for item in node_dod:
            assert isinstance(item, dict), f"Expected dict, got {type(item)}: {item}"
            assert "text" in item

    def test_canvas_to_md_handles_string_dod(self):
        """canvas_to_md.to_dod_section must not crash on string dod items."""
        # Create canvas with string dod items (pre-existing data scenario)
        canvas = {
            "nodes": [
                {"id": "s1", "x": 0, "y": 0, "width": 120, "height": 60,
                 "name": "Test", "status": None, "dod": ["string item 1", "string item 2"]}
            ],
            "edges": []
        }
        from canvas_to_md import convert
        # Should not raise
        try:
            result = convert(canvas)
            assert "string item 1" in result
        except AttributeError as e:
            assert False, f"convert() crashed with string dod: {e}"


# ---------------------------------------------------------------------------
# Standalone runner (no pytest)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import traceback

    test_classes = [
        TestAddNodeInvalidStatus,
        TestAddNodeNameTooLong,
        TestAddNodeIdSequence,
        TestAddEdgeOrphanNodes,
        TestAddEdgeLabelTooLong,
        TestAddEdgeIdSequence,
        TestUpdateNodeInvalidStatus,
        TestUpdateNodeNameTooLong,
        TestUpdateNodeDodPreserved,
        TestChangeEdgeOrphanNodes,
        TestRemoveNodeCascade,
        TestRemoveEdge,
        TestMtimeCheck,
        TestAutoPlacement,
        TestSafePathTraversal,
        TestStringDodHandling,
    ]

    passed = 0
    failed = 0
    for cls in test_classes:
        inst = cls()
        methods = [m for m in dir(inst) if m.startswith("test_")]
        for method in methods:
            try:
                getattr(inst, method)()
                print(f"  PASS  {cls.__name__}::{method}")
                passed += 1
            except Exception as exc:
                print(f"  FAIL  {cls.__name__}::{method}: {exc}")
                traceback.print_exc()
                failed += 1

    print(f"\n{passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)
