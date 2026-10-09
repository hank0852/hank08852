# Game Daily Hub｜遊戲日常小幫手

以純 HTML 與 CSS 製作的遊戲日常管理網站，適合用 VS Code 開啟、閱讀與修改。這個版本不需要 npm、JavaScript、PHP 或資料庫。

## 檔案結構

- `index.html`：首頁儀表板。
- `games.html`：遊戲清單。
- `tasks.html`：每日任務清單。
- `news.html`：遊戲消息與活動資訊。
- `styles.css`：共用配色、版面與響應式樣式。
- `assets/*.svg`：網站使用的圖片素材。

所有插畫皆為本專案製作的抽象 SVG 示意圖，並非遊戲官方美術素材。網站不依賴外部字型、圖片或 CDN。

## 在 VS Code 開啟

1. 啟動 VS Code，選擇「檔案 → 開啟資料夾」，開啟 `hank08852` 資料夾。
2. 在檔案總管中找到 `index.html`，用瀏覽器開啟，即可查看網站。
3. 修改 HTML 或 CSS 並儲存後，重新整理瀏覽器查看結果。

也可以選擇安裝 VS Code 的 **Live Server** 擴充套件，開啟 `index.html` 後按右下角 **Go Live**，讓頁面在存檔後自動重新整理。

若電腦已有 Python，可在專案資料夾的終端機執行：

```sh
python -m http.server 8001
```

在這個雲端環境中，對應的啟動指令是：

```sh
python3 -m http.server 8001 --bind 127.0.0.1 --directory /workspace/hank08852
```

直接開啟 HTML 就能使用，Python 與 Live Server 都是選用工具。

## 修改內容與外觀

- 編輯各頁面的 HTML，替換遊戲名稱、任務、消息與活動文字。
- 修改 `styles.css` 的 `:root` 變數，調整共用色彩；其餘樣式控制字體、間距與版面。
- 替換 `assets` 內的 SVG 圖片時，確認 HTML 中引用的檔名一致。

## 目前功能範圍

這是靜態展示版本。任務核取方塊可切換勾選外觀，但沒有儲存邏輯，也不會同步更新任務數或進度。進度、提醒與活動皆為示範資料，不會發送通知或每日自動重設。

後續第 3 階段可加入 JavaScript，實作互動、進度計算與本機儲存；第 4 階段再加入 PHP 與資料庫，處理帳號及伺服器端資料。

`quiz-practice` 是另一個獨立專案，不屬於此網站。本專案的建立與本機啟動不代表已推送到 GitHub 或發布上線。
