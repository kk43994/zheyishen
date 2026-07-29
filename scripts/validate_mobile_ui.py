#!/usr/bin/env python3
from pathlib import Path
import re
import sys


PROJECT_DIR = Path(__file__).resolve().parent.parent
GAME_SOURCE = PROJECT_DIR / "src" / "game.ts"
THEME_SOURCE = PROJECT_DIR / "src" / "ui-theme.ts"
STYLE_SOURCE = PROJECT_DIR / "src" / "style.css"
INDEX_SOURCE = PROJECT_DIR / "index.html"
MAIN_SOURCE = PROJECT_DIR / "src" / "main.ts"
ORIGINS_SOURCE = PROJECT_DIR / "src" / "origins.ts"
AI_PROMPTS_SOURCE = PROJECT_DIR / "src" / "ai-prompts.ts"
AUDIO_SOURCE = PROJECT_DIR / "src" / "audio.ts"
AUDIO_PLATFORM_SOURCE = PROJECT_DIR / "src" / "audio-platform.ts"


def fail(message: str) -> None:
    print(f"mobile ui: {message}", file=sys.stderr)
    raise SystemExit(1)


game = GAME_SOURCE.read_text(encoding="utf-8")
theme = THEME_SOURCE.read_text(encoding="utf-8")
style = STYLE_SOURCE.read_text(encoding="utf-8")
index = INDEX_SOURCE.read_text(encoding="utf-8")
main = MAIN_SOURCE.read_text(encoding="utf-8")
origins = ORIGINS_SOURCE.read_text(encoding="utf-8")
ai_prompts = AI_PROMPTS_SOURCE.read_text(encoding="utf-8")
audio = AUDIO_SOURCE.read_text(encoding="utf-8")
audio_platform = AUDIO_PLATFORM_SOURCE.read_text(encoding="utf-8")

# Only inspect canvas font assignments. A broad ``7px`` search also matches
# layout declarations such as ``padding:7px`` and turns harmless spacing
# changes into release blockers.
seven_pixel_font = re.compile(r"(?:ctx\.)?font\s*=\s*[`'\"](?:bold\s+)?7px\b")
for path, source in ((GAME_SOURCE, game), (THEME_SOURCE, theme)):
    match = seven_pixel_font.search(source)
    if match:
        line = source.count("\n", 0, match.start()) + 1
        fail(f"7px canvas text returned at {path.relative_to(PROJECT_DIR)}:{line}")

# “AI生成/正在生成”是互动空间要求的用户可见披露，不再视为工程文案。
# 这里只拦截会暴露内部降级策略、代理路径或认证头的真实实现细节。
for forbidden_copy in ("本地保底", "/api/ai/", "Authorization: Bearer"):
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
for clear_font in ('"PingFang SC"', '"Songti SC"'):
    if clear_font not in theme:
        fail(f"clear parchment UI font missing: {clear_font}")
if "Fusion Pixel" in theme or "Ark Pixel" in theme:
    fail("coarse pixel fonts must not return to the parchment UI layer")
button_start = game.find("private drawBreathActionButton(")
button_end = game.find("private renderTitleLifePath(", button_start)
button_source = game[button_start:button_end] if button_start >= 0 and button_end > button_start else ""
if "drawStampButtonFrame" not in button_source:
    fail("command buttons must use the Image2 red-stamp frame")
if "ctx.fillRect(rect.x, rect.y, rect.width, rect.height)" in button_source:
    fail("red-stamp buttons must keep a transparent interior")

for source_name, source in (("buffered", audio), ("platform", audio_platform)):
    for token in (
        "export type AudioMixChannel = 'effects' | 'ambience' | 'music' | 'voice'",
        "getMixVolume(channel: AudioMixChannel)",
        "setMixVolume(channel: AudioMixChannel, value: number)",
        "zhe-yi-shen:effects-volume",
        "zhe-yi-shen:ambience-volume",
        "zhe-yi-shen:music-volume",
        "zhe-yi-shen:voice-volume",
    ):
        if token not in source:
            fail(f"{source_name} audio runtime missing mix contract: {token}")
for token in (
    "PAUSE_SETTING_AMBIENCE_RECT",
    "PAUSE_SETTING_MUSIC_RECT",
    "PAUSE_SETTING_VOICE_RECT",
    "PAUSE_SETTING_EFFECTS_RECT",
    "this.feedback.getMixVolume('ambience')",
    "this.feedback.getMixVolume('music')",
    "this.feedback.getMixVolume('voice')",
    "this.feedback.getMixVolume('effects')",
    "this.feedback.setMixVolume(channel, next)",
):
    if token not in game:
        fail(f"pause audio mixer missing runtime wiring: {token}")

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

