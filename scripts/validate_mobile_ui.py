#!/usr/bin/env python3
from pathlib import Path
import re
import sys


PROJECT_DIR = Path(__file__).resolve().parent.parent
GAME_SOURCE = PROJECT_DIR / "src" / "game.ts"
THEME_SOURCE = PROJECT_DIR / "src" / "ui-theme.ts"
STYLE_SOURCE = PROJECT_DIR / "src" / "style.css"


def fail(message: str) -> None:
    print(f"mobile ui: {message}", file=sys.stderr)
    raise SystemExit(1)


game = GAME_SOURCE.read_text(encoding="utf-8")
theme = THEME_SOURCE.read_text(encoding="utf-8")
style = STYLE_SOURCE.read_text(encoding="utf-8")

seven_pixel_font = re.compile(r"(?<![0-9])(?:bold\s+)?7px")
for path, source in ((GAME_SOURCE, game), (THEME_SOURCE, theme)):
    match = seven_pixel_font.search(source)
    if match:
        line = source.count("\n", 0, match.start()) + 1
        fail(f"7px canvas text returned at {path.relative_to(PROJECT_DIR)}:{line}")

for forbidden_copy in ("AI正在", "AI生成中", "AI实时生成", "本地保底"):
    if forbidden_copy in game:
        fail(f"engineering copy leaked into game UI source: {forbidden_copy}")

required_theme_tokens = (
    "tiny: `8px ${UI_FONT_STACK}`",
    "small: `9px ${UI_FONT_STACK}`",
    "body: `11px ${UI_FONT_STACK}`",
    "label: `bold 10px ${UI_FONT_STACK}`",
)
for token in required_theme_tokens:
    if token not in theme:
        fail(f"missing mobile-readable font token: {token}")

required_style_rules = (
    "430px,",
    "456px,",
    "aspect-ratio: 9 / 16;",
    "image-rendering: pixelated;",
)
for rule in required_style_rules:
    if rule not in style:
        fail(f"missing portrait canvas rule: {rule}")
if re.search(r"@media\s*\(min-width:\s*700px\)[\s\S]*?#app\s*\{\s*width:\s*360px", style):
    fail("desktop media query must not shrink the game back to its logical width")

pause_hit = re.search(
    r"PAUSE_BUTTON_HIT_RECT\s*=\s*\{[^}]*width:\s*(\d+)[^}]*height:\s*(\d+)",
    game,
)
if not pause_hit or min(int(pause_hit.group(1)), int(pause_hit.group(2))) < 44:
    fail("pause button touch target must remain at least 44x44 logical pixels")

joystick_values: dict[str, int] = {}
for name in (
    "JOYSTICK_INPUT_RADIUS",
    "JOYSTICK_KNOB_TRAVEL",
    "JOYSTICK_SAFE_X",
    "JOYSTICK_SAFE_TOP",
    "JOYSTICK_SAFE_BOTTOM",
):
    match = re.search(rf"const {name}\s*=\s*(\d+)", game)
    if not match:
        fail(f"missing joystick geometry token: {name}")
    joystick_values[name] = int(match.group(1))

if joystick_values["JOYSTICK_INPUT_RADIUS"] <= joystick_values["JOYSTICK_KNOB_TRAVEL"]:
    fail("joystick input radius must exceed visual knob travel")
if joystick_values["JOYSTICK_SAFE_X"] < 38 or joystick_values["JOYSTICK_SAFE_TOP"] < 98:
    fail("joystick base can overlap a screen edge or the top HUD")
if joystick_values["JOYSTICK_SAFE_BOTTOM"] + 38 > 594:
    fail("joystick base can overlap the bottom breath panel")
if "this.updateJoystickInput(p.x, p.y)" not in game or "JOYSTICK_INPUT_RADIUS / distance" not in game:
    fail("joystick input must keep circular clamping")
if "if (event.pointerType === 'mouse') return;" not in game:
    fail("desktop mouse input must not activate the mobile joystick")
if "canvas.dataset.gameState = this.renderGameState()" not in game:
    fail("development builds must expose the runtime snapshot on the game canvas")
if "const FATE_FREE_CANCEL_DELAY = 4" not in game or "cancelFreeResponseWait" not in game:
    fail("free-text fate responses need a short-wait escape back to standard choices")

nearest_enemy = re.search(
    r"private nearestEnemy\([^)]*\)[\s\S]*?private hasLivingEnemies",
    game,
)
if not nearest_enemy or ".sort(" in nearest_enemy.group(0):
    fail("nearest-enemy lookup must stay allocation-free and avoid sorting")

print("mobile ui: valid")
