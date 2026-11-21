把本機歷史股價 CSV 依年份資料夾放在這裡，例如：

  stock_data/2017/2017_LEXX.csv

只放入 西元年份/*.csv。根目錄的 download_report.csv、retry_report.csv 不需要複製。
放入後請在上一層執行：

  python3 tools/build_cases.py

這會更新 cases.json，網站才會出現案例清單。
