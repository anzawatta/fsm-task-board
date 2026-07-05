#!/usr/bin/env python3
"""Canvas Reader MCP Server (差分要約対応版)"""
import json
import os
import statistics
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from fastmcp import FastMCP

from canvas_to_md import convert
from canvas_diff import diff_canvas, format_diff

CANVAS_DIR = Path(os.environ.get("CANVAS_DIR", "~/canvases")).expanduser()
SNAPSHOT_DIR = Path(
    os.environ.get("CANVAS_SNAPSHOT_DIR", "~/.canvas-mcp/snapshots")
).expanduser()
SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

mcp = FastMCP("canvas-reader")

# @see EARS-008#REQ-U010
# Why: mtime tracking across tool calls
# FastMCP runs in a single process; a module-level dict persists between tool
# invocations and lets write tools detect concurrent modification without
# passing state through the MCP protocol itself.
_last_mtime: dict[str, float] = {}

# Why: mapping exposes UIラベル↔内部enum to MCP callers (LLMs) in machine-readable form.
# @see EARS-008#REQ-U004
_STATUS_LABELS: dict[str | None, str] = {
    None:   "Idle",
    "wip":  "In progress",
    "done": "Done",
}
_VALID_STATUSES = frozenset(_STATUS_LABELS.keys())

# Default node dimensions per EARS-006 REQ-U002
_NODE_WIDTH = 120
_NODE_HEIGHT = 60


def _safe_path(filename: str) -> Path:
    path = CANVAS_DIR / filename
    if not path.resolve().is_relative_to(CANVAS_DIR.resolve()):
        raise ValueError(f"Access outside watch directory is forbidden: {filename}")
    return path


def _snapshot_path(filename: str) -> Path:
    return SNAPSHOT_DIR / filename


# @see EARS-008#REQ-U008
# @see EARS-008#REQ-U009
# Why: write backup directory is separate from read-diff snapshot directory
# Read snapshots are at SNAPSHOT_DIR/<filename>; write backups go to
# SNAPSHOT_DIR/writes/ so the two never collide (REQ-U009).
def _write_backup(filename: str, canvas_data: dict) -> None:
    backup_dir = SNAPSHOT_DIR / "writes"
    backup_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
    backup_path = backup_dir / f"{filename}.{ts}.json"
    backup_path.write_text(json.dumps(canvas_data, ensure_ascii=False), encoding="utf-8")


# @see EARS-008#REQ-U007
def _write_atomic(path: Path, canvas_data: dict) -> None:
    """Write canvas_data to path atomically via temp-file + rename."""
    dir_ = path.parent
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=dir_,
        suffix=".tmp",
        delete=False,
    ) as tmp:
        tmp_path = Path(tmp.name)
        json.dump(canvas_data, tmp, ensure_ascii=False)
    # os.replace is atomic on POSIX; on Windows it is not guaranteed but
    # stdlib has no better alternative without third-party deps.
    tmp_path.replace(path)


def _next_node_id(nodes: list[dict]) -> str:
    """Compute next node ID as s{max_numeric_suffix + 1}."""
    # @see EARS-008#REQ-U002
    max_n = 0
    for n in nodes:
        nid = str(n.get("id", ""))
        if nid.startswith("s") and nid[1:].isdigit():
            max_n = max(max_n, int(nid[1:]))
    return f"s{max_n + 1}"


# @see EARS-012#REQ-U001
# @see EARS-012#REQ-W001
def _next_group_id(nodes: list[dict]) -> str:
    """Compute next group node ID as g{max_numeric_suffix + 1}.

    Mirrors _next_node_id() but scans g{N} IDs, keeping the two namespaces
    independent (EARS-012 REQ-U001, EARS-010 REQ-W007).
    """
    max_n = 0
    for n in nodes:
        nid = str(n.get("id", ""))
        if nid.startswith("g") and nid[1:].isdigit():
            max_n = max(max_n, int(nid[1:]))
    return f"g{max_n + 1}"


