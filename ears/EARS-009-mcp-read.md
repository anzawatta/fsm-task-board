---
provides:
  - REQ-U001
  - REQ-U002
  - REQ-U003
  - REQ-U004
  - REQ-U005
  - REQ-U006
  - REQ-U007
  - REQ-U008
  - REQ-U009
  - REQ-U010
  - REQ-W001
  - REQ-W002
  - REQ-S001
  - REQ-S002
  - REQ-E001
  - REQ-E002
  - REQ-E003
requires:
  - EARS-008#REQ-U004
  - EARS-008#REQ-U009
  - EARS-008#REQ-U010
---
# EARS-009: MCP Read Tools

**Status:** Draft  
**Date:** 2026-06-16

MCP サーバー（`canvas_reader_mcp.py`）を通じたキャンバスの読み取り操作に関する要件。
アクターは **MCP tools**（ブラウザ UI は EARS-001〜EARS-002 が担当）。
書き込み操作の要件は EARS-008 が担当する。

---

## ツール一覧

| Tool | Signature | 説明 |
|------|-----------|------|
| `list_canvases` | `()` | CANVAS_DIR 内の Canvas JSON 一覧をメタデータ付きで返す |
| `read_canvas` | `(filename)` | Canvas JSON を Mermaid+DoD Markdown に変換して返す。差分サマリ・ステータス凡例を付与する |
| `read_canvas_raw` | `(filename)` | Canvas JSON の生内容を返す（スナップショット更新なし） |
| `reset_snapshot` | `(filename)` | 差分比較用スナップショットを削除し、次回 `read_canvas` を初回扱いにする |

> `filename` を受け取るツールは `_safe_path()` を通じて検証される。

---

## 不変条件

1. REQ-U001: `filename` を受け取るすべての read tool は、任意のファイルアクセスの前に `_safe_path()` で引数を検証しなければならない
2. REQ-U002: `list_canvases` は各エントリに `filename`・`size_bytes`・`modified`（mtime float）の 3 フィールドを含めなければならない
3. REQ-U003: `list_canvases` が返すエントリはファイル名の昇順でソートされなければならない
4. REQ-U004: `read_canvas` は Canvas JSON を `canvas_to_md.convert()` で Mermaid+DoD Markdown に変換しなければならない
5. REQ-U005: `read_canvas` は呼び出しのたびに `_last_mtime[filename]` を現在の mtime で更新しなければならない（write tool の並行書き込み検出を正しくシードするため。EARS-008 REQ-U010 と連携）
6. REQ-U006: `read_canvas` は呼び出しのたびに差分比較用スナップショットファイルを現在の Canvas 内容で上書き保存しなければならない
7. REQ-U007: `read_canvas` は出力の先頭に `_STATUS_LABELS` から動的生成したステータス凡例テーブル（"## ステータス凡例" セクション）を付与しなければならない。凡例の内容は `_STATUS_LABELS` を単一ソースとし、ハードコードしてはならない（EARS-008 REQ-U004 と整合）
8. REQ-U008: `read_canvas_raw` はキャンバスファイルの生 JSON 文字列を返さなければならない（Mermaid 変換・スナップショット更新は行わない）
9. REQ-U009: `read_canvas_raw` は呼び出しのたびに `_last_mtime[filename]` を更新しなければならない（スナップショットは更新しない）
10. REQ-U010: `reset_snapshot` はスナップショットファイルが存在する場合にそれを削除しなければならない

---

## 敵対条件

1. REQ-W001: `read_canvas` は対象ファイルが存在しない場合、利用可能なファイル名一覧を含む `FileNotFoundError` を raise しなければならない。エラーを握り潰したり空文字列を返したりしてはならない
2. REQ-W002: `list_canvases` は `CANVAS_DIR` が存在しない場合でもエラーを raise してはならない——空リスト `[]` を返さなければならない

---

## State-driven requirements

1. REQ-S001: スナップショットファイルが存在する間、`read_canvas` はステータス凡例の直後に "## 前回読込からの変更" セクションを付与し、前回スナップショットとの差分を含めなければならない。差分がない場合は "_変更なし_" と表示する
2. REQ-S002: スナップショットファイルが存在しない場合（初回読込）、`read_canvas` は "## 前回読込からの変更" セクションに "_初回読込_" と表示しなければならない

---

## Event-driven requirements

1. REQ-E001: `read_canvas` の差分計算中に例外が発生した場合、システムは差分セクションに `_(差分計算失敗: <error>)_` を記載しなければならない。例外を呼び出し元へ伝播させてはならない
2. REQ-E002: `reset_snapshot` が呼ばれ、スナップショットファイルが存在する場合、システムはそのファイルを削除し、削除完了を示すメッセージを返さなければならない
3. REQ-E003: `reset_snapshot` が呼ばれ、スナップショットファイルが存在しない場合、システムはエラーなしで不在を示すメッセージを返さなければならない

---

## 出力構造（read_canvas）

`read_canvas` の返却文字列はセクション順が定められている：

```
1. ステータス凡例セクション  ("## ステータス凡例")
2. 差分サマリセクション     ("## 前回読込からの変更")
3. Canvas Mermaid+DoD Markdown
```

各セクションは水平線 `---` で区切られる。

---

## 関連EARS

- EARS-008: MCP Write Tools（`_last_mtime`・`SNAPSHOT_DIR`・status enum を共有）
- EARS-003: タスクステータス管理（status enum の定義）
- EARS-006: データスキーマ（Canvas JSON 構造の正規定義）
