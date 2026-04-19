# fsm-task-board

## 起動方法

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

Chromium で `http://localhost:8080` を開く。

## ブラウザ制約

| 機能 | 対応ブラウザ |
|------|------------|
| Open / Save / Save As | **Chromium 系のみ**（Chrome / Edge）|
| その他の操作 | 制限なし |

File System Access API（`showOpenFilePicker` / `showSaveFilePicker`）を使用しているため、
**Firefox / Safari では Open / Save ボタンが動作しない**。

## スキーマ定義

### Node

```json
{
  "id": "string（例: s1, s2）",
  "name": "string（タスク名）",
  "x": "number",
  "y": "number",
  "width": "number（デフォルト: 160）",
  "height": "number（デフォルト: 56、dod件数×24を目安に調整）",
  "status": "done | wip | idle",
  "dod": [
    {
      "text": "string",
      "type": "verification | validation",
      "checked": "boolean"
    }
  ]
}
```

### Edge

```json
{
  "id": "string（例: e1）",
  "fromNode": "string（node id）",
  "toNode": "string（node id）",
  "label": "string（通常は空文字）"
}
```

### 制約

- `status` は `done` / `wip` / `idle` 以外を使わない
- `dod.type` は `verification` / `validation` 以外を使わない
- `id` はノード `s{n}`、エッジ `e{n}` の形式で既存の最大値+1
- `status: done` のとき、全 `dod.checked` は `true` であるべき（警告を出す）
- ノード新規作成時、`dod` が空の場合は `[]` にする（省略しない）