def _resolve_depth(node_id: str, nodes: list[dict]) -> int:
    """Return the ancestor depth of node_id (0 = root, 1 = one parent, …)."""
    id_map = {n.get("id"): n for n in nodes}
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
            # circular — caller should have validated earlier, but be safe
            break
        visited.add(current_id)  # type: ignore[arg-type]
        current_id = parent_id
        depth += 1
    return depth


def _next_edge_id(edges: list[dict]) -> str:
    """Compute next edge ID as e{max_numeric_suffix + 1}."""
    # @see EARS-008#REQ-U003
    max_n = 0
    for e in edges:
        eid = str(e.get("id", ""))
        if eid.startswith("e") and eid[1:].isdigit():
            max_n = max(max_n, int(eid[1:]))
    return f"e{max_n + 1}"


def _auto_place(nodes: list[dict]) -> tuple[float, float]:
    """Compute (x, y) for a new node via auto-placement rules."""
    # @see EARS-008#REQ-E001
    # Why: x = max(existing x + width) + 20, y = median(existing y)
    # Simple horizontal stacking keeps the FSM readable left-to-right.
    # median(y) avoids outliers pushing new nodes far off screen.
    if not nodes:
        return 0.0, 0.0
    x = max(n.get("x", 0) + n.get("width", _NODE_WIDTH) for n in nodes) + 20
    y = statistics.median(n.get("y", 0) for n in nodes)
    return x, y


def _check_mtime(filename: str, path: Path, force: bool) -> dict | None:
    """Return error dict if mtime changed since last read, else None."""
    # @see EARS-008#REQ-U010
    if filename not in _last_mtime:
        # No prior read — seed the baseline from current mtime and allow this write.
        # Subsequent writes in this session will be protected.
        # @see EARS-008#REQ-U010
        _last_mtime[filename] = path.stat().st_mtime
        return None
    current_mtime = path.stat().st_mtime
    if current_mtime != _last_mtime[filename] and not force:
        # @see EARS-008#REQ-W007
        return {"status": "error", "reason": "file modified since last read"}
    return None


@mcp.tool()
def list_canvases() -> list[dict]:
    """List available canvas JSON files."""
    # @see EARS-009#REQ-W002
    if not CANVAS_DIR.exists():
        return []
    # @see EARS-009#REQ-U002
    # @see EARS-009#REQ-U003
    return [
        {
            "filename": p.name,
            "size_bytes": p.stat().st_size,
            "modified": p.stat().st_mtime,
        }
        for p in sorted(CANVAS_DIR.glob("*.json"))
    ]


@mcp.tool()
def read_canvas(filename: str) -> str:
    """Convert a canvas JSON to Markdown (Mermaid diagram + DoD checklists) and return it.

    Compares against the snapshot from the previous read and prepends a change summary
    to the Markdown output if any differences are found.
    """
    # @see EARS-009#REQ-U001
    path = _safe_path(filename)
    # @see EARS-009#REQ-W001
    if not path.exists():
        available = [p.name for p in CANVAS_DIR.glob("*.json")]
        raise FileNotFoundError(f"{filename} not found. Available: {available}")

    curr = json.loads(path.read_text(encoding="utf-8"))
    # @see EARS-009#REQ-U005
    # @see EARS-008#REQ-U010
    _last_mtime[filename] = path.stat().st_mtime
    # @see EARS-009#REQ-U004
    md = convert(curr)

    snap = _snapshot_path(filename)
    diff_section = ""
    # @see EARS-009#REQ-S001
    # @see EARS-009#REQ-S002
    # @see EARS-009#REQ-E001
    if snap.exists():
        try:
            prev = json.loads(snap.read_text(encoding="utf-8"))
            diff = diff_canvas(prev, curr)
            formatted = format_diff(diff)
            if formatted:
                diff_section = f"## Changes since last read\n\n{formatted}\n\n---\n\n"
            else:
                diff_section = "## Changes since last read\n\n_No changes_\n\n---\n\n"
        except Exception as ex:
            diff_section = f"_(diff failed: {ex})_\n\n---\n\n"
    else:
        diff_section = "## Changes since last read\n\n_First read_\n\n---\n\n"

    # @see EARS-009#REQ-U006
    snap.write_text(json.dumps(curr, ensure_ascii=False), encoding="utf-8")

    # @see EARS-009#REQ-U007
    # Why: generate legend from _STATUS_LABELS so it stays in sync with the dict.
    _legend_rows = ""
    for _sk, _sv in _STATUS_LABELS.items():
        _key_repr = "null" if _sk is None else f'"{_sk}"'
        _legend_rows += f"| {_key_repr} | {_sv} |\n"
    status_legend = (
        "## Status legend\n\n"
        "| enum value | UI label |\n"
        "|---|---|\n"
        + _legend_rows
        + "\n---\n\n"
    )
    return status_legend + diff_section + md


