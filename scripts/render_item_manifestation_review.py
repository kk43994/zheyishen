#!/usr/bin/env python3
"""Render deterministic manifestation review assets for every source item.

This pipeline is intentionally review-only. It consumes the approved 40x56
style-1 mother, the 12-profile morph system, and the semantic item spec. It
does not write runtime assets and it never emits animation/GIF files.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont, ImageOps


REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "scripts"))

from render_style1_static_profiles_review import (  # noqa: E402
    Anchor,
    DIRECTIONS,
    FRAME_H,
FRAME_W,
    Profile,
    ROOT_X,
    ROOT_Y,
    clear_coat_foreground,
    canonical_raincoat,
    map_anchor,
    warp,
)


SPEC_PATH = REPO / "output/art-review-static/full-art-v1/items/item-manifestation-spec.json"
SOURCE_ITEMS = REPO / "src/relics.ts"
SOURCE_HERO = REPO / "output/imagegen/zhe-yi-shen-hero-style-gate-v2/processed/style-1"
PROFILE_MANIFEST = REPO / "output/imagegen/zhe-yi-shen-hero-style1-static-profiles-review-v1/manifest.json"
ICON_DIR = REPO / "output/art-review-static/full-art-v1/items/icons"
AC_ICON_DIR = REPO / "output/art-review-static/full-art-v1/items/ac-style-fixed/sprites"
OUTPUT_DIR = REPO / "output/art-review-static/full-art-v1/items/manifestations-v1"
CARD_DIR = OUTPUT_DIR / "cards"

EFFECT_W = 72
EFFECT_H = 64
BODY_ORIGIN_X = 16
BODY_ORIGIN_Y = 4
EFFECT_ROOT_X = BODY_ORIGIN_X + ROOT_X
EFFECT_ROOT_Y = BODY_ORIGIN_Y + ROOT_Y

TRANSPARENT = (0, 0, 0, 0)
INK = (23, 21, 27, 255)
COAL = (55, 52, 58, 255)
WORN = (103, 98, 98, 255)
SKIN_SHADOW = (146, 119, 100, 255)
SKIN = (199, 181, 158, 255)
SKIN_LIGHT = (218, 208, 186, 255)
PAPER = (218, 208, 186, 255)
PAPER_DARK = (159, 119, 114, 255)
RED = (166, 54, 73, 255)
RED_DARK = (112, 39, 55, 255)
GOLD = (197, 163, 76, 255)
BRASS = (165, 139, 98, 255)
BLUE = (104, 132, 146, 255)
BLUE_LIGHT = (145, 173, 176, 255)
CYAN = (94, 158, 154, 255)
GREEN = (92, 139, 122, 255)
YELLOW = (211, 195, 74, 255)
AMBER = (174, 113, 61, 255)
PINK = (183, 111, 147, 255)
PURPLE = (119, 85, 131, 255)
GRAY = (125, 126, 135, 255)
GRAY_LIGHT = (177, 178, 181, 255)
WHITE = (230, 226, 213, 255)

SKIN_COLORS = {SKIN_SHADOW, SKIN, SKIN_LIGHT}


@dataclass(frozen=True)
class VisualRule:
    profile: str = "average-average"
    posture: str = "neutral"
    palette: str = "default"
    prop: str = "none"
    mark: str = "none"
    aura: str = "none"
    shadow: str = "plain"
    projectile: str = "breath"
    material: str = "moon"
    trail: str = "none"
    impact: str = "pulse"
    cutout: str = "none"


def vr(
    profile: str = "average-average",
    posture: str = "neutral",
    palette: str = "default",
    prop: str = "none",
    mark: str = "none",
    aura: str = "none",
    shadow: str = "plain",
    projectile: str = "breath",
    material: str = "moon",
    trail: str = "none",
    impact: str = "pulse",
    cutout: str = "none",
) -> VisualRule:
    return VisualRule(profile, posture, palette, prop, mark, aura, shadow, projectile, material, trail, impact, cutout)


# Every entry is an explicit visual interpretation of the semantic spec. The
# fields are deliberately orthogonal: physical props are only one possible
# manifestation beside body shape, posture, palette, marks, shadow and attack.
RULES: dict[str, VisualRule] = {
    "loose-button": vr(prop="button", mark="missing-button", aura="thread", projectile="button", material="cloth", trail="stitch", impact="seam-pop"),
    "wooden-sword": vr(posture="brave", prop="sword", projectile="wedge", material="wood", trail="splinter", impact="splinter"),
    "red-workbook": vr(prop="book", mark="red-cross", aura="paper", projectile="page", material="paper", trail="paper", impact="red-cross"),
    "stone-schoolbag": vr("short-slim", "hunch", prop="backpack", shadow="weighted", projectile="stone", material="stone", trail="dust", impact="stone-crack"),
    "bleach-powder": vr(palette="blonde", mark="bleach", aura="powder", projectile="porous", material="powder", trail="powder", impact="yellow-stain"),
    "eyebrow-razor": vr(posture="guard", prop="razor", mark="scar", projectile="blade", material="metal", trail="slice", impact="fine-cut"),
    "od-pill": vr(palette="cool", prop="pillbag", mark="uneven-pupil", aura="glitch", projectile="glitch", material="pill", trail="glitch", impact="missing-frame"),
    "front-desk-letter": vr(prop="letter", aura="paper-orbit", projectile="envelope", material="paper", trail="paper", impact="paper-heart"),
    "cracked-glasses": vr(posture="forward", prop="glasses", mark="eye-crack", aura="focus", projectile="needle", material="glass", trail="focus", impact="glass-crack"),
    "small-uniform": vr("average-slim", "tight", palette="uniform-blue", prop="tight-uniform", mark="tight-seam", projectile="needle", material="thread", trail="stitch", impact="seam-snap"),
    "only-key": vr(posture="lean-left", prop="key", shadow="threshold", projectile="keyhole", material="metal", trail="door", impact="door-collapse"),
    "first-salary": vr(posture="proud", prop="salary", aura="coin", projectile="coin-ring", material="metal", trail="coin", impact="coin-flash"),
    "nameless-tie": vr("average-slim", "rigid", palette="red-accent", prop="tie", mark="tight-neck", projectile="tie-tip", material="cloth", trail="even", impact="cross-cut"),
    "fathers-raincoat": vr("average-sturdy", "heavy", palette="rain", prop="raincoat", aura="rain", shadow="wet", projectile="drop", material="water", trail="rain", impact="wet-ring"),
    "unsent-phone": vr(posture="phone", palette="cyan-face", prop="phone", aura="signal", projectile="sound-ring", material="signal", trail="signal", impact="missed-call"),
    "baby-tooth": vr(posture="protect", prop="tooth", aura="small-hand", shadow="child", projectile="tooth", material="bone", trail="child", impact="tooth-ring"),
    "revoked-badge": vr(posture="rigid", palette="scan-red", prop="badge", mark="labels", aura="scan", projectile="barcode", material="plastic", trail="barcode", impact="access-denied"),
    "slow-watch": vr(prop="watch", aura="time", shadow="delayed", projectile="clock", material="glass", trail="time", impact="clock-grid"),
    "missing-photo": vr(prop="photo", mark="missing-person", aura="photo-fade", shadow="absent", projectile="photo", material="paper", trail="photo", impact="blank-flash"),
    "white-bottle": vr("average-slim", "slouch", palette="pale", prop="white-bottle", mark="tired-eyes", aura="powder-white", projectile="tablet", material="chalk", trail="powder-white", impact="powder-soft"),
    "empty-frame": vr(palette="hollow", mark="void", aura="inward", shadow="frame-void", projectile="void", material="absence", trail="void", impact="implosion", cutout="person-hole"),
    "broken-spine": vr("short-slim", "broken", prop="spine", mark="spine", shadow="crooked", projectile="bone-chain", material="bone", trail="bone", impact="bone-break"),
    "spent-decade": vr("tall-slim", "old-slouch", palette="aged", mark="gray-hair", aura="debt", shadow="old-forward", projectile="thin-core", material="aged", trail="debt", impact="time-stop"),
    "held-pee": vr("short-soft", "compressed", prop="waist-knot", mark="strain", aura="pressure", shadow="pinched", projectile="pressure", material="dense", trail="pressure", impact="release"),
    "flash-escape": vr(aura="blink", shadow="afterimages", projectile="blink", material="signal", trail="broken", impact="twin-flash"),
    "class-break": vr("tall-slim", "run", aura="dust", shadow="runner", projectile="chalk", material="chalk", trail="chalk-hop", impact="tired-dust"),
    "last-page": vr(posture="alert", prop="page", mark="red-ink", aura="paper", projectile="page-large", material="paper", trail="paper", impact="red-stamp"),
    "five-ha": vr(mark="forced-smile", aura="laugh", projectile="wave-five", material="signal", trail="laugh", impact="laugh-push"),
    "red-packet": vr(posture="forward", prop="red-packet", aura="coin", projectile="coin-tooth", material="metal", trail="coin", impact="gold-drop"),
    "snow-screen": vr(palette="static", mark="static", aura="static", shadow="static", projectile="static", material="noise", trail="static", impact="reassemble", cutout="noise-bites"),
    "marble": vr(prop="marble", aura="glass-star", shadow="childhood", projectile="marble", material="glass", trail="ricochet", impact="glass-star"),
    "always-crying": vr(palette="wet", mark="tears", aura="tears", shadow="wet", projectile="tear", material="water", trail="tear", impact="wet-streak"),
    "three-day-visible": vr(projectile="breath", material="moon", trail="fade", impact="release-ring"),
    "read-3am": vr(posture="phone", palette="blue-face", prop="phone", mark="blue-check", aura="blue-check", projectile="receipt", material="glass", trail="check", impact="check-shatter"),
    "retracted-voice": vr("short-sturdy", "tight-neck", prop="voice-scarf", aura="waveform", projectile="voice-ring", material="signal", trail="wave", impact="mute-cut"),
    "takeout-3am": vr("average-soft", "soft-slouch", palette="oil", prop="takeout", mark="oil", aura="steam", shadow="soft", projectile="steam-core", material="oil", trail="steam", impact="oil-film"),
    "auto-renew": vr(prop="receipt-loop", aura="loop", shadow="charge-ring", projectile="loop", material="receipt", trail="loop", impact="coin-gap"),
    "bargain-link": vr(posture="pulled", prop="chain-phone", aura="helper-hands", shadow="hands", projectile="chain", material="link", trail="chain", impact="taut-link"),
    "mineral-water": vr(posture="rigid", prop="water-bottle", aura="condensation", projectile="spear", material="glass-water", trail="condensation", impact="water-shatter"),
    "group-dad": vr("average-sturdy", "protect", palette="muted-face", prop="name-tag", shadow="child-leg", projectile="small-core", material="moon", trail="child", impact="wide-child"),
    "divorce-draft": vr(posture="split", prop="divorce-paper", mark="split-seam", shadow="split", projectile="split-page", material="paper", trail="split", impact="paper-tear"),
    "checkup-arrows": vr("average-sturdy", "asymmetric", palette="report-red", mark="arrows", aura="report", projectile="report", material="chart", trail="scale", impact="report-scale"),
    "shared-powerbank": vr(posture="lean-left", palette="hospital", prop="powerbank", aura="hospital", projectile="plug", material="battery", trail="charge", impact="fee-block"),
    "third-pill": vr("average-sturdy", "unstable", palette="purple-cool", prop="pillbag", aura="purple-glitch", projectile="layered", material="pill", trail="glitch", impact="crash"),
    "loan-contract": vr(posture="dragged", prop="contract-chain", aura="interest", shadow="numbers", projectile="debt-core", material="metal-paper", trail="interest", impact="debt-stamp"),
    "name-sold": vr("average-sturdy", "rigid", palette="identity-gray", prop="blank-badge", mark="barcode-face", aura="scan", projectile="serial", material="plastic", trail="barcode", impact="scan-stamp"),
    "moms-bowl": vr("average-soft", "protect", palette="warm", prop="bowl", aura="warm-steam", shadow="leaving-hand", projectile="bowl-shield", material="ceramic", trail="warmth", impact="ceramic-light"),
    "ruma-msg": vr(posture="relaxed", palette="message-green", prop="phone", aura="messages", shadow="bubble", projectile="shield-bubble", material="signal", trail="message", impact="soft-word"),
    "held-elevator": vr(posture="reach", aura="elevator", shadow="door-rails", projectile="gate-core", material="light", trail="pause", impact="rechoose"),
    "old-door-lock": vr(posture="relaxed", prop="lock", aura="doorway", shadow="threshold", projectile="key-return", material="warm-metal", trail="home", impact="bolt"),
    "drank-for-boss": vr("average-soft", "sway", palette="amber-face", prop="cup", mark="red-cheek", aura="alcohol", projectile="amber", material="liquid", trail="zigzag", impact="splash-back"),
    "hair-in-takeout": vr("average-slim", "slouch", palette="oil", prop="takeout", mark="hairline", aura="steam", projectile="hair-core", material="oil", trail="hair", impact="hair-bind"),
    "unwashed-pillow": vr("short-soft", "soft-slouch", palette="stale", prop="pillow", aura="sleep", shadow="bed", projectile="cushion", material="cloth", trail="drag", impact="soft-catch"),
    "sock-cigs": vr("tall-slim", "forward", palette="smoke", prop="sock", mark="yellow-fingers", aura="smoke", projectile="smoke-core", material="smoke", trail="smoke", impact="ash"),
    "pregnancy-test": vr("average-sturdy", "protect", prop="test", aura="price-tags", shadow="baby", projectile="follower", material="moon", trail="follower", impact="half-beat"),
    "gym-card": vr("average-sturdy", "straight", prop="gym-card", aura="treadmill", projectile="runner-core", material="moon", trail="treadmill", impact="fee-gap"),
    "funeral-photo": vr(posture="rigid", palette="funeral", mark="photo-smile", aura="overexpose", projectile="overexposed", material="flash", trail="overexpose", impact="camera-flash"),
    "typing-indicator": vr(posture="phone", prop="phone", aura="typing", shadow="notification", projectile="three-dots", material="signal", trail="dots", impact="bubble-slip"),
    "year-report": vr(posture="slouch", palette="night", prop="headphones", mark="night-eyes", aura="rhythm", shadow="music-chart", projectile="beat-bars", material="signal", trail="beat", impact="sound-ring"),
    "momo-avatar": vr("short-soft", "hooded", palette="momo", prop="hood", aura="anonymous", projectile="pink-tooth", material="avatar", trail="pink", impact="avatar-outline"),
    "ai-chat": vr(posture="relaxed", palette="ai-blue", prop="terminal", aura="text", shadow="dialog", projectile="text-core", material="text", trail="text", impact="text-mend"),
    "streak-1847": vr(posture="straight", prop="check-chain", aura="checks", projectile="check-guard", material="metal", trail="checks", impact="broken-chain"),
    "goodnight-2h": vr("tall-slim", "slouch", palette="blue-face", prop="phone", mark="night-eyes", aura="blue-tail", shadow="bed-long", projectile="blue-core", material="signal", trail="blue-two", impact="lost-pixel"),
    "friend-verify": vr(posture="reach", prop="empty-phone", aura="verify", shadow="missing-companion", projectile="isolated", material="signal", trail="isolated", impact="verify-push"),
    "summer-run": vr("tall-slim", "run", aura="speed", shadow="runner-ahead", projectile="shuttle", material="moon", trail="straight", impact="overshoot"),
    "one-more-game": vr(posture="crouch", palette="screen-tired", prop="controller", mark="night-eyes", aura="continue", projectile="extra-core", material="game", trail="lag", impact="continue-one"),
    "eye-exercise": vr(posture="eyes", prop="eye-hands", mark="pressure-eyes", aura="eye-ring", projectile="closed-eye", material="membrane", trail="pause", impact="pupil-ring"),
    "card-binder": vr(prop="binder", aura="card", shadow="card-slots", projectile="card-core", material="card", trail="fade", impact="card-clear"),
    "abstract-lv10": vr(posture="taunt", mark="six", aura="angular-talk", projectile="six-block", material="text", trail="six", impact="red-charge"),
    "shop-freezer": vr("average-sturdy", "heavy", palette="frost", prop="freezer", mark="frost", aura="cold-breath", projectile="ice-core", material="ice", trail="frost", impact="ice-block"),
    "server-shutdown": vr(prop="device-link", aura="offline", shadow="pet", projectile="pet-copy", material="pixel", trail="offline", impact="offline-shield"),
    "painless-night": vr(posture="numb", palette="numb-gray", mark="wounds", aura="numb", shadow="gray-pool", projectile="dark-ring", material="numb", trail="heavy", impact="returning-pain"),
    "ktv-song": vr(posture="tight-neck", palette="blue-face", prop="voice-scarf", aura="waveform", projectile="voice-ring", material="signal", trail="wave", impact="sound-ring"),
    "breath-on-glass": vr(posture="forward", palette="frost", prop="glasses", aura="cold-breath", projectile="steam-core", material="glass-water", trail="condensation", impact="water-shatter"),
}


PALETTES: dict[str, dict[str, tuple[int, int, int, int]]] = {
    "default": {},
    "blonde": {"hair": YELLOW},
    "cool": {"skin": (168, 164, 171, 255), "skin_shadow": (108, 105, 121, 255)},
    "uniform-blue": {"outfit": (70, 91, 108, 255)},
    "red-accent": {"outfit": (66, 52, 61, 255)},
    "rain": {"outfit": (167, 138, 45, 255)},
    "cyan-face": {"glow": CYAN},
    "scan-red": {"outfit": (67, 57, 65, 255)},
    "pale": {"skin": (181, 179, 174, 255), "skin_shadow": (115, 113, 116, 255)},
    "hollow": {"outfit": (47, 44, 52, 255)},
    "aged": {"skin": (184, 169, 150, 255), "skin_shadow": (125, 107, 95, 255)},
    "static": {"outfit": (79, 80, 86, 255), "skin": (190, 187, 180, 255)},
    "wet": {"outfit": (48, 55, 66, 255)},
    "faded": {"outfit": (76, 73, 79, 255), "skin": (189, 180, 165, 255)},
    "blue-face": {"glow": BLUE_LIGHT},
    "oil": {"outfit": (69, 58, 53, 255)},
    "muted-face": {"skin": (191, 179, 163, 255)},
    "report-red": {"outfit": (68, 57, 62, 255)},
    "hospital": {"glow": (112, 157, 165, 255)},
    "purple-cool": {"outfit": (71, 55, 79, 255), "skin": (176, 164, 177, 255)},
    "identity-gray": {"outfit": (74, 75, 79, 255), "skin": (186, 181, 172, 255)},
    "warm": {"skin": (213, 185, 150, 255), "outfit": (67, 57, 53, 255)},
    "message-green": {"glow": (104, 169, 137, 255)},
    "amber-face": {"skin": (211, 163, 130, 255), "skin_shadow": (151, 93, 76, 255)},
    "stale": {"outfit": (67, 61, 63, 255)},
    "smoke": {"skin": (190, 170, 145, 255), "outfit": (58, 55, 59, 255)},
    "funeral": {"skin": (179, 179, 177, 255), "skin_shadow": (113, 111, 116, 255)},
    "night": {"outfit": (47, 49, 64, 255)},
    "momo": {"outfit": (139, 80, 118, 255), "glow": PINK},
    "ai-blue": {"outfit": (50, 60, 72, 255), "glow": (99, 155, 182, 255)},
    "screen-tired": {"outfit": (48, 48, 59, 255), "glow": BLUE},
    "frost": {"outfit": (58, 76, 88, 255), "hair": (87, 100, 109, 255)},
    "numb-gray": {"skin": (139, 139, 145, 255), "skin_shadow": (92, 91, 99, 255), "outfit": (60, 60, 68, 255)},
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_source_items() -> list[dict[str, object]]:
    source = SOURCE_ITEMS.read_text(encoding="utf-8")
    pattern = re.compile(
        r"id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*quality:\s*([1-5])"
        r".*?slot:\s*'([^']+)'.*?color:\s*'(#[0-9a-fA-F]{6})'",
        re.DOTALL,
    )
    result = []
    for match in pattern.finditer(source):
        result.append({
            "id": match[1], "name": match[2], "quality": int(match[3]),
            "slot": match[4], "color": match[5],
        })
    if not result or len({entry["id"] for entry in result}) != len(result):
        raise AssertionError(f"expected a non-empty unique source item set, got {len(result)}")
    return result


def rgba(value: str) -> tuple[int, int, int, int]:
    value = value.removeprefix("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4)) + (255,)  # type: ignore[return-value]


def mix(a: tuple[int, int, int, int], b: tuple[int, int, int, int], amount: float) -> tuple[int, int, int, int]:
    return tuple(round(x + (y - x) * amount) for x, y in zip(a, b))  # type: ignore[return-value]


def blank(size: tuple[int, int] = (FRAME_W, FRAME_H)) -> Image.Image:
    return Image.new("RGBA", size, TRANSPARENT)


def effect_blank() -> Image.Image:
    return blank((EFFECT_W, EFFECT_H))


def frame(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color, width: int = 1) -> None:
    for offset in range(width):
        x0, y0, x1, y1 = box
        draw.rectangle((x0 + offset, y0 + offset, x1 - offset, y1 - offset), outline=color)


def safe_line(draw: ImageDraw.ImageDraw, points: list[tuple[int, int]], color, width: int = 1) -> None:
    draw.line(points, fill=color, width=width)


def profile_from_key(key: str) -> Profile:
    stature, build = key.split("-", 1)
    return Profile(stature, build)


def apply_posture(body: Image.Image, posture: str, direction: str) -> Image.Image:
    if posture in {"neutral", "brave", "proud", "protect", "rigid", "straight", "numb", "hooded"}:
        return body.copy()
    result = blank()
    source = body.load()
    target = result.load()
    side_sign = -1 if direction == "left" else 1 if direction == "right" else 0

    for y in range(FRAME_H):
        for x in range(FRAME_W):
            pixel = source[x, y]
            if pixel[3] == 0:
                continue
            dx = 0
            dy = 0
            if y < 23:
                if posture in {"hunch", "broken"}:
                    dx = side_sign * (4 if posture == "broken" else 3)
                    dy = 2 if posture == "broken" else 1
                    if not side_sign:
                        dx = 2 if posture == "broken" else 1
                elif posture in {"forward", "run", "old-slouch", "soft-slouch", "slouch", "phone", "crouch", "taunt"}:
                    dx = side_sign * (3 if posture == "run" else 2)
                    dy = 1
                    if not side_sign and posture in {"run", "taunt"}:
                        dx = 1
                elif posture in {"lean-left", "pulled", "dragged"}:
                    dx = -2
                elif posture == "reach":
                    dx = side_sign * 2 if side_sign else 1
                elif posture in {"sway", "split", "asymmetric", "unstable"}:
                    dx = -1
                elif posture in {"compressed", "tight-neck", "eyes", "heavy", "alert"}:
                    dy = 1 if posture in {"compressed", "tight-neck", "eyes"} else 0
            elif y < 40:
                if posture in {"hunch", "broken"}:
                    dx = side_sign * (2 if posture == "broken" else 1)
                    dy = 1 if posture == "broken" else 0
                    if not side_sign and posture == "broken":
                        dx = 1
                elif posture in {"forward", "run", "old-slouch", "soft-slouch", "slouch", "phone", "crouch", "taunt"}:
                    dx = side_sign if side_sign else (1 if posture in {"run", "taunt"} else 0)
                elif posture in {"lean-left", "pulled", "dragged"}:
                    dx = -1
                elif posture == "reach":
                    dx = side_sign if side_sign else 1
                elif posture in {"sway", "split", "asymmetric", "unstable"}:
                    dx = 1
            destination = (x + dx, y + dy)
            if 0 <= destination[0] < FRAME_W and 0 <= destination[1] < FRAME_H:
                target[destination[0], destination[1]] = pixel
    return result


def recolor_body(body: Image.Image, palette_name: str) -> Image.Image:
    palette = PALETTES[palette_name]
    if not palette:
        return body.copy()
    result = body.copy()
    pixels = result.load()
    for y in range(FRAME_H):
        for x in range(FRAME_W):
            color = pixels[x, y]
            if color[3] == 0:
                continue
            if "skin" in palette and color in SKIN_COLORS:
                if color == SKIN_SHADOW:
                    pixels[x, y] = palette.get("skin_shadow", mix(palette["skin"], INK, 0.35))
                elif color == SKIN_LIGHT:
                    pixels[x, y] = mix(palette["skin"], WHITE, 0.35)
                else:
                    pixels[x, y] = palette["skin"]
            elif "outfit" in palette and y >= 23 and color == COAL:
                pixels[x, y] = palette["outfit"]
            elif "hair" in palette and color == INK and y <= 22:
                is_hair_region = y <= 12 or x <= 13 or x >= 27 or (y <= 16 and not (14 <= x <= 26))
                if is_hair_region and not (palette_name == "blonde" and (x + y) % 5 == 0):
                    pixels[x, y] = palette["hair"]
    return result


def apply_cutout(body: Image.Image, cutout: str, direction: str) -> tuple[Image.Image, Image.Image]:
    result = body.copy()
    mask = blank()
    if cutout == "none":
        return result, mask
    draw_mask = ImageDraw.Draw(mask)
    if cutout == "person-hole":
        if direction in {"front", "back"}:
            holes = [(18, 27), (19, 27), (20, 28), (21, 29), (19, 31), (20, 32), (18, 34), (21, 35), (19, 42)]
        else:
            center = 18 if direction == "left" else 22
            holes = [(center, 27), (center, 29), (center + (1 if direction == "left" else -1), 31), (center, 34), (center, 42)]
    elif cutout == "noise-bites":
        holes = [(x, y) for y in range(9, 49, 5) for x in range(8, 33, 7) if (x + y) % 3]
    elif cutout == "edge-fade":
        holes = [(x, y) for y in range(25, 49, 5) for x in (10, 29) if (x + y) % 2]
    else:
        raise KeyError(cutout)
    pixels = result.load()
    for x, y in holes:
        if 0 <= x < FRAME_W and 0 <= y < FRAME_H and pixels[x, y][3]:
            pixels[x, y] = TRANSPARENT
            draw_mask.point((x, y), fill=WHITE)
    return result, mask


def anchor_for(slot: str, direction: str, profile: Profile) -> tuple[int, int]:
    anchors = {
        "head": Anchor(20, 11, "head"),
        "face": Anchor(20, 17, "head"),
        "neck": Anchor(20, 23, "torso"),
        "chest": Anchor(20, 29, "torso"),
        "back": Anchor(20, 29, "torso"),
        "hand": Anchor(28, 36, "torso"),
        "waist": Anchor(20, 39, "torso"),
        "feet": Anchor(20, 49, "feet"),
    }
    anchor = anchors[slot]
    x, y = map_anchor(anchor, profile)
    if direction == "left":
        if slot == "face": x = 15
        elif slot in {"hand", "back"}: x = 23
        elif slot in {"neck", "chest", "waist"}: x = 19
    elif direction == "right":
        if slot == "face": x = 25
        elif slot in {"hand", "back"}: x = 17
        elif slot in {"neck", "chest", "waist"}: x = 21
    return x, y


def draw_shadow(layer: Image.Image, shadow: str, direction: str, body: Image.Image) -> None:
    draw = ImageDraw.Draw(layer)
    if shadow == "plain":
        draw.ellipse((13, 49, 27, 52), fill=(28, 25, 33, 255))
    elif shadow in {"weighted", "wet", "soft", "gray-pool"}:
        color = {"weighted": (39, 35, 41, 255), "wet": (38, 48, 58, 255), "soft": (48, 39, 39, 255), "gray-pool": (64, 63, 74, 255)}[shadow]
        draw.ellipse((8 if shadow != "weighted" else 11, 48, 32 if shadow != "weighted" else 29, 54), fill=color)
        if shadow == "gray-pool":
            draw.rectangle((6, 52, 34, 53), fill=color)
    elif shadow in {"child", "child-leg", "baby", "childhood"}:
        x = 9 if direction != "left" else 28
        color = (68, 58, 61, 255)
        draw.ellipse((x - 2, 43, x + 2, 47), fill=color)
        draw.rectangle((x - 1, 47, x + 1, 52), fill=color)
        draw.point((x - 2, 53), fill=color); draw.point((x + 2, 53), fill=color)
        if shadow == "child-leg":
            safe_line(draw, [(x + 1, 48), (15, 44)], color)
    elif shadow == "delayed":
        draw.ellipse((10, 50, 25, 53), fill=(57, 53, 66, 255))
        draw.ellipse((16, 49, 30, 52), outline=(112, 128, 145, 255))
    elif shadow in {"absent", "missing-companion"}:
        draw.ellipse((11, 49, 26, 53), fill=(39, 35, 42, 255))
        draw.ellipse((26, 50, 34, 52), fill=(72, 61, 67, 255))
        draw.rectangle((29, 49, 31, 52), fill=TRANSPARENT)
    elif shadow == "frame-void":
        draw.ellipse((8, 48, 32, 54), fill=(67, 50, 48, 255))
        draw.polygon([(16, 49), (20, 48), (24, 50), (22, 53), (17, 53)], fill=TRANSPARENT)
    elif shadow == "afterimages":
        for dx, color in ((-6, (69, 56, 87, 255)), (-4, (89, 69, 108, 255)), (-2, (119, 96, 137, 255))):
            ghost = body.copy()
            gp = ghost.load()
            for y in range(FRAME_H):
                for x in range(FRAME_W):
                    if gp[x, y][3]:
                        gp[x, y] = color if (x + y) % 3 else TRANSPARENT
            layer.alpha_composite(ghost, (dx, 0))
        draw.ellipse((16, 50, 31, 53), fill=(70, 60, 82, 255))
    elif shadow == "old-forward":
        x = 27 if direction != "left" else 13
        draw.ellipse((x - 4, 49, x + 5, 53), fill=(68, 61, 64, 255))
        draw.rectangle((x - 1, 40, x + 1, 50), fill=(68, 61, 64, 255))
        draw.ellipse((x - 3, 35, x + 3, 41), fill=(68, 61, 64, 255))
    elif shadow in {"pinched", "crooked"}:
        points = [(13, 51), (18, 49), (21, 52), (27, 50), (30, 53), (13, 53)]
        draw.polygon(points, fill=(45, 39, 45, 255))
    elif shadow == "runner":
        for x in (9, 13, 17): draw.rectangle((x, 51, x + 2, 52), fill=(104, 89, 64, 255))
    elif shadow == "static":
        for x, y in ((8, 50), (12, 53), (17, 51), (23, 53), (28, 50), (32, 52)):
            draw.rectangle((x, y, x + 1, y + 1), fill=GRAY)
    elif shadow == "fading-frames":
        for index, x in enumerate((8, 14, 20, 26)):
            color = mix((44, 39, 47, 255), (105, 91, 99, 255), index / 5)
            frame(draw, (x, 48 + index % 2, x + 4, 53), color)
    elif shadow == "charge-ring":
        draw.ellipse((9, 48, 31, 54), outline=GREEN)
        draw.rectangle((18, 48, 21, 49), fill=TRANSPARENT)
    elif shadow == "hands":
        draw.ellipse((12, 50, 28, 53), fill=(44, 38, 45, 255))
        for x in (6, 10, 30):
            safe_line(draw, [(x, 52), (x + 2, 44), (x + 4, 41)], (83, 71, 79, 255))
    elif shadow == "split":
        draw.polygon([(10, 50), (19, 49), (18, 54), (8, 53)], fill=(53, 45, 49, 255))
        draw.polygon([(21, 49), (31, 50), (33, 53), (22, 54)], fill=(70, 55, 59, 255))
    elif shadow == "numbers":
        draw.rectangle((6, 51, 34, 53), fill=(54, 44, 39, 255))
        for x in (8, 14, 22, 29): draw.point((x, 50), fill=GOLD)
    elif shadow == "leaving-hand":
        draw.ellipse((10, 50, 29, 53), fill=(56, 45, 42, 255))
        safe_line(draw, [(31, 49), (35, 45), (36, 42)], (123, 92, 72, 255), 2)
    elif shadow in {"bubble", "dialog"}:
        frame(draw, (9, 48, 31, 53), (65, 91, 88, 255))
        draw.polygon([(14, 52), (17, 52), (15, 54)], fill=(65, 91, 88, 255))
    elif shadow == "door-rails":
        draw.rectangle((10, 45, 11, 54), fill=(92, 108, 119, 255))
        draw.rectangle((29, 45, 30, 54), fill=(92, 108, 119, 255))
        draw.rectangle((10, 53, 30, 54), fill=(53, 48, 56, 255))
    elif shadow == "threshold":
        draw.rectangle((9, 51, 31, 53), fill=(67, 50, 41, 255))
        draw.rectangle((12, 50, 28, 50), fill=(156, 113, 64, 255))
    elif shadow in {"bed", "bed-long"}:
        box = (5, 49, 35, 54) if shadow == "bed-long" else (8, 49, 32, 54)
        draw.rounded_rectangle(box, radius=2, fill=(59, 50, 58, 255))
        draw.rectangle((box[0] + 2, box[1] + 1, box[0] + 8, box[3] - 1), fill=(88, 76, 80, 255))
    elif shadow == "notification":
        draw.ellipse((12, 50, 28, 53), fill=(40, 37, 45, 255))
        draw.point((31, 49), fill=CYAN)
    elif shadow == "music-chart":
        for radius, color in ((10, (53, 49, 65, 255)), (7, (82, 75, 96, 255))):
            draw.arc((20 - radius, 50 - radius // 3, 20 + radius, 54 + radius // 3), 190, 350, fill=color)
    elif shadow == "card-slots":
        for x in (8, 14, 20, 26): frame(draw, (x, 49, x + 4, 53), (71, 67, 78, 255))
    elif shadow == "pet":
        draw.ellipse((11, 50, 27, 53), fill=(44, 39, 46, 255))
        draw.rectangle((29, 47, 33, 51), fill=(93, 84, 103, 255))
        draw.point((29, 46), fill=(93, 84, 103, 255)); draw.point((33, 46), fill=(93, 84, 103, 255))
    elif shadow == "runner-ahead":
        draw.ellipse((18, 50, 34, 53), fill=(54, 49, 58, 255))
        safe_line(draw, [(27, 49), (35, 47)], (89, 80, 94, 255))
    else:
        draw.ellipse((13, 49, 27, 52), fill=(28, 25, 33, 255))


def draw_mark(layer: Image.Image, mark: str, direction: str, profile: Profile) -> None:
    if mark == "none":
        return
    draw = ImageDraw.Draw(layer)
    face_x, face_y = anchor_for("face", direction, profile)
    chest_x, chest_y = anchor_for("chest", direction, profile)
    hand_x, hand_y = anchor_for("hand", direction, profile)
    waist_x, waist_y = anchor_for("waist", direction, profile)
    if mark == "missing-button" and direction != "back":
        draw.point((chest_x + 2, chest_y + 5), fill=INK)
        safe_line(draw, [(chest_x - 1, chest_y + 5), (chest_x + 1, chest_y + 4)], PAPER_DARK)
    elif mark in {"red-cross", "red-ink"} and direction != "back":
        for dx, dy in ((-3, 1), (3, 5)):
            safe_line(draw, [(chest_x + dx - 1, chest_y + dy - 1), (chest_x + dx + 1, chest_y + dy + 1)], RED)
            safe_line(draw, [(chest_x + dx + 1, chest_y + dy - 1), (chest_x + dx - 1, chest_y + dy + 1)], RED)
    elif mark == "bleach":
        for x, y in ((11, 24), (28, 26), (15, 28)): draw.point((x, y), fill=YELLOW)
    elif mark == "scar" and direction != "back":
        for offset in (-4, -1, 2): safe_line(draw, [(hand_x - 1, hand_y + offset), (hand_x + 1, hand_y + offset - 1)], RED_DARK)
        if direction == "front": draw.rectangle((face_x - 5, face_y - 4, face_x - 2, face_y - 4), fill=SKIN)
    elif mark == "uneven-pupil" and direction != "back":
        draw.rectangle((face_x - (4 if direction == "front" else 0), face_y - 1, face_x - (3 if direction == "front" else -1), face_y), fill=PINK)
        if direction == "front": draw.point((face_x + 4, face_y), fill=CYAN)
    elif mark in {"eye-crack", "tired-eyes", "night-eyes"} and direction != "back":
        color = BLUE if mark == "night-eyes" else WORN
        if direction == "front":
            safe_line(draw, [(face_x - 5, face_y + 2), (face_x - 2, face_y + 2)], color)
            safe_line(draw, [(face_x + 2, face_y + 2), (face_x + 5, face_y + 2)], color)
        else:
            safe_line(draw, [(face_x - 1, face_y + 2), (face_x + 2, face_y + 2)], color)
        if mark == "eye-crack": safe_line(draw, [(face_x + 1, face_y - 2), (face_x + 3, face_y + 2)], BLUE_LIGHT)
    elif mark == "tight-seam" and direction != "back":
        safe_line(draw, [(chest_x - 4, chest_y), (chest_x - 6, chest_y + 3)], BLUE_LIGHT)
        safe_line(draw, [(chest_x + 4, chest_y), (chest_x + 6, chest_y + 3)], BLUE_LIGHT)
        draw.point((chest_x, chest_y + 4), fill=PAPER)
    elif mark == "tight-neck" and direction != "back":
        safe_line(draw, [(chest_x - 3, chest_y - 6), (chest_x + 3, chest_y - 6)], RED_DARK)
    elif mark == "labels":
        for x, y in ((chest_x + 4, chest_y), (chest_x - 4, chest_y + 5), (face_x + 4, face_y + 3)):
            draw.rectangle((x, y, x + 2, y + 1), fill=RED)
    elif mark in {"missing-person", "void"} and direction != "back":
        draw.rectangle((chest_x - 1, chest_y - 1, chest_x + 1, chest_y + 2), fill=(31, 28, 35, 255))
    elif mark == "spine":
        x = chest_x + (5 if direction != "right" else -5)
        for y in range(chest_y - 5, chest_y + 10, 3):
            draw.rectangle((x - 1, y, x + 1, y + 1), fill=PAPER_DARK)
    elif mark == "gray-hair":
        for x, y in ((15, 9), (17, 11), (24, 10), (26, 13)): draw.point((x, y), fill=GRAY_LIGHT)
    elif mark == "strain" and direction != "back":
        safe_line(draw, [(face_x - 2, face_y + 4), (face_x + 2, face_y + 4)], RED_DARK)
        draw.point((waist_x - 3, waist_y + 5), fill=YELLOW); draw.point((waist_x + 3, waist_y + 5), fill=YELLOW)
    elif mark == "forced-smile" and direction != "back":
        safe_line(draw, [(face_x - 4, face_y + 4), (face_x, face_y + 6), (face_x + 4, face_y + 4)], RED_DARK)
        for x in (face_x - 5, face_x + 5): draw.point((x, face_y + 3), fill=RED)
    elif mark == "static":
        for x, y in ((9, 13), (27, 18), (12, 29), (24, 36), (17, 45)): draw.rectangle((x, y, x + 1, y), fill=GRAY_LIGHT)
    elif mark == "tears" and direction != "back":
        if direction == "front":
            for x in (face_x - 4, face_x + 4): safe_line(draw, [(x, face_y + 1), (x, chest_y + 5)], BLUE, 1)
        else:
            safe_line(draw, [(face_x, face_y + 1), (face_x, chest_y + 4)], BLUE)
    elif mark == "blue-check" and direction != "back":
        for offset in (0, 3):
            safe_line(draw, [(hand_x - 2, hand_y - offset), (hand_x, hand_y - offset + 2), (hand_x + 3, hand_y - offset - 2)], CYAN)
    elif mark == "oil":
        for x, y in ((chest_x - 4, chest_y + 3), (chest_x + 3, chest_y + 7), (waist_x - 2, waist_y - 2)): draw.rectangle((x, y, x + 2, y + 1), fill=(93, 68, 46, 255))
    elif mark == "split-seam":
        safe_line(draw, [(chest_x, chest_y - 5), (chest_x - 1, chest_y), (chest_x + 1, chest_y + 5)], PAPER_DARK)
    elif mark == "arrows":
        for x, y, sign in ((chest_x - 5, chest_y, -1), (chest_x + 5, chest_y + 4, 1)):
            safe_line(draw, [(x, y + 3), (x, y - 2)], RED)
            safe_line(draw, [(x, y - 2), (x + sign * 2, y)], RED)
    elif mark == "barcode-face" and direction != "back":
        for x in range(face_x - 4, face_x + 5, 2): draw.rectangle((x, face_y + 2, x, face_y + 5), fill=INK)
    elif mark == "red-cheek" and direction != "back":
        draw.point((face_x - 5, face_y + 2), fill=RED); draw.point((face_x + 5, face_y + 2), fill=RED)
    elif mark == "hairline":
        safe_line(draw, [(face_x + 2, face_y + 5), (chest_x + 5, chest_y + 5), (waist_x + 4, waist_y)], INK)
    elif mark == "yellow-fingers":
        draw.rectangle((hand_x - 1, hand_y - 1, hand_x + 1, hand_y), fill=YELLOW)
    elif mark == "photo-smile" and direction != "back":
        safe_line(draw, [(face_x - 3, face_y + 4), (face_x, face_y + 5), (face_x + 3, face_y + 4)], GRAY_LIGHT)
        draw.point((face_x - 6, face_y - 5), fill=WHITE); draw.point((face_x + 6, face_y - 3), fill=WHITE)
    elif mark == "pressure-eyes" and direction != "back":
        safe_line(draw, [(face_x - 5, face_y), (face_x - 2, face_y)], RED_DARK)
        safe_line(draw, [(face_x + 2, face_y), (face_x + 5, face_y)], RED_DARK)
    elif mark == "six" and direction != "back":
        draw.rectangle((face_x + 5, face_y + 1, face_x + 7, face_y + 3), fill=RED)
        draw.point((face_x + 5, face_y + 2), fill=INK)
    elif mark == "frost":
        for x, y in ((12, 13), (28, 17), (11, 31), (29, 36)): draw.point((x, y), fill=BLUE_LIGHT)
    elif mark == "wounds":
        for x, y in ((15, 28), (24, 32), (17, 38), (23, 43)): draw.rectangle((x, y, x + 2, y + 1), fill=(78, 70, 77, 255))


def draw_prop(layer: Image.Image, prop: str, direction: str, profile: Profile) -> None:
    if prop == "none":
        return
    if prop == "raincoat":
        mother = canonical_raincoat(direction)
        coat = warp(mother, profile)
        layer.alpha_composite(coat)
        return
    draw = ImageDraw.Draw(layer)
    face_x, face_y = anchor_for("face", direction, profile)
    neck_x, neck_y = anchor_for("neck", direction, profile)
    chest_x, chest_y = anchor_for("chest", direction, profile)
    back_x, back_y = anchor_for("back", direction, profile)
    hand_x, hand_y = anchor_for("hand", direction, profile)
    waist_x, waist_y = anchor_for("waist", direction, profile)
    side = direction in {"left", "right"}
    sign = -1 if direction == "right" else 1

    if prop == "button":
        draw.ellipse((hand_x - 2, hand_y - 2, hand_x + 2, hand_y + 2), fill=PAPER_DARK)
        draw.point((hand_x - 1, hand_y), fill=INK); draw.point((hand_x + 1, hand_y), fill=INK)
    elif prop == "sword":
        safe_line(draw, [(back_x - 7 * sign, back_y + 15), (back_x + 7 * sign, back_y - 13)], INK, 3)
        safe_line(draw, [(back_x - 7 * sign, back_y + 15), (back_x + 7 * sign, back_y - 13)], (133, 91, 54, 255))
        safe_line(draw, [(back_x + 2 * sign, back_y - 5), (back_x + 8 * sign, back_y - 1)], BRASS, 2)
    elif prop in {"book", "binder", "divorce-paper"}:
        color = RED if prop == "book" else BLUE if prop == "binder" else PAPER
        x = back_x if prop in {"book", "binder"} else chest_x
        y = back_y if prop in {"book", "binder"} else chest_y
        if side:
            draw.rectangle((x - 1, y - 6, x + 1, y + 6), fill=INK)
            draw.rectangle((x, y - 5, x, y + 5), fill=color)
        else:
            draw.rectangle((x - 5, y - 6, x + 5, y + 6), fill=INK)
            draw.rectangle((x - 4, y - 5, x + 4, y + 5), fill=color)
            if prop == "divorce-paper": safe_line(draw, [(x, y - 5), (x - 1, y), (x + 1, y + 5)], RED_DARK)
    elif prop in {"backpack", "freezer", "pillow"}:
        color = WORN if prop == "backpack" else BLUE if prop == "freezer" else (103, 82, 91, 255)
        width = 11 if not side else 7
        height = 17 if prop != "pillow" else 11
        draw.rounded_rectangle((back_x - width // 2, back_y - height // 2, back_x + width // 2, back_y + height // 2), radius=2, fill=INK)
        draw.rectangle((back_x - width // 2 + 1, back_y - height // 2 + 1, back_x + width // 2 - 1, back_y + height // 2 - 1), fill=color)
        if prop == "backpack":
            for x, y in ((back_x - 2, back_y - 3), (back_x + 2, back_y), (back_x, back_y + 4)): draw.rectangle((x, y, x + 1, y + 1), fill=(70, 67, 65, 255))
        elif prop == "freezer":
            draw.rectangle((back_x - width // 2 + 1, back_y - 1, back_x + width // 2 - 1, back_y), fill=BLUE_LIGHT)
        else:
            safe_line(draw, [(back_x - width // 2 + 2, back_y), (back_x + width // 2 - 2, back_y)], PAPER_DARK)
    elif prop in {"razor", "key", "watch", "marble", "test", "gym-card", "check-chain"}:
        if prop == "razor": safe_line(draw, [(hand_x - 3, hand_y + 1), (hand_x + 3, hand_y - 1)], GRAY_LIGHT); draw.rectangle((hand_x + 2, hand_y - 2, hand_x + 4, hand_y), fill=WHITE)
        elif prop == "key": frame(draw, (waist_x - 2, waist_y - 2, waist_x + 1, waist_y + 1), GOLD); safe_line(draw, [(waist_x, waist_y + 2), (waist_x, waist_y + 7)], GOLD); draw.point((waist_x + 2, waist_y + 6), fill=GOLD)
        elif prop == "watch": frame(draw, (hand_x - 2, hand_y - 2, hand_x + 2, hand_y + 2), BLUE_LIGHT); safe_line(draw, [(hand_x, hand_y - 4), (hand_x, hand_y + 4)], WORN)
        elif prop == "marble": draw.ellipse((hand_x - 2, hand_y - 2, hand_x + 2, hand_y + 2), fill=CYAN); draw.point((hand_x - 1, hand_y - 1), fill=WHITE)
        elif prop == "test": draw.rectangle((hand_x - 1, hand_y - 5, hand_x + 1, hand_y + 3), fill=WHITE); draw.point((hand_x, hand_y - 1), fill=PINK)
        elif prop == "gym-card": draw.rectangle((waist_x - 3, waist_y - 2, waist_x + 3, waist_y + 2), fill=GREEN); draw.rectangle((waist_x - 1, waist_y - 1, waist_x + 1, waist_y), fill=WHITE)
        else:
            safe_line(draw, [(hand_x - 4, hand_y - 2), (hand_x + 4, hand_y + 2)], GOLD)
            for x in (hand_x - 3, hand_x, hand_x + 3): draw.point((x, hand_y), fill=WHITE)
    elif prop in {"pillbag", "white-bottle", "water-bottle", "powerbank", "takeout", "sock"}:
        x, y = waist_x, waist_y
        if prop == "pillbag":
            draw.rectangle((x - 3, y - 4, x + 3, y + 4), fill=INK); draw.rectangle((x - 2, y - 3, x + 2, y + 3), fill=PINK); draw.point((x, y), fill=WHITE)
        elif prop in {"white-bottle", "water-bottle"}:
            color = WHITE if prop == "white-bottle" else BLUE_LIGHT
            draw.rounded_rectangle((x - 2, y - 5, x + 2, y + 4), radius=1, fill=color); draw.rectangle((x - 1, y - 6, x + 1, y - 5), fill=INK)
        elif prop == "powerbank":
            draw.rectangle((x - 4, y - 5, x + 4, y + 5), fill=INK); draw.rectangle((x - 3, y - 4, x + 3, y + 4), fill=BLUE); safe_line(draw, [(x, y - 4), (chest_x, chest_y)], CYAN)
        elif prop == "takeout":
            draw.polygon([(x - 4, y - 4), (x + 4, y - 4), (x + 5, y + 5), (x - 5, y + 5)], fill=BRASS); safe_line(draw, [(x - 3, y - 4), (x - 2, y - 8), (x + 2, y - 8), (x + 3, y - 4)], INK)
        else:
            draw.rectangle((x - 3, y + 5, x + 3, y + 8), fill=(76, 69, 71, 255)); draw.point((x + 2, y + 6), fill=GRAY_LIGHT)
    elif prop in {"letter", "salary", "page", "photo", "badge", "name-tag", "blank-badge", "red-packet"}:
        x, y = (hand_x, hand_y) if prop in {"salary", "page", "red-packet"} else (chest_x, chest_y)
        color = PAPER
        if prop in {"badge", "name-tag", "blank-badge"}: color = BLUE
        if prop == "red-packet": color = RED
        width, height = (7, 5) if prop not in {"page", "photo"} else (7, 9)
        draw.rectangle((x - width // 2 - 1, y - height // 2 - 1, x + width // 2 + 1, y + height // 2 + 1), fill=INK)
        draw.rectangle((x - width // 2, y - height // 2, x + width // 2, y + height // 2), fill=color)
        if prop in {"letter", "salary"}: safe_line(draw, [(x - 3, y - 2), (x, y), (x + 3, y - 2)], PAPER_DARK)
        if prop == "photo": draw.rectangle((x - 1, y - 2, x + 1, y + 1), fill=WORN)
        if prop == "blank-badge": draw.rectangle((x - 2, y - 1, x + 2, y + 1), fill=WHITE)
    elif prop in {"glasses", "hood"}:
        if prop == "hood":
            draw.arc((face_x - 9, face_y - 10, face_x + 9, face_y + 8), 180, 355, fill=PINK, width=3)
            draw.point((face_x - 7, face_y - 8), fill=PINK); draw.point((face_x + 7, face_y - 8), fill=PINK)
        elif direction != "back":
            if direction == "front":
                frame(draw, (face_x - 6, face_y - 2, face_x - 1, face_y + 2), BLUE_LIGHT)
                frame(draw, (face_x + 1, face_y - 2, face_x + 6, face_y + 2), BLUE_LIGHT)
                safe_line(draw, [(face_x - 1, face_y), (face_x + 1, face_y)], BLUE_LIGHT)
            else:
                frame(draw, (face_x - 2, face_y - 2, face_x + 3, face_y + 2), BLUE_LIGHT)
    elif prop in {"tight-uniform", "tie", "voice-scarf"}:
        if prop == "tight-uniform":
            safe_line(draw, [(chest_x - 6, chest_y - 4), (chest_x - 5, chest_y + 7)], BLUE)
            safe_line(draw, [(chest_x + 6, chest_y - 4), (chest_x + 5, chest_y + 7)], BLUE)
        elif prop == "tie":
            safe_line(draw, [(neck_x, neck_y), (chest_x, chest_y + 6)], RED_DARK, 2); draw.polygon([(chest_x - 2, chest_y + 6), (chest_x + 2, chest_y + 6), (chest_x, chest_y + 9)], fill=RED_DARK)
        else:
            for offset in (-2, 0, 2): safe_line(draw, [(neck_x - 6, neck_y + offset), (neck_x + 6, neck_y + offset)], INK)
    elif prop in {"phone", "terminal", "empty-phone", "chain-phone"}:
        x, y = hand_x, hand_y
        draw.rectangle((x - 3, y - 5, x + 3, y + 5), fill=INK)
        screen = CYAN if prop != "terminal" else BLUE
        draw.rectangle((x - 2, y - 4, x + 2, y + 3), fill=screen)
        if prop == "empty-phone": draw.rectangle((x - 1, y - 2, x + 1, y + 1), fill=(42, 45, 52, 255))
        if prop == "chain-phone": safe_line(draw, [(x + 3, y), (35, y - 3)], RED, 2)
    elif prop in {"tooth", "lock", "cup", "bowl", "waist-knot", "headphones", "controller", "eye-hands", "device-link"}:
        if prop == "tooth":
            safe_line(draw, [(neck_x, neck_y - 2), (neck_x, chest_y)], BRASS); draw.polygon([(chest_x - 2, chest_y), (chest_x + 2, chest_y), (chest_x + 1, chest_y + 4), (chest_x, chest_y + 2), (chest_x - 1, chest_y + 4)], fill=WHITE)
        elif prop == "lock":
            frame(draw, (waist_x - 3, waist_y - 2, waist_x + 3, waist_y + 4), BRASS); draw.arc((waist_x - 2, waist_y - 6, waist_x + 2, waist_y), 180, 360, fill=BRASS)
        elif prop == "cup":
            draw.rectangle((hand_x - 3, hand_y - 3, hand_x + 2, hand_y + 3), fill=AMBER); draw.arc((hand_x, hand_y - 2, hand_x + 5, hand_y + 2), 270, 90, fill=BRASS)
        elif prop == "bowl":
            draw.arc((chest_x - 6, chest_y - 2, chest_x + 6, chest_y + 6), 0, 180, fill=BRASS, width=2); safe_line(draw, [(chest_x - 5, chest_y + 1), (chest_x + 5, chest_y + 1)], PAPER)
        elif prop == "waist-knot":
            safe_line(draw, [(waist_x - 6, waist_y), (waist_x + 6, waist_y)], BRASS); draw.polygon([(waist_x - 2, waist_y), (waist_x, waist_y + 2), (waist_x + 2, waist_y)], fill=GOLD)
        elif prop == "headphones":
            draw.arc((face_x - 8, face_y - 10, face_x + 8, face_y + 5), 180, 360, fill=BLUE, width=2); draw.rectangle((face_x - 8, face_y - 2, face_x - 6, face_y + 3), fill=BLUE); draw.rectangle((face_x + 6, face_y - 2, face_x + 8, face_y + 3), fill=BLUE)
        elif prop == "controller":
            draw.rounded_rectangle((chest_x - 6, chest_y, chest_x + 6, chest_y + 6), radius=2, fill=INK); draw.point((chest_x - 3, chest_y + 3), fill=CYAN); draw.point((chest_x + 3, chest_y + 3), fill=RED)
        elif prop == "eye-hands":
            if direction != "back":
                safe_line(draw, [(hand_x - 5, hand_y), (face_x - 5, face_y)], SKIN_LIGHT, 2); safe_line(draw, [(hand_x + 2, hand_y), (face_x + 5, face_y)], SKIN_LIGHT, 2)
        else:
            draw.rectangle((hand_x - 3, hand_y - 4, hand_x + 3, hand_y + 4), fill=BLUE); safe_line(draw, [(hand_x, hand_y + 4), (29, 48)], CYAN)
    elif prop in {"receipt-loop", "contract-chain"}:
        y = waist_y if prop == "receipt-loop" else hand_y
        color = GREEN if prop == "receipt-loop" else PAPER_DARK
        safe_line(draw, [(8, y), (15, y - 2), (22, y + 1), (31, y - 2)], color, 2)
        if prop == "contract-chain":
            for x in range(9, 33, 5): frame(draw, (x, y - 2, x + 3, y + 1), BRASS)
    else:
        draw.rectangle((waist_x - 2, waist_y - 2, waist_x + 2, waist_y + 2), fill=BRASS)


def draw_aura(layer: Image.Image, aura: str, direction: str, profile: Profile) -> None:
    if aura == "none":
        return
    draw = ImageDraw.Draw(layer)
    face_x, face_y = anchor_for("face", direction, profile)
    chest_x, chest_y = anchor_for("chest", direction, profile)
    hand_x, hand_y = anchor_for("hand", direction, profile)
    waist_x, waist_y = anchor_for("waist", direction, profile)
    if aura in {"thread", "stitch"}:
        safe_line(draw, [(hand_x - 4, hand_y + 2), (hand_x, hand_y + 4), (hand_x + 4, hand_y + 2)], PAPER_DARK)
    elif aura in {"paper", "paper-orbit"}:
        for x, y in ((8, 24), (31, 29), (11, 42)): draw.polygon([(x, y), (x + 3, y + 1), (x + 1, y + 3)], fill=PAPER)
    elif aura in {"powder", "powder-white"}:
        color = YELLOW if aura == "powder" else WHITE
        for x, y in ((8, 12), (31, 18), (10, 31), (29, 39), (15, 7)): draw.point((x, y), fill=color)
    elif aura in {"glitch", "purple-glitch"}:
        colors = (PINK, CYAN) if aura == "glitch" else (PURPLE, CYAN)
        for index, (x, y) in enumerate(((7, 16), (30, 23), (9, 35), (29, 43))): draw.rectangle((x, y, x + 2, y), fill=colors[index % 2])
    elif aura == "focus":
        for x, y in ((6, face_y), (34, face_y), (20, 5)): draw.point((x, y), fill=BLUE_LIGHT)
    elif aura == "coin":
        for x, y in ((8, 30), (31, 25), (12, 45)): draw.rectangle((x, y, x + 1, y + 1), fill=GOLD)
    elif aura == "rain":
        for x, y in ((8, 17), (31, 22), (11, 38), (28, 44)): safe_line(draw, [(x, y), (x - 1, y + 3)], BLUE)
    elif aura in {"signal", "blue-check", "typing", "messages", "text", "verify"}:
        color = CYAN if aura not in {"messages", "verify"} else GREEN
        if aura == "typing":
            for index, x in enumerate((hand_x - 5, hand_x, hand_x + 5)): draw.rectangle((x, hand_y - 8 - index % 2, x + 1, hand_y - 7 - index % 2), fill=color)
        elif aura == "messages":
            for index in range(3): frame(draw, (27 + index, 17 + index * 6, 34 + index, 21 + index * 6), color)
        elif aura == "verify":
            frame(draw, (29, 18, 35, 29), color); draw.point((31, 23), fill=WHITE); draw.point((33, 23), fill=WHITE)
        elif aura == "text":
            for y in (18, 23, 28): safe_line(draw, [(7, y), (11, y)], color); safe_line(draw, [(29, y + 2), (34, y + 2)], color)
        else:
            for radius in (4, 7): draw.arc((hand_x - radius, hand_y - radius, hand_x + radius, hand_y + radius), 210, 320, fill=color)
    elif aura in {"small-hand", "helper-hands", "price-tags"}:
        for x, y in ((7, 33), (32, 28), (10, 43)):
            if aura == "price-tags": frame(draw, (x - 2, y - 2, x + 2, y + 2), GOLD)
            else: safe_line(draw, [(x, y), (x + 2, y - 4), (x + 3, y - 7)], PAPER_DARK, 2)
    elif aura == "scan":
        draw.rectangle((7, chest_y, 33, chest_y + 1), fill=RED)
    elif aura == "time":
        for x in (7, 10, 33): draw.point((x, hand_y), fill=BLUE_LIGHT)
        draw.arc((6, hand_y - 7, 18, hand_y + 5), 250, 70, fill=BLUE)
    elif aura in {"photo-fade", "fade"}:
        for index, x in enumerate((7, 11, 29, 33)):
            color = mix(GRAY, INK, index * 0.2)
            draw.rectangle((x, 21 + index * 5, x + 1, 23 + index * 5), fill=color)
    elif aura == "inward":
        for x0, y0, x1, y1 in ((7, 18, 12, 21), (33, 22, 28, 25), (9, 42, 14, 39)):
            safe_line(draw, [(x0, y0), (x1, y1)], PURPLE)
    elif aura == "debt":
        for x, y in ((7, 13), (31, 19), (8, 36)): safe_line(draw, [(x, y), (x, y + 6)], GRAY_LIGHT)
    elif aura == "pressure":
        for box in ((8, 29, 12, 39), (28, 29, 32, 39)): frame(draw, box, YELLOW)
    elif aura in {"blink", "speed", "blue-tail"}:
        color = PURPLE if aura == "blink" else BLUE_LIGHT
        for y, length in ((18, 5), (28, 8), (38, 4)): safe_line(draw, [(7, y), (7 + length, y)], color)
    elif aura in {"dust", "treadmill"}:
        color = BRASS if aura == "dust" else GREEN
        for x in (7, 11, 29, 33): draw.rectangle((x, 48 + x % 2, x + 1, 49 + x % 2), fill=color)
    elif aura == "laugh":
        for radius in (4, 7, 10): draw.arc((face_x - radius, face_y - radius, face_x + radius, face_y + radius), 20, 160, fill=RED)
    elif aura == "static":
        for x, y in ((6, 9), (33, 14), (8, 25), (31, 34), (9, 44), (28, 7)): draw.rectangle((x, y, x + 2, y + 1), fill=WHITE if (x + y) % 2 else GRAY)
    elif aura in {"glass-star", "condensation", "frost", "cold-breath"}:
        color = BLUE_LIGHT
        for x, y in ((7, 18), (32, 24), (10, 40), (29, 44)):
            draw.point((x, y), fill=color); draw.point((x + 1, y), fill=WHITE)
        if aura == "cold-breath": safe_line(draw, [(face_x + 4, face_y + 3), (face_x + 9, face_y + 2)], WHITE)
    elif aura == "tears":
        for x, y in ((9, 31), (31, 37), (13, 45)): draw.polygon([(x, y), (x - 1, y + 3), (x + 1, y + 3)], fill=BLUE)
    elif aura in {"waveform", "rhythm", "angular-talk"}:
        color = PURPLE if aura == "angular-talk" else BLUE
        points = [(6, 25), (9, 21), (12, 29), (15, 24)]
        safe_line(draw, points, color)
        safe_line(draw, [(25 + (x - 6), y + 4) for x, y in points], color)
    elif aura in {"steam", "warm-steam"}:
        color = WHITE if aura == "steam" else GOLD
        for x in (waist_x - 2, waist_x + 2): safe_line(draw, [(x, waist_y - 6), (x - 1, waist_y - 10), (x, waist_y - 13)], color)
    elif aura == "loop":
        draw.arc((7, 18, 33, 44), 30, 330, fill=GREEN); draw.polygon([(31, 18), (34, 20), (30, 22)], fill=GREEN)
    elif aura in {"hospital", "report"}:
        color = CYAN if aura == "hospital" else RED
        for x, y in ((7, 20), (31, 16), (9, 40), (29, 38)): draw.rectangle((x, y, x + 2, y + 2), outline=color)
    elif aura == "interest":
        for x, y in ((6, 18), (31, 23), (8, 39)):
            draw.point((x, y), fill=GOLD)
            draw.point((x + 3, y + 4), fill=GOLD)
            safe_line(draw, [(x + 3, y), (x, y + 4)], GOLD)
    elif aura in {"warmth", "warm-steam"}:
        for x, y in ((8, 23), (31, 28), (11, 42)): draw.point((x, y), fill=GOLD)
    elif aura == "elevator":
        draw.rectangle((6, 16, 7, 45), fill=BLUE_LIGHT); draw.rectangle((33, 16, 34, 45), fill=BLUE_LIGHT)
    elif aura == "doorway":
        frame(draw, (7, 18, 13, 43), BRASS); draw.rectangle((8, 20, 12, 41), fill=(63, 45, 38, 255))
    elif aura == "alcohol":
        for x, y in ((8, 17), (31, 24), (10, 37)): draw.ellipse((x, y, x + 2, y + 2), fill=AMBER)
    elif aura in {"sleep", "numb"}:
        color = GRAY if aura == "numb" else PURPLE
        for x, y in ((7, 20), (32, 27), (10, 42)): draw.rectangle((x, y, x + 2, y + 1), fill=color)
    elif aura == "smoke":
        for x, y in ((8, 30), (11, 25), (31, 34)): safe_line(draw, [(x, y), (x - 1, y - 3), (x + 1, y - 6)], GRAY)
    elif aura == "overexpose":
        for x, y in ((6, 12), (33, 17), (8, 38), (30, 43)): draw.rectangle((x, y, x + 1, y + 1), fill=WHITE)
    elif aura in {"anonymous", "checks", "eye-ring", "card", "offline"}:
        color = PINK if aura == "anonymous" else GOLD if aura == "checks" else BLUE_LIGHT if aura == "eye-ring" else BLUE if aura == "card" else GRAY
        for x, y in ((7, 18), (32, 21), (9, 39), (30, 44)): frame(draw, (x, y, x + 3, y + 3), color)
    elif aura == "continue":
        draw.rectangle((chest_x - 1, chest_y - 9, chest_x + 1, chest_y - 5), fill=GREEN); draw.point((chest_x + 2, chest_y - 5), fill=WHITE)
    elif aura == "price-tags":
        pass


def render_projectile(rule: VisualRule, accent: tuple[int, int, int, int]) -> Image.Image:
    image = blank((32, 16))
    draw = ImageDraw.Draw(image)
    dark = mix(accent, INK, 0.45)
    light = mix(accent, WHITE, 0.45)
    cx, cy = 23, 8

    if rule.trail not in {"none", "pause"}:
        trail_color = mix(accent, INK, 0.2)
        if rule.trail in {"broken", "glitch", "lag", "offline", "isolated"}:
            for x in (3, 8, 14): draw.rectangle((x, cy - (x % 2), x + 2, cy), fill=trail_color)
        elif rule.trail in {"wave", "laugh", "beat", "zigzag"}:
            safe_line(draw, [(2, cy), (6, cy - 2), (10, cy + 2), (15, cy - 1), (19, cy)], trail_color)
        elif rule.trail in {"paper", "fade", "text", "card"}:
            for x, y in ((3, 6), (8, 9), (13, 5), (18, 8)): draw.rectangle((x, y, x + 2, y + 1), fill=trail_color)
        elif rule.trail in {"rain", "tear", "steam", "smoke", "powder", "powder-white", "frost"}:
            for x, y in ((4, 7), (9, 10), (14, 6), (18, 9)): draw.point((x, y), fill=trail_color)
        elif rule.trail in {"chain", "checks", "barcode", "interest", "blue-two", "follower"}:
            for x in range(3, 20, 4): frame(draw, (x, cy - 1, x + 2, cy + 1), trail_color)
        else:
            safe_line(draw, [(2, cy), (19, cy)], trail_color, 2)

    shape = rule.projectile
    if shape in {"breath", "small-core", "thin-core", "runner-core", "blue-core", "pet-copy"}:
        radius = 2 if shape in {"small-core", "thin-core", "pet-copy"} else 3
        draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=dark)
        draw.ellipse((cx - radius + 1, cy - radius + 1, cx + radius - 1, cy + radius - 1), fill=accent)
    elif shape in {"button", "coin-ring", "marble", "clock", "dark-ring", "closed-eye"}:
        frame(draw, (cx - 4, cy - 4, cx + 4, cy + 4), dark)
        draw.ellipse((cx - 3, cy - 3, cx + 3, cy + 3), fill=accent)
        if shape == "button":
            for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1)): draw.point((cx + dx, cy + dy), fill=INK)
        elif shape == "clock": safe_line(draw, [(cx, cy), (cx, cy - 2), (cx + 2, cy)], WHITE)
        elif shape == "marble": draw.point((cx - 1, cy - 1), fill=WHITE)
        elif shape == "closed-eye": safe_line(draw, [(cx - 3, cy), (cx, cy + 2), (cx + 3, cy)], INK)
        elif shape == "dark-ring": draw.ellipse((cx - 2, cy - 2, cx + 2, cy + 2), fill=INK)
    elif shape in {"wedge", "tie-tip", "shuttle", "needle", "blade", "spear"}:
        width = 2 if shape in {"needle", "blade"} else 4
        draw.polygon([(cx - 6, cy - width), (cx + 5, cy), (cx - 6, cy + width)], fill=dark)
        draw.polygon([(cx - 4, cy - max(1, width - 1)), (cx + 3, cy), (cx - 4, cy + max(1, width - 1))], fill=accent)
        if shape in {"blade", "spear"}: safe_line(draw, [(cx - 3, cy - 1), (cx + 2, cy - 1)], WHITE)
    elif shape in {"page", "page-large", "envelope", "photo", "split-page", "report", "card-core", "serial"}:
        w = 10 if shape == "page-large" else 8
        draw.rectangle((cx - w // 2, cy - 4, cx + w // 2, cy + 4), fill=dark)
        draw.rectangle((cx - w // 2 + 1, cy - 3, cx + w // 2 - 1, cy + 3), fill=accent)
        if shape == "envelope": safe_line(draw, [(cx - 3, cy - 2), (cx, cy + 1), (cx + 3, cy - 2)], PAPER_DARK)
        elif shape == "split-page": safe_line(draw, [(cx, cy - 3), (cx - 1, cy), (cx + 1, cy + 3)], RED)
        elif shape in {"report", "serial"}:
            for x in range(cx - 3, cx + 4, 2): draw.rectangle((x, cy - 2, x, cy + 2), fill=INK)
    elif shape in {"stone", "porous", "tablet", "pressure", "cushion", "ice-core", "overexposed"}:
        if shape == "cushion": draw.rounded_rectangle((cx - 6, cy - 3, cx + 5, cy + 3), radius=2, fill=accent, outline=dark)
        elif shape == "pressure": draw.ellipse((cx - 5, cy - 4, cx + 5, cy + 4), fill=dark); draw.ellipse((cx - 3, cy - 3, cx + 3, cy + 3), fill=accent)
        elif shape == "ice-core":
            draw.polygon([(cx, cy - 5), (cx + 5, cy), (cx + 2, cy + 4), (cx - 4, cy + 3), (cx - 5, cy - 2)], fill=accent)
            draw.point((cx, cy - 3), fill=WHITE)
        else:
            draw.rounded_rectangle((cx - 4, cy - 4, cx + 4, cy + 4), radius=2, fill=accent, outline=dark)
            if shape == "porous":
                for dx, dy in ((-2, -1), (2, 1), (0, 2)): draw.point((cx + dx, cy + dy), fill=INK)
            if shape == "overexposed": frame(draw, (cx - 5, cy - 5, cx + 5, cy + 5), WHITE)
    elif shape in {"glitch", "static", "layered"}:
        for dx, dy, color in ((-3, -2, PINK), (0, 0, accent), (3, 2, CYAN)):
            draw.rectangle((cx + dx - 3, cy + dy - 2, cx + dx + 3, cy + dy + 2), fill=color)
            draw.rectangle((cx + dx - 1, cy + dy - 1, cx + dx + 1, cy + dy + 1), fill=INK)
    elif shape in {"sound-ring", "voice-ring", "wave-five", "beat-bars", "three-dots"}:
        if shape == "three-dots":
            for x in (cx - 4, cx, cx + 4): draw.rectangle((x - 1, cy - 1, x + 1, cy + 1), fill=accent)
        elif shape == "beat-bars":
            for index, height in enumerate((3, 6, 4, 7)): draw.rectangle((cx - 6 + index * 4, cy - height // 2, cx - 5 + index * 4, cy + height // 2), fill=accent)
        else:
            for radius in ((2, 4, 6) if shape == "wave-five" else (3, 6)):
                draw.arc((cx - radius, cy - radius, cx + radius, cy + radius), 220, 140, fill=accent)
    elif shape in {"tooth", "bone-chain"}:
        if shape == "tooth": draw.polygon([(cx - 4, cy - 4), (cx + 4, cy - 4), (cx + 2, cy + 4), (cx, cy + 1), (cx - 2, cy + 4)], fill=WHITE)
        else:
            for x in (cx - 6, cx - 2, cx + 2, cx + 6):
                draw.rectangle((x - 1, cy - 2, x + 1, cy + 2), fill=WHITE); draw.point((x - 2, cy), fill=PAPER_DARK); draw.point((x + 2, cy), fill=PAPER_DARK)
    elif shape in {"barcode", "receipt", "text-core", "six-block", "check-guard"}:
        draw.rectangle((cx - 5, cy - 4, cx + 5, cy + 4), fill=accent)
        if shape == "barcode":
            for x in range(cx - 4, cx + 5, 2): draw.rectangle((x, cy - 3, x, cy + 3), fill=INK)
        elif shape == "six-block":
            frame(draw, (cx - 2, cy - 2, cx + 2, cy + 2), INK); draw.point((cx + 1, cy), fill=INK)
        elif shape == "check-guard":
            safe_line(draw, [(cx - 4, cy), (cx - 1, cy + 3), (cx + 4, cy - 3)], WHITE, 2)
        else:
            for y in (cy - 2, cy, cy + 2): safe_line(draw, [(cx - 3, y), (cx + 3, y)], INK)
    elif shape in {"keyhole", "key-return", "gate-core"}:
        draw.ellipse((cx - 2, cy - 4, cx + 2, cy), fill=accent)
        draw.polygon([(cx - 1, cy), (cx + 1, cy), (cx + 2, cy + 4), (cx - 2, cy + 4)], fill=accent)
        if shape == "gate-core":
            draw.rectangle((cx - 6, cy - 5, cx - 5, cy + 5), fill=BLUE_LIGHT); draw.rectangle((cx + 5, cy - 5, cx + 6, cy + 5), fill=BLUE_LIGHT)
    elif shape in {"drop", "tear", "steam-core", "amber", "smoke-core", "hair-core"}:
        color = BLUE if shape in {"drop", "tear"} else AMBER if shape == "amber" else GRAY if shape == "smoke-core" else accent
        draw.polygon([(cx, cy - 5), (cx - 4, cy + 1), (cx - 2, cy + 4), (cx + 2, cy + 4), (cx + 4, cy + 1)], fill=color)
        if shape == "hair-core": safe_line(draw, [(cx - 6, cy - 3), (cx + 5, cy + 3)], INK)
    elif shape in {"void", "blink", "isolated"}:
        if shape == "void":
            frame(draw, (cx - 5, cy - 5, cx + 5, cy + 5), PURPLE); draw.rectangle((cx - 3, cy - 3, cx + 3, cy + 3), fill=INK)
        elif shape == "blink":
            draw.rectangle((cx - 6, cy - 1, cx + 5, cy + 1), fill=PURPLE); draw.rectangle((cx - 1, cy - 4, cx + 1, cy + 4), fill=WHITE)
        else:
            draw.ellipse((cx - 3, cy - 3, cx + 3, cy + 3), fill=accent); draw.rectangle((cx - 8, cy - 1, cx - 6, cy + 1), fill=accent)
    elif shape in {"loop", "chain", "debt-core", "plug", "bowl-shield", "shield-bubble", "follower", "coin-tooth", "pink-tooth", "extra-core"}:
        draw.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill=accent, outline=dark)
        if shape == "loop": draw.arc((cx - 6, cy - 6, cx + 6, cy + 6), 30, 330, fill=GREEN)
        elif shape in {"chain", "debt-core"}:
            frame(draw, (cx - 7, cy - 2, cx - 3, cy + 2), BRASS); frame(draw, (cx + 3, cy - 2, cx + 7, cy + 2), BRASS)
        elif shape == "plug": draw.rectangle((cx + 4, cy - 2, cx + 6, cy - 1), fill=INK); draw.rectangle((cx + 4, cy + 1, cx + 6, cy + 2), fill=INK)
        elif shape in {"bowl-shield", "shield-bubble"}: draw.arc((cx - 6, cy - 6, cx + 6, cy + 6), 180, 360, fill=WHITE, width=2)
        elif shape == "follower": draw.ellipse((cx - 8, cy - 2, cx - 4, cy + 2), fill=light)
        elif shape in {"coin-tooth", "pink-tooth"}:
            color = GOLD if shape == "coin-tooth" else PINK
            for angle in range(0, 8, 2): draw.point((cx - 5 + angle, cy - 4 if angle % 4 == 0 else cy + 4), fill=color)
        elif shape == "extra-core": draw.ellipse((cx - 2, cy - 2, cx + 2, cy + 2), fill=WHITE)
    else:
        draw.ellipse((cx - 3, cy - 3, cx + 3, cy + 3), fill=accent, outline=dark)

    if rule.material in {"wood", "stone", "paper", "glass", "water", "bone", "ice", "text", "noise", "cloth"}:
        detail = {"wood": BRASS, "stone": GRAY_LIGHT, "paper": PAPER, "glass": WHITE, "water": BLUE_LIGHT, "bone": PAPER_DARK, "ice": WHITE, "text": INK, "noise": WHITE, "cloth": WORN}[rule.material]
        draw.point((cx - 1, cy - 2), fill=detail); draw.point((cx + 2, cy + 1), fill=detail)
    return image


def render_impact(rule: VisualRule, accent: tuple[int, int, int, int]) -> Image.Image:
    image = blank((24, 24))
    draw = ImageDraw.Draw(image)
    cx, cy = 12, 12
    dark = mix(accent, INK, 0.5)
    motif = rule.impact
    if any(key in motif for key in ("crack", "cut", "break", "shatter", "tear", "snap", "splinter")):
        for points in ([(cx, cy), (4, 5)], [(cx, cy), (19, 6)], [(cx, cy), (17, 20)], [(cx, cy), (6, 18)]): safe_line(draw, points, accent, 2)
        draw.rectangle((cx - 1, cy - 1, cx + 1, cy + 1), fill=WHITE)
    elif any(key in motif for key in ("ring", "pulse", "call", "sound", "release", "push")):
        for radius in (3, 7, 10): draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=accent)
    elif any(key in motif for key in ("flash", "star", "over", "camera")):
        safe_line(draw, [(2, cy), (22, cy)], WHITE, 2); safe_line(draw, [(cx, 2), (cx, 22)], WHITE, 2)
        safe_line(draw, [(5, 5), (19, 19)], accent); safe_line(draw, [(19, 5), (5, 19)], accent)
    elif any(key in motif for key in ("void", "implosion", "collapse", "missing")):
        frame(draw, (3, 3, 21, 21), PURPLE); draw.ellipse((7, 7, 17, 17), fill=INK); draw.rectangle((11, 1, 13, 5), fill=accent)
    elif any(key in motif for key in ("stain", "wet", "oil", "ash", "dust", "powder")):
        for x, y, r in ((7, 10, 3), (14, 7, 2), (16, 15, 4), (8, 17, 2)): draw.ellipse((x - r, y - r, x + r, y + r), fill=accent)
    elif any(key in motif for key in ("door", "bolt", "verify", "access")):
        frame(draw, (6, 3, 18, 21), accent, 2); draw.point((15, 12), fill=WHITE)
        if "access" in motif or "verify" in motif: safe_line(draw, [(5, 4), (19, 20)], RED, 2)
    elif any(key in motif for key in ("barcode", "scan", "report", "stamp", "fee", "coin", "gold")):
        for x in range(4, 21, 3): draw.rectangle((x, 5, x + 1, 19), fill=accent)
        draw.rectangle((3, 11, 21, 13), fill=WHITE)
    elif any(key in motif for key in ("glitch", "reassemble", "offline", "lost", "crash", "frame")):
        for x, y, color in ((3, 5, PINK), (9, 3, WHITE), (15, 8, CYAN), (5, 15, accent), (17, 17, GRAY)):
            draw.rectangle((x, y, x + 4, y + 2), fill=color)
    elif any(key in motif for key in ("tooth", "bone", "ceramic")):
        for x, y in ((12, 4), (5, 11), (19, 12), (10, 18), (15, 20)):
            draw.polygon([(x, y - 2), (x + 2, y), (x, y + 2), (x - 2, y)], fill=WHITE)
    elif any(key in motif for key in ("word", "text", "mute", "laugh", "avatar", "continue", "one")):
        frame(draw, (3, 6, 21, 17), accent); draw.polygon([(8, 17), (12, 21), (13, 17)], fill=accent)
        for x in (8, 12, 16): draw.point((x, 11), fill=WHITE)
    elif any(key in motif for key in ("ice", "frost")):
        safe_line(draw, [(12, 2), (12, 22)], BLUE_LIGHT, 2); safe_line(draw, [(2, 12), (22, 12)], BLUE_LIGHT, 2); safe_line(draw, [(5, 5), (19, 19)], WHITE)
    else:
        for radius in (3, 7, 10): draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=accent)
        draw.point((cx, cy), fill=WHITE)
    return image


def apply_face_glow(body: Image.Image, palette_name: str, direction: str) -> None:
    glow = PALETTES[palette_name].get("glow")
    if glow is None or direction == "back":
        return
    pixels = body.load()
    x_range = range(12, 28) if direction == "front" else range(12, 28)
    for y in range(13, 22):
        for x in x_range:
            if pixels[x, y] in SKIN_COLORS and (x + y) % 3 == 0:
                pixels[x, y] = mix(pixels[x, y], glow, 0.35)


def build_frame(
    source: Image.Image,
    direction: str,
    rule: VisualRule,
) -> tuple[Image.Image, Image.Image, Image.Image, Image.Image, Image.Image]:
    profile = profile_from_key(rule.profile)
    body = warp(source, profile)
    body = apply_posture(body, rule.posture, direction)
    body = recolor_body(body, rule.palette)
    apply_face_glow(body, rule.palette, direction)
    body, cutout = apply_cutout(body, rule.cutout, direction)

    behind = blank()
    draw_shadow(behind, rule.shadow, direction, body)
    front = blank()
    draw_prop(front, rule.prop, direction, profile)
    draw_mark(front, rule.mark, direction, profile)
    draw_aura(front, rule.aura, direction, profile)

    composite = blank()
    composite.alpha_composite(behind)
    composite.alpha_composite(body)
    composite.alpha_composite(front)
    return body, behind, front, cutout, composite


def load_font(size: int, mono: bool = False) -> ImageFont.ImageFont:
    candidates = (
        [Path("/System/Library/Fonts/SFNSMono.ttf"), Path("/System/Library/Fonts/Menlo.ttc")]
        if mono
        else [Path("/System/Library/Fonts/Hiragino Sans GB.ttc"), Path("/System/Library/Fonts/STHeiti Medium.ttc")]
    )
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def load_icon(item_id: str) -> tuple[Image.Image, str]:
    ac_path = AC_ICON_DIR / f"{item_id}.png"
    if ac_path.exists():
        return Image.open(ac_path).convert("RGBA"), "approved-ac"
    icon_path = ICON_DIR / f"{item_id}.png"
    if icon_path.exists():
        icon = Image.open(icon_path).convert("RGBA")
        return icon.resize((64, 64), Image.Resampling.NEAREST), "deterministic-draft"
    raise FileNotFoundError(item_id)


def fit_text(draw: ImageDraw.ImageDraw, text: str, box_width: int, size: int, mono: bool = False) -> ImageFont.ImageFont:
    current = size
    while current >= 10:
        font = load_font(current, mono=mono)
        if draw.textbbox((0, 0), text, font=font)[2] <= box_width:
            return font
        current -= 1
    return load_font(10, mono=mono)


def make_card(
    item: dict[str, object],
    spec: dict[str, object],
    rule: VisualRule,
    frames: dict[str, Image.Image],
    projectile: Image.Image,
    impact: Image.Image,
) -> tuple[Image.Image, str]:
    width, height = 760, 360
    result = Image.new("RGB", (width, height), (19, 18, 24))
    draw = ImageDraw.Draw(result)
    accent = rgba(str(item["color"]))
    draw.rectangle((0, 0, 7, height), fill=accent[:3])
    draw.line((0, 55, width, 55), fill=(61, 54, 66), width=1)
    draw.line((120, 55, 120, height), fill=(61, 54, 66), width=1)

    title = f"{int(spec['index']):02d}  {spec['name']}"
    draw.text((18, 13), title, fill=(224, 215, 198), font=fit_text(draw, title, 500, 22))
    draw.text((545, 18), str(spec["id"]), fill=(140, 133, 146), font=load_font(13, mono=True))
    meta = f"{rule.profile} / {rule.posture}"
    draw.text((545, 36), meta, fill=(181, 160, 121), font=fit_text(draw, meta, 200, 12, mono=True))

    icon, icon_grade = load_icon(str(item["id"]))
    icon_preview = icon.resize((96, 96), Image.Resampling.NEAREST)
    icon_panel = Image.new("RGBA", (96, 96), (43, 38, 48, 255))
    icon_panel.alpha_composite(icon_preview)
    result.paste(icon_panel.convert("RGB"), (16, 71))
    draw.text((18, 174), "PICKUP", fill=(151, 142, 154), font=load_font(11, mono=True))
    draw.text((18, 190), icon_grade, fill=(112, 106, 119), font=fit_text(draw, icon_grade, 96, 10, mono=True))

    hero_scale = 3
    cell_w = FRAME_W * hero_scale
    cell_h = FRAME_H * hero_scale
    start_x = 132
    for index, direction in enumerate(DIRECTIONS):
        panel = Image.new("RGBA", (FRAME_W, FRAME_H), (43, 38, 48, 255))
        panel.alpha_composite(frames[direction])
        enlarged = panel.resize((cell_w, cell_h), Image.Resampling.NEAREST).convert("RGB")
        x = start_x + index * cell_w
        result.paste(enlarged, (x, 71))
        draw.text((x + 4, 244), direction.upper(), fill=(145, 136, 150), font=load_font(10, mono=True))
        baseline = 71 + (ROOT_Y + 1) * hero_scale
        draw.line((x, baseline, x + cell_w - 1, baseline), fill=(68, 61, 72), width=1)

    px = 624
    draw.text((px, 75), "BREATH", fill=(151, 142, 154), font=load_font(10, mono=True))
    proj = projectile.resize((112, 56), Image.Resampling.NEAREST)
    proj_panel = Image.new("RGBA", (112, 56), (43, 38, 48, 255)); proj_panel.alpha_composite(proj)
    result.paste(proj_panel.convert("RGB"), (px, 92))
    draw.text((px, 160), "IMPACT", fill=(151, 142, 154), font=load_font(10, mono=True))
    vfx = impact.resize((96, 96), Image.Resampling.NEAREST)
    vfx_panel = Image.new("RGBA", (96, 96), (43, 38, 48, 255)); vfx_panel.alpha_composite(vfx)
    result.paste(vfx_panel.convert("RGB"), (px + 8, 177))

    categories = " / ".join(str(value) for value in spec["changeCategories"])
    draw.text((18, 292), categories, fill=(188, 170, 134), font=fit_text(draw, categories, 720, 15))
    hero_text = str(spec["heroAppearanceChange"])
    projectile_text = str(spec["projectileOrImpactChange"])
    hero_short = hero_text[:60] + ("..." if len(hero_text) > 60 else "")
    projectile_short = projectile_text[:60] + ("..." if len(projectile_text) > 60 else "")
    draw.text((18, 317), hero_short, fill=(170, 164, 171), font=fit_text(draw, hero_short, 720, 13))
    draw.text((18, 337), projectile_short, fill=(132, 151, 158), font=fit_text(draw, projectile_short, 720, 13))
    return result, icon_grade


def make_atlas(rows: list[dict[str, Image.Image]], key: str, cell_w: int, cell_h: int, cols: int = 4) -> Image.Image:
    atlas = blank((cell_w * cols, cell_h * len(rows)))
    for row, record in enumerate(rows):
        if cols == 4:
            for column, direction in enumerate(DIRECTIONS):
                atlas.alpha_composite(record[direction], (column * cell_w, row * cell_h))
        else:
            atlas.alpha_composite(record[key], (0, row * cell_h))
    return atlas


def alpha_is_binary(image: Image.Image) -> bool:
    return all(alpha in {0, 255} for *_, alpha in image.getdata())


def touches_edge(image: Image.Image) -> bool:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return False
    return bbox[0] == 0 or bbox[1] == 0 or bbox[2] == image.width or bbox[3] == image.height


def opaque_colors(image: Image.Image) -> int:
    return len({pixel for pixel in image.getdata() if pixel[3]})


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    CARD_DIR.mkdir(parents=True, exist_ok=True)

    source_items = parse_source_items()
    source_ids = [str(item["id"]) for item in source_items]
    spec_root = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    specs = spec_root["items"]
    spec_ids = [str(item["id"]) for item in specs]
    if source_ids != spec_ids:
        raise AssertionError("semantic spec order/IDs differ from src/relics.ts")
    if source_ids != list(RULES):
        missing = sorted(set(source_ids) - set(RULES))
        extra = sorted(set(RULES) - set(source_ids))
        raise AssertionError(f"visual rules do not exactly cover source IDs: missing={missing} extra={extra}")
    if tuple(spec_root["directionKeys"]) != DIRECTIONS:
        raise AssertionError(f"direction order mismatch: {spec_root['directionKeys']} != {DIRECTIONS}")
    for spec in specs:
        visibility = spec["directionVisibility"]
        if tuple(visibility) != DIRECTIONS or any(not visibility[d] for d in DIRECTIONS):
            raise AssertionError(f"incomplete direction visibility for {spec['id']}")

    profile_manifest = json.loads(PROFILE_MANIFEST.read_text(encoding="utf-8"))
    approved_profiles = set(profile_manifest["profile_order"])
    if any(rule.profile not in approved_profiles for rule in RULES.values()):
        raise AssertionError("a rule references an unapproved profile")

    sources = {direction: Image.open(SOURCE_HERO / f"{direction}.png").convert("RGBA") for direction in DIRECTIONS}
    body_rows: list[dict[str, Image.Image]] = []
    behind_rows: list[dict[str, Image.Image]] = []
    front_rows: list[dict[str, Image.Image]] = []
    cutout_rows: list[dict[str, Image.Image]] = []
    composite_rows: list[dict[str, Image.Image]] = []
    projectile_rows: list[Image.Image] = []
    impact_rows: list[Image.Image] = []
    cards: list[Image.Image] = []
    validations: dict[str, object] = {}
    icon_grades: dict[str, str] = {}
    fingerprints: dict[str, str] = {}

    for item, spec in zip(source_items, specs):
        item_id = str(item["id"])
        rule = RULES[item_id]
        accent = rgba(str(item["color"]))
        body_frames: dict[str, Image.Image] = {}
        behind_frames: dict[str, Image.Image] = {}
        front_frames: dict[str, Image.Image] = {}
        cutout_frames: dict[str, Image.Image] = {}
        composites: dict[str, Image.Image] = {}
        direction_validation: dict[str, object] = {}
        for direction in DIRECTIONS:
            body, behind, front, cutout, composite = build_frame(sources[direction], direction, rule)
            for name, image in (("body", body), ("behind", behind), ("front", front), ("cutout", cutout), ("composite", composite)):
                if not alpha_is_binary(image):
                    raise AssertionError(f"partial alpha: {item_id}/{direction}/{name}")
            body_bbox = body.getchannel("A").getbbox()
            if body_bbox is None or body_bbox[3] - 1 != ROOT_Y:
                raise AssertionError(f"root drift: {item_id}/{direction} {body_bbox}")
            if touches_edge(composite):
                raise AssertionError(f"frame clipping: {item_id}/{direction} {composite.getchannel('A').getbbox()}")
            if opaque_colors(composite) > 32:
                raise AssertionError(f"palette budget exceeded: {item_id}/{direction} {opaque_colors(composite)}")
            body_frames[direction] = body
            behind_frames[direction] = behind
            front_frames[direction] = front
            cutout_frames[direction] = cutout
            composites[direction] = composite
            direction_validation[direction] = {
                "body_bbox": list(body_bbox),
                "body_root": [ROOT_X, ROOT_Y],
                "composite_bbox": list(composite.getchannel("A").getbbox() or (0, 0, 0, 0)),
                "binary_alpha": True,
                "edge_clear": True,
                "opaque_colors": opaque_colors(composite),
                "semantic_visibility": spec["directionVisibility"][direction],
            }

        projectile = render_projectile(rule, accent)
        impact = render_impact(rule, accent)
        if not alpha_is_binary(projectile) or not alpha_is_binary(impact):
            raise AssertionError(f"partial projectile/VFX alpha: {item_id}")
        card, icon_grade = make_card(item, spec, rule, composites, projectile, impact)
        card_path = CARD_DIR / f"{int(spec['index']):02d}-{item_id}.png"
        card.save(card_path, optimize=True)

        body_rows.append(body_frames)
        behind_rows.append(behind_frames)
        front_rows.append(front_frames)
        cutout_rows.append(cutout_frames)
        composite_rows.append(composites)
        projectile_rows.append(projectile)
        impact_rows.append(impact)
        cards.append(card)
        icon_grades[item_id] = icon_grade
        fingerprint = hashlib.sha256(
            b"".join(composites[direction].tobytes() for direction in DIRECTIONS)
            + projectile.tobytes() + impact.tobytes()
        ).hexdigest()
        fingerprints[item_id] = fingerprint
        validations[item_id] = {
            "rule": asdict(rule),
            "directions": direction_validation,
            "pickup_icon_grade": icon_grade,
            "projectile_bbox": list(projectile.getchannel("A").getbbox() or (0, 0, 0, 0)),
            "impact_bbox": list(impact.getchannel("A").getbbox() or (0, 0, 0, 0)),
            "fingerprint": fingerprint,
        }

    if len(set(fingerprints.values())) != len(source_ids):
        duplicates: dict[str, list[str]] = {}
        for item_id, fingerprint in fingerprints.items(): duplicates.setdefault(fingerprint, []).append(item_id)
        raise AssertionError(f"duplicate manifestations: {[ids for ids in duplicates.values() if len(ids) > 1]}")

    # Hard semantic gates for the representative items called out in review.
    semantic_gates = {
        "small-uniform": RULES["small-uniform"].profile.endswith("slim"),
        "takeout-3am": RULES["takeout-3am"].profile.endswith("soft"),
        "held-pee": RULES["held-pee"].profile.endswith("soft") and RULES["held-pee"].posture == "compressed",
        "stone-schoolbag": RULES["stone-schoolbag"].posture == "hunch",
        "broken-spine": RULES["broken-spine"].posture == "broken",
        "bleach-powder": RULES["bleach-powder"].palette == "blonde",
        "flash-escape": RULES["flash-escape"].shadow == "afterimages" and RULES["flash-escape"].prop == "none",
        "empty-frame": RULES["empty-frame"].cutout == "person-hole" and RULES["empty-frame"].prop == "none",
        "painless-night": RULES["painless-night"].palette == "numb-gray",
        "eyebrow-razor": RULES["eyebrow-razor"].mark == "scar" and RULES["eyebrow-razor"].projectile == "blade",
    }
    if not all(semantic_gates.values()):
        raise AssertionError(f"semantic gates failed: {semantic_gates}")

    artifacts: dict[str, Path] = {}
    for name, rows in (
        ("body-atlas", body_rows),
        ("behind-overlay-atlas", behind_rows),
        ("front-overlay-atlas", front_rows),
        ("cutout-mask-atlas", cutout_rows),
        ("composite-atlas", composite_rows),
    ):
        path = OUTPUT_DIR / f"item-manifestation-{name}.png"
        make_atlas(rows, "", FRAME_W, FRAME_H).save(path, optimize=True)
        artifacts[name] = path

    projectile_atlas = blank((32, 16 * len(source_ids)))
    impact_atlas = blank((24, 24 * len(source_ids)))
    for row, (projectile, impact) in enumerate(zip(projectile_rows, impact_rows)):
        projectile_atlas.alpha_composite(projectile, (0, row * 16))
        impact_atlas.alpha_composite(impact, (0, row * 24))
    projectile_path = OUTPUT_DIR / "item-projectile-atlas.png"
    impact_path = OUTPUT_DIR / "item-impact-vfx-atlas.png"
    projectile_atlas.save(projectile_path, optimize=True)
    impact_atlas.save(impact_path, optimize=True)
    artifacts["projectile-atlas"] = projectile_path
    artifacts["impact-atlas"] = impact_path

    page_paths: list[Path] = []
    cards_per_page = 6
    for page_index in range(0, len(cards), cards_per_page):
        page_cards = cards[page_index:page_index + cards_per_page]
        page = Image.new("RGB", (760 * 2, 360 * 3), (12, 11, 16))
        for local_index, card in enumerate(page_cards):
            page.paste(card, ((local_index % 2) * 760, (local_index // 2) * 360))
        path = OUTPUT_DIR / f"item-manifestation-review-{page_index // cards_per_page + 1:02d}.png"
        page.save(path, optimize=True)
        page_paths.append(path)
        artifacts[f"review-page-{page_index // cards_per_page + 1:02d}"] = path

    # Initial clarity audit: time/state-dependent meanings are marked for
    # special review because a single static frame cannot prove their timing.
    review_flags = {
        "slow-watch": "常态只保留腕表；冻结瞬间允许腕侧短亮点，主体仍需以弹体悬停和解冻齐射验收。",
        "three-day-visible": "静态人物不变化；需以拾取后当前配方三弹绕身三圈、第三圈淡轨、随后径向释放验收。",
        "auto-renew": "闭合扣费环清楚，但阶段扣款语义仍依赖后续动画。",
        "held-elevator": "门轨与伸手姿态可读，重新选敌逻辑只能由弹体示意。",
        "typing-indicator": "头顶三点直接可读，第三点与十二向散射的同步仍需要动效确认。",
        "streak-1847": "勾链可读，闭环/断链两状态需要后续成对帧。",
        "painless-night": "灰化与伤块清楚，延迟伤害回撞需要后续动效确认。",
    }

    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest = {
        "review_only": True,
        "runtime_integration": False,
        "gif_output": False,
        "schema_version": "1.0.0",
        "semantic_source": str(SPEC_PATH.relative_to(REPO)),
        "semantic_source_sha256": sha256(SPEC_PATH),
        "source_items": str(SOURCE_ITEMS.relative_to(REPO)),
        "source_hero": str(SOURCE_HERO.relative_to(REPO)),
        "profile_system": str(PROFILE_MANIFEST.relative_to(REPO)),
        "frame": {"width": FRAME_W, "height": FRAME_H, "root": [ROOT_X, ROOT_Y]},
        "item_count": len(source_ids),
        "direction_order": list(DIRECTIONS),
        "item_order": source_ids,
        "atlas_layout": {"columns": "front/back/left/right", "rows": f"{len(source_ids)} source-order items"},
        "layer_contract": ["behind-overlay", "body-with-cutout", "front-overlay"],
        "cutout_mask_contract": "white pixels delete body pixels before front overlay",
        "projectile_frame": [32, 16],
        "impact_frame": [24, 24],
        "semantic_gates": semantic_gates,
        "validation": {
            "source_spec_rule_ids_exact": True,
            "source_order_exact": True,
            "all_direction_visibility_nonempty": True,
            "binary_alpha_all_outputs": True,
            "fixed_root_all_body_frames": [ROOT_X, ROOT_Y],
            "no_frame_edge_clipping": True,
            "max_composite_palette_colors": 32,
            "unique_manifestation_fingerprints": len(source_ids),
            "items": validations,
        },
        "pickup_icon_status": {
            "approved_ac_count": sum(grade == "approved-ac" for grade in icon_grades.values()),
            "deterministic_draft_count": sum(grade != "approved-ac" for grade in icon_grades.values()),
            "note": "Pickup icon style is independent of manifestation approval; 16 A/C icons are approved-style, remaining icons are composition drafts.",
        },
        "static_clarity_review_flags": review_flags,
        "cards": [str((CARD_DIR / f"{index:02d}-{item_id}.png").relative_to(OUTPUT_DIR)) for index, item_id in enumerate(source_ids, 1)],
        "artifacts": {
            name: {"path": str(path.relative_to(OUTPUT_DIR)), "bytes": path.stat().st_size, "sha256": sha256(path)}
            for name, path in artifacts.items()
        },
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(source_ids)} item manifestations to {OUTPUT_DIR}")
    print(f"cards: {len(cards)}, review pages: {len(page_paths)}, unique fingerprints: {len(set(fingerprints.values()))}")
    print(f"approved A/C pickup icons: {manifest['pickup_icon_status']['approved_ac_count']} / {len(source_ids)}")


if __name__ == "__main__":
    main()
