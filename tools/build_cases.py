#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Scan stock_data/YYYY/*.csv and write cases.json for the static site."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = ROOT / "stock_data"
OUT = ROOT / "cases.json"
YEAR_DIR_RE = re.compile(r"^\d{4}$")


def list_cases() -> list[dict]:
    cases: list[dict] = []
    if not DATA_ROOT.is_dir():
        return cases
    year_dirs = sorted(
        (p for p in DATA_ROOT.iterdir() if p.is_dir() and YEAR_DIR_RE.match(p.name)),
        key=lambda p: p.name,
    )
    for year_dir in year_dirs:
        for csv_path in sorted(year_dir.iterdir(), key=lambda p: p.name.lower()):
            if not csv_path.is_file() or csv_path.suffix.lower() != ".csv":
                continue
            year = year_dir.name
            stem = csv_path.stem
            if stem.startswith(f"{year}_") and len(stem) > len(year) + 1:
                ticker = stem[len(year) + 1 :]
            else:
                ticker = stem
            cases.append(
                {
                    "path": f"{year}/{csv_path.name}",
                    "year": year,
                    "ticker": ticker,
                    "label": f"{year} {ticker}",
                }
            )
    return cases


def main() -> int:
    cases = list_cases()
    if cases:
        payload = {"ok": True, "error": None, "cases": cases}
    else:
        payload = {
            "ok": True,
            "error": "找不到價格 CSV。請把年份資料夾放到 stock_data/（例如 2017/2017_LEXX.csv）後再執行本程式。",
            "cases": [],
        }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已寫入 {OUT}，共 {len(cases)} 個案例。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