@mcp.tool()
def read_canvas_raw(filename: str) -> str:
    """Return the raw JSON content of a canvas file without updating the snapshot. Use for debugging or inspection."""
    # @see EARS-009#REQ-U001
    path = _safe_path(filename)
    # @see EARS-009#REQ-U008
    text = path.read_text(encoding="utf-8")
    # @see EARS-009#REQ-U009
    # @see EARS-008#REQ-U010
    _last_mtime[filename] = path.stat().st_mtime
    return text


@mcp.tool()
def reset_snapshot(filename: str) -> str:
    """Delete the snapshot for a canvas file so the next read is treated as the first read."""
    snap = _snapshot_path(filename)
    # @see EARS-009#REQ-E002
    # @see EARS-009#REQ-E003
    if snap.exists():
        # @see EARS-009#REQ-U010
        snap.unlink()
        return f"Snapshot for {filename} deleted"
    return f"No snapshot for {filename}"


# ---------------------------------------------------------------------------
# Write tools
# ---------------------------------------------------------------------------

_VALID_NODE_TYPES = {"text", "group"}


@mcp.tool()
def add_node(
    filename: str,
    name: str,
    status: Literal["wip", "done"] | None = None,
    dod: list | None = None,
    force: bool = False,
    type: str = "text",
    parentId: str | None = None,
) -> dict:
    """Add a node with auto-assigned ID and auto-placement.

    ``type`` is ``"text"`` (default) or ``"group"``.
    ``parentId`` is optional (default ``null``).

    Returns the full created node object with ``"status": "created"``, or an
    error dict when a precondition is violated.
    """
    # @see EARS-008#REQ-U011
    try:
        path = _safe_path(filename)
    except ValueError as e:
        return {"status": "error", "reason": str(e)}

    # @see EARS-008#REQ-W008
    if len(name) > 80:
        return {"status": "error", "reason": "name exceeds 80 characters"}

    # @see EARS-008#REQ-U004
    # @see EARS-008#REQ-W001
    if status not in _VALID_STATUSES:
        return {"status": "error", "reason": "invalid status", "allowed": [None, "wip", "done"]}

    # @see EARS-012#REQ-U002
    if type not in _VALID_NODE_TYPES:
        return {"status": "error", "reason": "invalid type"}

    # @see EARS-008#REQ-U010
    mtime_err = _check_mtime(filename, path, force)
    if mtime_err:
        return mtime_err

    # @see EARS-008#REQ-U001
    canvas = json.loads(path.read_text(encoding="utf-8"))
    nodes: list[dict] = canvas.setdefault("nodes", [])
    edges: list[dict] = canvas.setdefault("edges", [])

    # @see EARS-012#REQ-U003 — validate parentId
    if parentId is not None:
        parent_node = next((n for n in nodes if n.get("id") == parentId), None)
        if parent_node is None:
            return {"status": "error", "reason": "invalid parentId"}
        if parent_node.get("type") != "group":
            return {"status": "error", "reason": "invalid parentId"}

    # @see EARS-012#REQ-U004 — validate nesting depth
    if parentId is not None:
        parent_depth = _resolve_depth(parentId, nodes)
        # new node depth = parent_depth + 1; must not exceed 3
        if parent_depth + 1 > 3:
            return {"status": "error", "reason": "nesting depth exceeds 3"}

    # @see EARS-012#REQ-W003 — circular reference check (guard for group nodes)
    # A new node cannot be its own ancestor (trivially safe here since new_id
    # doesn't exist yet, but validate that parentId chain contains no cycles).
    if parentId is not None:
        visited_ids: set[str] = set()
        cur: str | None = parentId
        id_map = {n.get("id"): n for n in nodes}
        while cur is not None:
            if cur in visited_ids:
                return {"status": "error", "reason": "circular parentId reference"}
            visited_ids.add(cur)
            cur = id_map.get(cur, {}).get("parentId")

    # @see EARS-012#REQ-W001 / REQ-W002 — use correct ID namespace per type
    if type == "group":
        # @see EARS-012#REQ-W001
        new_id = _next_group_id(nodes)
    else:
        # @see EARS-012#REQ-W002
        # @see EARS-008#REQ-U002
        new_id = _next_node_id(nodes)

    # @see EARS-008#REQ-E001
    x, y = _auto_place(nodes)

    # @see EARS-008#REQ-E001
    # Why: normalize dod items — callers (LLM models) may pass plain strings
    # instead of {"text":..., "type":..., "checked":...} dicts. Convert defensively
    # to prevent canvas_to_md.py from crashing on subsequent read_canvas calls.
    raw_dod = dod if dod is not None else []
    normalized_dod = []
    for item in raw_dod:
        if isinstance(item, str):
            normalized_dod.append({"text": item, "type": "", "checked": False})
        elif isinstance(item, dict):
            normalized_dod.append(item)
        # skip non-string, non-dict items silently

    # @see EARS-012#REQ-E001 / REQ-E002
    new_node: dict = {
        "id": new_id,
        "x": x,
        "y": y,
        "width": _NODE_WIDTH,
        "height": _NODE_HEIGHT,
        "name": name,
        "status": status,
        "dod": normalized_dod,
        "type": type,
        "parentId": parentId,
    }
    nodes.append(new_node)

    # @see EARS-008#REQ-U008
    _write_backup(filename, canvas)
    # @see EARS-008#REQ-U007
    _write_atomic(path, canvas)
    _last_mtime[filename] = path.stat().st_mtime

    # Why: wrap node under "node" key to avoid collision with operation "status"
    # Both the operation result and node data carry a "status" field; without
    # wrapping, **new_node would overwrite the operation status with the node's
    # status value (e.g. "wip"), making the response ambiguous.
    return {"status": "created", "node": new_node}


