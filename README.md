# 如何快速成為一個優秀的交易者？

公開的長文頁。文章在頁面上，互動 K 線嵌在文中，作為視覺記憶的練習。

從 280 個歷史大升股案例，建立你的視覺記憶。  
文章用這句話。圖表清單以 `cases.json` 為準，畫面上的題數跟年份篩選顯示實際收錄的案例，不會另外寫死一個數字。

深色圖表區嵌在文章欄裡。頁面本身可切換淺色／深色。打開就能翻閱，不必登入，也不會另外下載股價。  
靜態網站，適合作為公開 GitHub 倉庫，並以 **GitHub Pages（倉庫根目錄）** 開啟。

不要把這個專案放進 `anson0804/Dashboard`。這是獨立倉庫，不是 kindlyanson.com 的 Dashboard。頁首只有 Anson筆記，沒有會員頁導覽。

## 怎麼看

先讀文章，再在文中的圖上翻案例。用「上一題／下一題」或左右方向鍵換題，直接看形狀、成交量與均線。

## 圖表功能

- K 線：縮放、拖曳、十字線
- 下方獨立窗格顯示成交量
- EMA 10、EMA 20、SMA 50、SMA 200（收市價計算；根數不足則隱藏）
- 年份篩選、案例清單、上一題／下一題（左右方向鍵）
- 測量：按「測量」後拖拉，或按住 Shift 拖拉，顯示漲跌幅與價差
- 文字註記（保存在瀏覽器 localStorage，不寫回 CSV）
- 畫線：趨勢線、水平線、矩形。圖下「已儲存的畫線」可看、儲存、清除；每個案例分開存在 localStorage
- 全螢幕：放大圖表；不支援 Fullscreen API 時改為鋪滿畫面

使用細節見 `使用說明.txt`。

## 放入股價資料

1. 把本機 `stock_data` 裡的年份資料夾複製到本倉庫的 `stock_data/`，例如：

       stock_data/2017/2017_LEXX.csv

   不必複製根目錄的 `download_report.csv`、`retry_report.csv`。

2. 在倉庫根目錄執行：

       python3 tools/build_cases.py

   這會掃描 `stock_data/YYYY/*.csv` 並更新 `cases.json`。

3. 提交 `stock_data/` 與新的 `cases.json`。

網站以相對路徑讀取 `cases.json` 與 `stock_data/...`，因此在 Project Pages（`https://<user>.github.io/<repo>/`）也能運作。請不要用 `file://` 直接打開 `index.html`。

## 啟用 GitHub Pages

在 GitHub 倉庫頁面：

1. **Settings → Pages**
2. **Build and deployment → Source** 選 **Deploy from a branch**
3. Branch 選預設分支（通常是 `main`），資料夾選 **`/ (root)`**
4. 儲存後等一兩分鐘，網址會是：

       https://<user>.github.io/<repo>/

倉庫根目錄已包含空白的 `.nojekyll`，避免 Jekyll 略過部分靜態檔。

圖表程式庫已放在 `vendor/`（Lightweight Charts v5.3.0），不必再依賴 CDN。頁面字型使用 Fontshare 的 Satoshi；頭像連到 kindlyanson.com 上的公開圖片。版面樣式都在本倉庫的 `css/styles.css`。
