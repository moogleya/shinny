#!/usr/bin/env python3
"""Fetch public Xiaohongshu note interaction counts.

This script only reads data that is present in the publicly returned page HTML.
It does not use login cookies, private APIs, or creator-center data.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
import sys
import time
from datetime import datetime, timezone
from typing import Dict, Iterable, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

FIELD_PATTERNS = {
    "likes": [
        r'"(?:likedCount|likeCount|likes|liked_count|like_count)"\s*:\s*"?([\d,.]+)"?',
        r"(?:点赞|赞)[^\d万千kKwW]{0,12}([\d,.]+)\s*([万千kKwW]?)",
    ],
    "collects": [
        r'"(?:collectedCount|collectCount|collects|collected_count|collect_count)"\s*:\s*"?([\d,.]+)"?',
        r"(?:收藏)[^\d万千kKwW]{0,12}([\d,.]+)\s*([万千kKwW]?)",
    ],
    "comments": [
        r'"(?:commentCount|comments|comment_count)"\s*:\s*"?([\d,.]+)"?',
        r"(?:评论)[^\d万千kKwW]{0,12}([\d,.]+)\s*([万千kKwW]?)",
    ],
}


def fetch_html(url: str, timeout: int) -> str:
    req = Request(url, headers=DEFAULT_HEADERS)
    with urlopen(req, timeout=timeout) as res:
        charset = res.headers.get_content_charset() or "utf-8"
        return res.read().decode(charset, errors="replace")


def title_of(page: str) -> Optional[str]:
    match = re.search(r"<title[^>]*>(.*?)</title>", page, flags=re.I | re.S)
    if not match:
        return None
    return html.unescape(re.sub(r"\s+", " ", match.group(1))).strip()


def normalize_number(value: str, unit: str = "") -> Optional[int]:
    value = value.replace(",", "").strip()
    if not value:
        return None
    try:
        number = float(value)
    except ValueError:
        return None

    unit = unit.lower()
    if unit == "万" or unit == "w":
        number *= 10000
    elif unit == "千" or unit == "k":
        number *= 1000
    return int(round(number))


def first_count(page: str, patterns: Iterable[str]) -> Optional[int]:
    for pattern in patterns:
        for match in re.finditer(pattern, page, flags=re.I | re.S):
            groups = match.groups()
            count = normalize_number(groups[0], groups[1] if len(groups) > 1 else "")
            if count is not None:
                return count
    return None


def parse_public_counts(page: str) -> Dict[str, Optional[int]]:
    decoded = html.unescape(page)
    decoded = re.sub(r"<style\b[^>]*>.*?</style>", "", decoded, flags=re.I | re.S)
    return {
        field: first_count(decoded, patterns)
        for field, patterns in FIELD_PATTERNS.items()
    }


def collect(url: str, timeout: int) -> Dict[str, object]:
    timestamp = datetime.now(timezone.utc).isoformat()
    try:
        page = fetch_html(url, timeout)
    except HTTPError as exc:
        return {
            "status": "unavailable",
            "reason": f"http_error_{exc.code}",
            "timestamp": timestamp,
            "url": url,
            "likes": None,
            "collects": None,
            "comments": None,
        }
    except URLError as exc:
        return {
            "status": "unavailable",
            "reason": f"network_error: {exc.reason}",
            "timestamp": timestamp,
            "url": url,
            "likes": None,
            "collects": None,
            "comments": None,
        }

    page_title = title_of(page)
    if page_title and "你访问的页面不见了" in page_title:
        return {
            "status": "unavailable",
            "reason": "public_page_not_found",
            "timestamp": timestamp,
            "url": url,
            "title": page_title,
            "likes": None,
            "collects": None,
            "comments": None,
        }

    counts = parse_public_counts(page)
    has_any_count = any(value is not None for value in counts.values())

    status = "ok" if has_any_count else "unavailable"
    reason = None
    if not has_any_count:
        reason = "counts_not_present_in_public_html"

    return {
        "status": status,
        "reason": reason,
        "timestamp": timestamp,
        "url": url,
        "title": page_title,
        **counts,
    }


def append_csv(path: str, row: Dict[str, object]) -> None:
    fields = ["timestamp", "url", "status", "reason", "title", "likes", "collects", "comments"]
    try:
        with open(path, "r", encoding="utf-8"):
            exists = True
    except FileNotFoundError:
        exists = False

    with open(path, "a", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        if not exists:
            writer.writeheader()
        writer.writerow({field: row.get(field) for field in fields})


def print_result(row: Dict[str, object], as_json: bool) -> None:
    if as_json:
        print(json.dumps(row, ensure_ascii=False, indent=2))
        return

    print(f"[{row['timestamp']}] status={row['status']}")
    if row.get("reason"):
        print(f"reason: {row['reason']}")
    if row.get("title"):
        print(f"title: {row['title']}")
    print(f"likes: {row.get('likes')}")
    print(f"collects: {row.get('collects')}")
    print(f"comments: {row.get('comments')}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Read public Xiaohongshu note interaction counts.")
    parser.add_argument("url", help="Xiaohongshu note URL")
    parser.add_argument("--timeout", type=int, default=15, help="request timeout in seconds")
    parser.add_argument("--interval", type=int, default=0, help="poll every N seconds; 0 runs once")
    parser.add_argument("--csv", help="append results to a CSV file")
    parser.add_argument("--json", action="store_true", help="print JSON output")
    args = parser.parse_args()

    while True:
        row = collect(args.url, args.timeout)
        print_result(row, args.json)
        if args.csv:
            append_csv(args.csv, row)
        if args.interval <= 0:
            break
        sys.stdout.flush()
        time.sleep(args.interval)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