@mcp.tool()
def update_node(
    filename: str,
    id: str,
    name: str | None = None,
    status: Literal["wip", "done"] | None = "__unset__",  # type: ignore[assignment]
    force: bool = False,
) -> dict:
    """Update the name or status of an existing node.

    ``dod`` and position fields are not modified.
    To explicitly set ``status`` to null (Idle), pass ``status=null``.
    Omitting ``status`` keeps the current value.
    Valid values: null (Idle), "wip" (In progress), "done" (Done).
    """
    # @see EARS-008#REQ-U011
    try:
        path = _safe_path(filename)
    except ValueError as e:
        return {"status": "error", "reason": str(e)}

    # @see EARS-008#REQ-W008
    if name is not None and len(name) > 80:
        return {"status": "error", "reason": "name exceeds 80 characters"}

    # @see EARS-008#REQ-U004
    # @see EARS-008#REQ-W001
    # Why: sentinel "__unset__" distinguishes "caller passed null" from "caller
    # omitted the argument entirely", since FastMCP maps JSON null → None.
    if status != "__unset__" and status not in _VALID_STATUSES:
        return {"status": "error", "reason": "invalid status", "allowed": [None, "wip", "done"]}

    # @see EARS-008#REQ-U010
    mtime_err = _check_mtime(filename, path, force)
    if mtime_err:
        return mtime_err

    # @see EARS-008#REQ-U001
    canvas = json.loads(path.read_text(encoding="utf-8"))
    nodes: list[dict] = canvas.setdefault("nodes", [])

    target = next((n for n in nodes if n.get("id") == id), None)
    if target is None:
        return {"status": "error", "reason": "node not found", "conflicting_id": id}

    # @see EARS-008#REQ-E006
    if name is not None:
        target["name"] = name
    if status != "__unset__":
        target["status"] = status

    # @see EARS-008#REQ-U008
    _write_backup(filename, canvas)
    # @see EARS-008#REQ-U007
    _write_atomic(path, canvas)
    _last_mtime[filename] = path.stat().st_mtime

    # Why: same node/status collision as add_node — wrap under "node" key.
    return {"status": "updated", "node": dict(target)}


