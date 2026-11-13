#!/usr/bin/env python3
"""Скачивает локальные копии шрифтов Manrope и JetBrains Mono (woff2).

Запускается один раз при обновлении шрифтов. Результат кладётся в assets/fonts/
и подключается через css/fonts.css — сайт работает без обращения к Google Fonts.
"""
import re
import socket
import time
import pathlib
import urllib.request

CSS_URL = (
    "https://fonts.googleapis.com/css2?"
    "family=Manrope:wght@400;500;600;700;800&"
    "family=JetBrains+Mono:wght@400;500;600&display=swap"
)
# Google отдаёт woff2 только современным браузерам — под эти UA и запрашиваем.
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
)
# Оставляем только латиницу и кириллицу: остальные субсеты не нужны.
KEEP_SUBSETS = {"cyrillic", "cyrillic-ext", "latin", "latin-ext"}

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / "assets" / "fonts"
OUT_CSS = ROOT / "css" / "fonts.css"


def fetch(url: str, attempts: int = 5) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    last: Exception | None = None
    for i in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read()
        except Exception as exc:  # сеть бывает нестабильной — пробуем ещё раз
            last = exc
            print(f"    ! попытка {i}/{attempts}: {exc}")
            time.sleep(2 * i)
    raise SystemExit(f"Не удалось скачать {url}: {last}")


def _prefer_ipv4() -> None:
    """На части машин IPv6 объявлен, но не работает — без этого urlopen падает."""
    orig = socket.getaddrinfo

    def ipv4_only(host, port, family=0, type=0, proto=0, flags=0):
        return orig(host, port, socket.AF_INET, type, proto, flags)

    socket.getaddrinfo = ipv4_only


def main() -> None:
    _prefer_ipv4()
    FONT_DIR.mkdir(parents=True, exist_ok=True)
    raw_css = fetch(CSS_URL).decode("utf-8")

    blocks = re.findall(r"/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{[^}]+\})", raw_css)
    out_blocks: list[str] = []
    seen: set[str] = set()

    for subset, block in blocks:
        if subset not in KEEP_SUBSETS:
            continue

        url_match = re.search(r"url\((https://[^)]+\.woff2)\)", block)
        family_match = re.search(r"font-family:\s*'([^']+)'", block)
        weight_match = re.search(r"font-weight:\s*(\d+)", block)
        if not (url_match and family_match and weight_match):
            continue

        family = family_match.group(1)
        weight = weight_match.group(1)
        fname = f"{family.lower().replace(' ', '-')}-{weight}-{subset}.woff2"
        dest = FONT_DIR / fname

        if fname not in seen:
            if not dest.exists():
                dest.write_bytes(fetch(url_match.group(1)))
                print(f"  + {fname}")
            else:
                print(f"  = {fname}")
            seen.add(fname)

        out_blocks.append(
            block.replace(url_match.group(1), f"../assets/fonts/{fname}")
        )

    header = (
        "/* Локальные шрифты. Сгенерировано scripts/fetch-fonts.py — не править вручную. */\n\n"
    )
    OUT_CSS.write_text(header + "\n\n".join(out_blocks) + "\n", encoding="utf-8")

    total = sum(f.stat().st_size for f in FONT_DIR.glob("*.woff2"))
    print(f"\nФайлов: {len(seen)}, объём: {total / 1024:.0f} КБ -> {OUT_CSS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
