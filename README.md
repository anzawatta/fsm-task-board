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