@mcp.tool()
def update_dod(
    filename: str,
    node_id: str,
    dod: list | None = None,
    force: bool = False,
) -> dict:
    """Replace the DoD (acceptance criteria) list of a node."""
    # @see EARS-008#REQ-U011
    try:
        path = _safe_path(filename)
    except ValueError as e:
        return {"status": "error", "reason": str(e)}

    # @see EARS-008#REQ-U010
    mtime_err = _check_mtime(filename, path, force)
    if mtime_err:
        return mtime_err

    # @see EARS-008#REQ-U001
    canvas = json.loads(path.read_text(encoding="utf-8"))
    nodes: list[dict] = canvas.setdefault("nodes", [])

    target = next((n for n in nodes if n.get("id") == node_id), None)
    if target is None:
        return {"status": "error", "reason": "node not found", "conflicting_id": node_id}

    # @see EARS-008#REQ-E007
    # Why: normalize dod items — reuse add_node pattern for string→dict coercion
    raw_dod = dod if dod is not None else []
    normalized_dod = []
    for item in raw_dod:
        if isinstance(item, str):
            normalized_dod.append({"text": item, "type": "", "checked": False})
        elif isinstance(item, dict):
            normalized_dod.append(item)
        # skip non-string, non-dict items silently
    target["dod"] = normalized_dod

    # @see EARS-008#REQ-U008
    _write_backup(filename, canvas)
    # @see EARS-008#REQ-U007
    _write_atomic(path, canvas)
    _last_mtime[filename] = path.stat().st_mtime

    return {"status": "updated", "node": dict(target)}


@mcp.tool()
def update_nodes(
    filename: str,
    nodes: list[dict],
    force: bool = False,
) -> dict:
    """Batch-update name and/or status of multiple nodes. dod and position fields are not modified."""
    # @see EARS-008#REQ-U011
    try:
        path = _safe_path(filename)
    except ValueError as e:
        return {"status": "error", "reason": str(e)}

    # @see EARS-008#REQ-U010
    mtime_err = _check_mtime(filename, path, force)
    if mtime_err:
        return mtime_err

    if not nodes:
        return {"status": "error", "reason": "nodes list is empty"}

    # Why: fail-fast: validate all entries before reading canvas — avoid partial state from rejected batch
    # @see EARS-008#REQ-U012
    for i, entry in enumerate(nodes):
        if "id" not in entry:
            return {"status": "error", "reason": "missing id in nodes entry", "entry_index": i}
        # @see EARS-008#REQ-U004
        # @see EARS-008#REQ-W001
        if "status" in entry and entry["status"] not in _VALID_STATUSES:
            return {
                "status": "error",
                "reason": "invalid status",
                "allowed": [None, "wip", "done"],
                "conflicting_id": entry["id"],
            }
        # @see EARS-008#REQ-W008
        if "name" in entry and len(entry["name"]) > 80:
            return {"status": "error", "reason": "name exceeds 80 characters", "conflicting_id": entry["id"]}

    # @see EARS-008#REQ-U001
    canvas = json.loads(path.read_text(encoding="utf-8"))
    node_map = {n.get("id"): n for n in canvas.get("nodes", [])}

    for entry in nodes:
        if entry["id"] not in node_map:
            return {"status": "error", "reason": "node not found", "conflicting_id": entry["id"]}

    # @see EARS-008#REQ-E008
    updated_nodes = []
    for entry in nodes:
        target = node_map[entry["id"]]
        if "name" in entry:
            target["name"] = entry["name"]
        if "status" in entry:
            target["status"] = entry["status"]
        updated_nodes.append(dict(target))

    # @see EARS-008#REQ-U008
    _write_backup(filename, canvas)
    # @see EARS-008#REQ-U007
    _write_atomic(path, canvas)
    _last_mtime[filename] = path.stat().st_mtime

    return {"status": "updated", "nodes": updated_nodes}


