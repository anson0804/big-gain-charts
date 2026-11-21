# 大升股圖表

用 TradingView Lightweight Charts 瀏覽歷史大升股 CSV 的深色互動 K 線頁。  
靜態網站，適合作為公開 GitHub 倉庫，並以 **GitHub Pages（倉庫根目錄）** 開啟。

不要把這個專案放進 `anson0804/Dashboard`。這是獨立倉庫。

## 功能

- K 線：縮放、拖曳、十字線
- 下方獨立窗格顯示成交量
- EMA 10、EMA 20、SMA 50、SMA 200（收市價計算；根數不足則隱藏）
- 年份篩選、案例清單、上一張／下一張（左右方向鍵）
- 測量：按「測量」後拖拉，或按住 Shift 拖拉，顯示漲跌幅與價差
- 文字註記（保存在瀏覽器 localStorage，不寫回 CSV）

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

圖表程式庫已放在 `vendor/`（Lightweight Charts v5.3.0），不必再依賴 CDN。
