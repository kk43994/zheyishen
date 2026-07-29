#!/usr/bin/env python3
"""Build the two print-safe QR codes used by the exhibition materials."""

from pathlib import Path

import qrcode
from qrcode.constants import ERROR_CORRECT_H


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "promo" / "exhibition-2026"

TARGETS = {
    "qr-game.png": "https://shen.kk666.best/",
    "qr-wiki.png": "https://shen.kk666.best/wiki/",
}


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for filename, url in TARGETS.items():
        qr = qrcode.QRCode(
            version=None,
            error_correction=ERROR_CORRECT_H,
            box_size=24,
            border=4,
        )
        qr.add_data(url)
        qr.make(fit=True)
        image = qr.make_image(fill_color="#11100e", back_color="#fffdf6")
        image.save(OUTPUT / filename, dpi=(300, 300))
        print(f"{filename}\t{image.size[0]}x{image.size[1]}\t{url}")


if __name__ == "__main__":
    main()