@mcp.tool()
def add_edge(
    filename: str,
    from_node: str,
    to_node: str,
    label: str = "",
    force: bool = False,
) -> dict:
    """Add an edge between two nodes.

    Returns the full created edge object with ``"status": "created"``.
    """
    # @see EARS-008#REQ-U011
    try:
        path = _safe_path(filename)
    except ValueError as e:
        return {"status": "error", "reason": str(e)}

    # @see EARS-008#REQ-W008
    if len(label) > 80:
        return {"status": "error", "reason": "label exceeds 80 characters"}

    # @see EARS-008#REQ-U010
    mtime_err = _check_mtime(filename, path, force)
    if mtime_err:
        return mtime_err

    # @see EARS-008#REQ-U001
    canvas = json.loads(path.read_text(encoding="utf-8"))
    nodes: list[dict] = canvas.setdefault("nodes", [])
    edges: list[dict] = canvas.setdefault("edges", [])

    node_ids = {n.get("id") for n in nodes}

    # @see EARS-008#REQ-U005
    # @see EARS-008#REQ-W002
    if from_node not in node_ids:
        return {"status": "error", "reason": "fromNode not found", "conflicting_id": from_node}

    # @see EARS-008#REQ-W003
    if to_node not in node_ids:
        return {"status": "error", "reason": "toNode not found", "conflicting_id": to_node}

    # @see EARS-008#REQ-U003
    new_id = _next_edge_id(edges)

    new_edge: dict = {
        "id": new_id,
        "fromNode": from_node,
        "toNode": to_node,
        "label": label,
    }
    edges.append(new_edge)

    # @see EARS-008#REQ-U008
    _write_backup(filename, canvas)
    # @see EARS-008#REQ-U007
    _write_atomic(path, canvas)
    _last_mtime[filename] = path.stat().st_mtime

    # @see EARS-008#REQ-E002
    # Why: wrap edge under "edge" key for consistent return shape with node tools
    # Spreading **new_edge flat would collide with the operation "status" key if
    # edge data ever gains a status field, and breaks symmetry with add_node.
    return {"status": "created", "edge": new_edge}


@mcp.tool()
def change_edge(
    filename: str,
    edge_id: str,
    from_node: str | None = None,
    to_node: str | None = None,
    label: str | None = None,
    force: bool = False,
) -> dict:
    """Update an existing edge in place, preserving its ID.

    Supplied fields are updated; omitted fields are left unchanged.
    """
    # @see EARS-008#REQ-U011
    try:
        path = _safe_path(filename)
    except ValueError as e:
        return {"status": "error", "reason": str(e)}

    # @see EARS-008#REQ-W008
    if label is not None and len(label) > 80:
        return {"status": "error", "reason": "label exceeds 80 characters"}

    # @see EARS-008#REQ-U010
    mtime_err = _check_mtime(filename, path, force)
    if mtime_err:
        return mtime_err

    # @see EARS-008#REQ-U001
    canvas = json.loads(path.read_text(encoding="utf-8"))
    nodes: list[dict] = canvas.setdefault("nodes", [])
    edges: list[dict] = canvas.setdefault("edges", [])

    target = next((e for e in edges if e.get("id") == edge_id), None)
    if target is None:
        return {"status": "error", "reason": "edge not found", "conflicting_id": edge_id}

    node_ids = {n.get("id") for n in nodes}

    # Validate both before mutating
    # @see EARS-008#REQ-U005
    # @see EARS-008#REQ-W002
    if from_node is not None and from_node not in node_ids:
        return {"status": "error", "reason": "fromNode not found", "conflicting_id": from_node}
    # @see EARS-008#REQ-W003
    if to_node is not None and to_node not in node_ids:
        return {"status": "error", "reason": "toNode not found", "conflicting_id": to_node}

    # Apply mutations only after all validations pass
    # @see EARS-008#REQ-E003
    if from_node is not None:
        target["fromNode"] = from_node
    if to_node is not None:
        target["toNode"] = to_node
    if label is not None:
        target["label"] = label

    # @see EARS-008#REQ-U008
    _write_backup(filename, canvas)
    # @see EARS-008#REQ-U007
    _write_atomic(path, canvas)
    _last_mtime[filename] = path.stat().st_mtime

    # Why: same edge/status collision avoidance as add_edge — wrap under "edge" key.
    return {"status": "updated", "edge": dict(target)}


