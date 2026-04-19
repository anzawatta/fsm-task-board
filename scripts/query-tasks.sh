#!/usr/bin/env bash
# query-tasks.sh — 指定した JSON からタスク状況を出力するスクリプト
#
# Usage:
#   bash query-tasks.sh <json_file>             # 全ノードを一覧
#   bash query-tasks.sh <json_file> idle        # status=idle を絞り込み
#   bash query-tasks.sh <json_file> wip
#   bash query-tasks.sh <json_file> done
#
# 出力形式: id, name, status, dod_total, dod_checked
# 依存: jq, realpath

set -euo pipefail

# ── 引数チェック ──────────────────────────────────────────
if [ $# -lt 1 ]; then
  echo "Usage: $(basename "$0") <json_file> [status]" >&2
  exit 1
fi

RAW_PATH="$1"
STATUS_FILTER="${2:-}"

# ── セキュリティ検証 ──────────────────────────────────────
# 1. realpath で正規化（パストラバーサル・シンボリックリンク解決）
if ! JSON_FILE="$(realpath -- "$RAW_PATH" 2>/dev/null)"; then
  echo "Error: Cannot resolve path: $RAW_PATH" >&2
  exit 1
fi

# 2. 拡張子チェック（.json のみ許可）
if [[ "$JSON_FILE" != *.json ]]; then
  echo "Error: File must have .json extension: $JSON_FILE" >&2
  exit 1
fi

# 3. 通常ファイルであること（ディレクトリ・デバイスファイル等を排除）
if [ ! -f "$JSON_FILE" ]; then
  echo "Error: Not a regular file: $JSON_FILE" >&2
  exit 1
fi

# 4. 読み取り権限チェック
if [ ! -r "$JSON_FILE" ]; then
  echo "Error: Permission denied: $JSON_FILE" >&2
  exit 1
fi

# 5. JSON 構文検証
if ! jq empty "$JSON_FILE" 2>/dev/null; then
  echo "Error: Invalid JSON: $JSON_FILE" >&2
  exit 1
fi

# ── jq 依存チェック ───────────────────────────────────────
if ! command -v jq &>/dev/null; then
  echo "Error: jq is required but not installed." >&2
  exit 1
fi

# ── クエリ実行 ────────────────────────────────────────────
JQ_QUERY='
.nodes[] |
{
  id:          .id,
  name:        .name,
  status:      .status,
  dod_total:   (.dod | length),
  dod_checked: (.dod | map(select(.checked == true)) | length)
}
'

if [ -n "$STATUS_FILTER" ]; then
  jq -r --arg s "$STATUS_FILTER" "
    $JQ_QUERY | select(.status == \$s) |
    [.id, .name, .status, (.dod_total|tostring), (.dod_checked|tostring)] | join(\", \")
  " "$JSON_FILE"
else
  jq -r "
    $JQ_QUERY |
    [.id, .name, .status, (.dod_total|tostring), (.dod_checked|tostring)] | join(\", \")
  " "$JSON_FILE"
fi