for token in (
    'name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"',
    'name="mobile-web-app-capable" content="yes"',
    'name="apple-mobile-web-app-capable" content="yes"',
    'name="apple-mobile-web-app-status-bar-style" content="black-translucent"',
):
    if token not in index:
        fail(f"mobile fullscreen document contract missing: {token}")
for token in (
    "function installMobileFullscreenIntent(): void",
    "'(max-width: 768px) and (pointer: coarse)'",
    "root.requestFullscreen({ navigationUI: 'hide' })",
    "document.addEventListener('pointerdown', enterFullscreen, true)",
    ".lock?.('portrait')",
    "installMobileFullscreenIntent();",
):
    if token not in main:
        fail(f"mobile first-touch fullscreen contract missing: {token}")

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
# 2026-07-26 用户裁决翻转：桌面鼠标拖动必须能启动摇杆（"移动 bug"报告——
# 评委/桌面预览用鼠标拖动主角不动会被当成坏档）。旧规则"mouse return"作废。
if "if (event.pointerType === 'mouse') return;" in game:
    fail("desktop mouse drag must also drive the joystick (user ruling 2026-07-26)")
if "canvas.dataset.gameState = this.renderGameState()" not in game:
    fail("development builds must expose the runtime snapshot on the game canvas")
if "const FATE_FREE_CANCEL_DELAY = 4" not in game or "cancelFreeResponseWait" not in game:
    fail("free-text fate responses need a short-wait escape back to standard choices")
if "const ORIGIN_LONG_WAIT_SECONDS = 30" not in game:
    fail("birth registration must expose its in-world retry action after 30 seconds")
if "if (this.state !== 'origin' || this.aiOriginState !== 'error') return;" not in game:
    fail("birth registration does not prevent overlapping long-wait retries")
if "this.originRequestId !== requestId" not in game:
    fail("a late birth request can overwrite the page after the player retries")
if "'无法选择', 29" in game:
    fail("birth loading must use in-world waiting copy instead of a fake disabled command")

nickname_wheel_start = origins.find("const NICKNAME_STYLE_WHEEL")
nickname_wheel_end = origins.find("] as const;", nickname_wheel_start)
nickname_wheel = origins[nickname_wheel_start:nickname_wheel_end]
if "动宾短语" in nickname_wheel or "物件名" in nickname_wheel or "网络ID式" in nickname_wheel:
    fail("birth nickname wheel still permits action phrases or non-person labels")
for token in (
    "const nickname = readText(value.nickname, 2, 7)",
    "const BARE_ACTION_NICKNAME",
    "return !BARE_ACTION_NICKNAME.test(nickname) || PERSON_NICKNAME_ENDING.test(nickname)",
    "nickname && isPersonLikeNickname(nickname)",
):
    if token not in origins:
        fail(f"birth nickname runtime contract missing: {token}")
for token in ("2至7字", "喂，___，过来", "数凉席、捡煤核、背课文"):
    if token not in ai_prompts:
        fail(f"birth nickname generation prompt missing: {token}")
if "const ORIGIN_BADGE_RECT" not in game or "const ORIGIN_BADGE_HIT_RECT" not in game:
    fail("battle origin badge needs separate readable and touch target rectangles")
if "pointInRect(p, ORIGIN_BADGE_HIT_RECT)" not in game:
    fail("battle origin badge touch target is not wired to its full hit rectangle")
for token in (
    "const nickname = this.origin.nickname || this.origin.title",
    # 原合同写死 ctx.fillText(nickname, ...)。2026-07-29 外号栏按用户裁决去掉底框、
    # 改用 drawOutlinedText 描边字——可读性是提高了（描边字在任何背景上都读得出），
    # 但写法变了。合同要守的是「外号在这个位置以可读方式画出来」，不是具体调用哪个 API。
    "drawOutlinedText(nickname, x + 39, y + 28",
    "出生外号 · 人生档案",
    "panelWidth = 152",
    "panelY + panelHeight - 26",
    "panelY + panelHeight - 12",
    "action === 'origin-badge-audit'",
    "nickname: '二楼广播站站长'",
    "traits: ['too_sensible', 'soft_hearted']",
):
    if token not in game:
        fail(f"battle origin badge readability contract missing: {token}")

nearest_enemy = re.search(
    r"private nearestEnemy\([^)]*\)[\s\S]*?private hasLivingEnemies",
    game,
)
if not nearest_enemy or ".sort(" in nearest_enemy.group(0):
    fail("nearest-enemy lookup must stay allocation-free and avoid sorting")

print("mobile ui: valid")