@mcp.tool()
def remove_node(
    filename: str,
    id: str,
    force: bool = False,
) -> dict:
    """Remove a node and cascade-delete all edges connected to it.

    If the target node is of ``type: "group"``, children have their ``parentId`` reset
    to ``null`` (orphaned) before the group is removed. Child nodes themselves are not deleted.
    """
    # @see EARS-008#REQ-U011
    try:
        path = _safe_path(filename)
    except ValueError as e:
        return {"status": "error", "reason": str(e)}

    # @see EARS-008#REQ-U010
    mtime_err = _check_mtime(filename, path, force)
    if mtime_err:
        return mtime_err

    # @see EARS-008#REQ-U001
    canvas = json.loads(path.read_text(encoding="utf-8"))
    nodes: list[dict] = canvas.setdefault("nodes", [])
    edges: list[dict] = canvas.setdefault("edges", [])

    target_node = next((n for n in nodes if n.get("id") == id), None)
    if target_node is None:
        return {"status": "error", "reason": "node not found", "conflicting_id": id}

    # @see EARS-012#REQ-E003 — orphan children before deleting the group
    # @see EARS-012#REQ-W006
    # Why: group deletion must NOT cascade-delete children; instead reset their
    # parentId to null (EARS-012 REQ-W006, EARS-010 REQ-S002).
    if target_node.get("type") == "group":
        for n in nodes:
            if n.get("parentId") == id:
                n["parentId"] = None

    canvas["nodes"] = [n for n in nodes if n.get("id") != id]

    # @see EARS-008#REQ-E004
    removed_edges = [
        e["id"] for e in edges if e.get("fromNode") == id or e.get("toNode") == id
    ]
    canvas["edges"] = [
        e for e in edges if e.get("fromNode") != id and e.get("toNode") != id
    ]

    # @see EARS-008#REQ-U008
    _write_backup(filename, canvas)
    # @see EARS-008#REQ-U007
    _write_atomic(path, canvas)
    _last_mtime[filename] = path.stat().st_mtime

    return {"status": "removed", "id": id, "removed_edges": removed_edges}


@mcp.tool()
def remove_edge(
    filename: str,
    id: str,
    force: bool = False,
) -> dict:
    """Remove an edge without modifying its connected nodes."""
    # @see EARS-008#REQ-U011
    try:
        path = _safe_path(filename)
    except ValueError as e:
        return {"status": "error", "reason": str(e)}

    # @see EARS-008#REQ-U010
    mtime_err = _check_mtime(filename, path, force)
    if mtime_err:
        return mtime_err

    # @see EARS-008#REQ-U001
    canvas = json.loads(path.read_text(encoding="utf-8"))
    edges: list[dict] = canvas.setdefault("edges", [])

    original_len = len(edges)
    canvas["edges"] = [e for e in edges if e.get("id") != id]
    if len(canvas["edges"]) == original_len:
        return {"status": "error", "reason": "edge not found", "conflicting_id": id}

    # @see EARS-008#REQ-U008
    _write_backup(filename, canvas)
    # @see EARS-008#REQ-U007
    _write_atomic(path, canvas)
    _last_mtime[filename] = path.stat().st_mtime

    # @see EARS-008#REQ-E005
    return {"status": "removed", "id": id}


if __name__ == "__main__":
    mcp.run()
