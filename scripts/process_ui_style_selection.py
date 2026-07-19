from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "output/imagegen/zhe-yi-shen-ui-style-selection-v1/raw"
OUT_DIR = ROOT / "output/imagegen/zhe-yi-shen-ui-style-selection-v1/processed"

SOURCES = [
    ("001-create-a-professional-visual-direction-board-for-a-portrait-.png", "01-life-archive-pixel.png", "1  LIFE ARCHIVE"),
    ("002-create-a-professional-visual-direction-board-for-a-portrait-.png", "02-body-clinical-pixel.png", "2  BODY CLINICAL FILE"),
    ("003-create-a-professional-visual-direction-board-for-a-portrait-.png", "03-last-night-route-pixel.png", "3  LAST NIGHT ROUTE"),
    ("004-create-a-professional-visual-direction-board-for-a-portrait-.png", "04-domestic-shadow-box-pixel.png", "4  DOMESTIC SHADOW BOX"),
]


def pixelize(source: Path) -> Image.Image:
    image = Image.open(source).convert("RGB")
    native = image.resize((768, 512), Image.Resampling.BOX)
    indexed = native.quantize(colors=40, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    return indexed.convert("RGB").resize((1536, 1024), Image.Resampling.NEAREST)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    processed: list[tuple[Image.Image, str]] = []

    for source_name, output_name, label in SOURCES:
        image = pixelize(RAW_DIR / source_name)
        image.save(OUT_DIR / output_name, optimize=True)
        processed.append((image, label))

    contact = Image.new("RGB", (1536, 1088), "#09090d")
    draw = ImageDraw.Draw(contact)
    font = ImageFont.load_default(size=20)

    for index, (image, label) in enumerate(processed):
        col = index % 2
        row = index // 2
        x = col * 768
        y = row * 544
        thumb = image.resize((768, 512), Image.Resampling.NEAREST)
        contact.paste(thumb, (x, y + 32))
        draw.rectangle((x, y, x + 767, y + 31), fill="#111014")
        draw.text((x + 12, y + 6), label, font=font, fill="#e3decf")
        draw.line((x, y + 31, x + 767, y + 31), fill="#4b4743", width=1)

    contact.save(OUT_DIR / "ui-style-selection-contact-sheet.png", optimize=True)


if __name__ == "__main__":
    main()
