#!/usr/bin/env python3
"""Validate promoted boss skill atlases and runtime wiring."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
TASK_DIR = ROOT / "scripts/image2/boss-skills-v1"
FORMAL_DIR = ROOT / "src/assets/enemies/boss-skills-v1"


def fail(message: str) -> None:
    raise AssertionError(message)


def first_frame_shape(path: Path, frame: int) -> tuple[int, int, int]:
    image = Image.open(path).convert("RGBA").crop((0, 0, frame, frame))
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        fail(f"empty identity frame: {path.relative_to(ROOT)}")
    opaque = sum(value > 0 for value in alpha.getdata())
    return opaque, bbox[2] - bbox[0], bbox[3] - bbox[1]


def main() -> None:
    source = json.loads((TASK_DIR / "manifest.json").read_text(encoding="utf-8"))
    runtime = json.loads((FORMAL_DIR / "manifest.json").read_text(encoding="utf-8"))
    game = (ROOT / "src/game.ts").read_text(encoding="utf-8")
    renderer = (ROOT / "src/boss-skill-pixel.ts").read_text(encoding="utf-8")
    enemy_renderer = (ROOT / "src/enemy-pixel.ts").read_text(encoding="utf-8")
    wiki = (ROOT / "docs/这一身百科.html").read_text(encoding="utf-8")

    if source.get("status") != "approved-and-promoted":
        fail("boss skill source manifest is not approved")
    if len(source["assets"]) != 16:
        fail(f"expected 16 boss skill atlases, got {len(source['assets'])}")

    skill_ids: list[str] = []
    for asset in source["assets"]:
        asset_id = asset["id"]
        frame = int(asset["frame"])
        skills = asset["skills"]
        path = FORMAL_DIR / f"{asset_id}.png"
        if not path.is_file():
            fail(f"missing promoted atlas: {path.relative_to(ROOT)}")
        image = Image.open(path).convert("RGBA")
        expected_size = (frame * 4, frame * len(skills))
        if image.size != expected_size:
            fail(f"wrong atlas size for {asset_id}: {image.size} != {expected_size}")
        if set(image.getchannel("A").getdata()) - {0, 255}:
            fail(f"atlas contains partial alpha: {asset_id}")
        for row, skill in enumerate(skills):
            skill_id = skill["id"]
            sequence = skill["sequence"]
            if len(sequence) != 4 or any(not isinstance(index, int) or index < 0 or index > 3 for index in sequence):
                fail(f"invalid four-frame pose sequence: {skill_id} {sequence}")
            onset_pose = skill.get("onsetPose")
            if onset_pose is not None:
                if not isinstance(onset_pose, int) or onset_pose < 0 or onset_pose > 3:
                    fail(f"invalid immediate-onset pose: {skill_id} {onset_pose}")
                if sequence[0] != onset_pose:
                    fail(f"immediate effect starts on the wrong pose: {skill_id} {sequence[0]} != {onset_pose}")
            if not skill.get("loop", False) and len(set(sequence[:3])) < 2:
                fail(f"skill postpones its only pose change to the final quarter: {skill_id}")
            skill_ids.append(skill_id)
            frames: list[bytes] = []
            for column in range(4):
                cell = image.crop((column * frame, row * frame, (column + 1) * frame, (row + 1) * frame))
                bbox = cell.getchannel("A").getbbox()
                if bbox is None:
                    fail(f"empty skill frame: {skill_id}:{column}")
                if bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= frame or bbox[3] >= frame:
                    fail(f"skill frame touches edge: {skill_id}:{column} {bbox}")
                frames.append(cell.tobytes())
            if len(set(frames)) < 2:
                fail(f"skill has no visible pose change: {skill_id}")
            if not skill.get("loop", False) and len(set(frames[:3])) < 2:
                fail(f"skill has no visible pose change before the final quarter: {skill_id}")
            if f"'{skill_id}'" not in game:
                fail(f"skill is not triggered by runtime: {skill_id}")
            expected_mapping = f"'{skill_id}': {{ asset: '{asset_id}', row: {row}"
            if expected_mapping not in renderer:
                fail(f"skill renderer mapping drift: {skill_id} should use {asset_id} row {row}")

        runtime_asset = runtime["assets"].get(asset_id)
        if runtime_asset != {"frame": frame, "rows": len(skills), "display": int(asset["display"])}:
            fail(f"runtime manifest drift for {asset_id}")
        expected_asset = f"'{asset_id}': {{ frame: {frame}, rows: {len(skills)}, display: {int(asset['display'])},"
        if expected_asset not in renderer:
            fail(f"renderer asset spec drift for {asset_id}")

    if len(skill_ids) != 41 or len(set(skill_ids)) != 41:
        fail(f"expected 41 unique skills, got {len(skill_ids)} / {len(set(skill_ids))} unique")
    if set(runtime["skills"]) != set(skill_ids):
        fail("runtime skill manifest does not match source manifest")
    father_p2 = runtime["assets"]["silent-father-p2-skills"]
    if int(father_p2["display"]) < 96:
        fail("silent father phase two has regressed to minion scale")

    continuity_contracts = {
        "closet-dark-skills": ("closet-dark", 128),
        "closet-dark-extra-skills": ("closet-dark", 128),
        "silent-father-p1-skills": ("silent-father", 144),
        "silent-father-p2-skills": ("silent-father-p2", 96),
        "praise-chair-p1-skills": ("praise-chair-p1", 128),
        "praise-chair-p2-skills": ("praise-chair-p2", 192),
        "ringing-phone-p1-skills": ("ringing-phone-p1", 128),
        "ringing-phone-p2-skills": ("ringing-phone-p2", 128),
        "debt-collector-skills": ("debt-collector", 128),
        "lamp-keeper-skills": ("lamp-keeper", 160),
        "coat-rack-skills": ("coat-rack", 96),
        "uniform-answer-skills": ("uniform-answer-hd", 112),
        "last-bus-skills": ("last-bus-hd", 144),
        "wet-shoes-skills": ("wet-shoes", 72),
        "whose-box-skills": ("whose-box", 80),
        "revolving-lantern-skills": ("revolving-lantern", 96),
    }
    for skill_asset, (base_asset, display) in continuity_contracts.items():
        if int(runtime["assets"][skill_asset]["display"]) != display:
            fail(f"skill display drift for {skill_asset}: expected {display}")
        if f"'{base_asset}': {display}" not in enemy_renderer:
            fail(f"base display drift for {base_asset}: expected {display}")

    source_assets = {asset["id"]: asset for asset in source["assets"]}
    identity_contracts = {
        "whose-box-skills": {
            "base": ROOT / "src/assets/enemies/whose-box.png",
            "prompt": TASK_DIR / "prompts/whose-box-skills.txt",
            "prompt_tokens": ("five-spoke metal base and wheels", "box without chair"),
        },
        "revolving-lantern-skills": {
            "base": ROOT / "src/assets/enemies/revolving-lantern.png",
            "prompt": TASK_DIR / "prompts/revolving-lantern-skills.txt",
            "prompt_tokens": ("black running-horse cutout band", "must not appear in this sprite sheet"),
        },
    }
    for asset_id, contract in identity_contracts.items():
        if source_assets[asset_id].get("version") != "v2":
            fail(f"{asset_id} must remain on the continuity-corrected Image2 v2 source")
        prompt = contract["prompt"].read_text(encoding="utf-8")
        for token in contract["prompt_tokens"]:
            if token not in prompt:
                fail(f"{asset_id} prompt lost identity constraint: {token}")
        base_area, base_width, base_height = first_frame_shape(contract["base"], 48)
        skill_area, skill_width, skill_height = first_frame_shape(FORMAL_DIR / f"{asset_id}.png", 48)
        ratios = {
            "opaque area": skill_area / base_area,
            "silhouette width": skill_width / base_width,
            "silhouette height": skill_height / base_height,
        }
        for label, ratio in ratios.items():
            if not 0.72 <= ratio <= 1.35:
                fail(f"{asset_id} {label} identity drift: ratio {ratio:.2f}")

    audit_stage_contracts = (
        "'coat-rack': 0", "'closet-dark': 0",
        "'uniform-answer': 1", "'silent-father': 1",
        "'last-bus': 2", "'wet-shoes': 3",
        "'whose-box': 4", "'debt-collector': 4",
        "'revolving-lantern': 5", "'lamp-keeper': 5",
    )
    for token in audit_stage_contracts:
        if token not in game:
            fail(f"boss telegraph audit stage drift: {token}")

    behavior_contracts = {
        "phone answer duration": "this.phoneAnswer >= 3",
        "phone answer damage gate": "(!this.phoneRinging || this.phoneAnswer <= 0)",
        "phone answer pauses ring window": "const ringWindowAdvancing = this.phoneAnswer <= 0",
        "phone phase-two split": "const count = Math.min(4, 3 + Math.floor(this.phoneMissed / 10))",
        "phone phase-two placement": "const radius = 180 + (index % 2) * 40",
        "phone unresolved-call conversion": "this.phoneCalls.filter((_, index) => index !== answeredIndex)",
        "phone split rendering": "private renderPhoneCalls(): void",
        "phone edge-hint urgency": "const phoneHintFrequency = this.phoneRingWindow < 2 ? 12",
        "praise consultation start": "private beginPraiseConsult(enemy: EnemyUnit, extraTasks: number)",
        "praise consultation choice": "Math.hypot(this.heroX - consult.x, this.heroY - consult.y) >= 28",
        "praise consultation doubles bonuses": "this.praiseDamage * 2",
        "praise consultation doubles work": "this.spawnPraiseTasks(enemy, consult.extraTasks)",
        "praise consultation rendering": "private renderPraiseConsult(): void",
        "praise retreat paper zones": "private updatePraisePaperZones(dt: number)",
        "praise retreat animation": "'praise-p1-retreat'",
        "praise consultation animation": "'praise-p1-consult'",
        "praise one-seat animation": "this.playBossAnimation(chair, 'praise-p2-one-seat'",
        "praise optimize has a reaction windup": "enemy.attackKind = 'praise-optimize'",
        "praise dismiss has a reaction windup": "enemy.attackKind = 'praise-dismiss'",
        "praise one-seat has a reaction windup": "enemy.attackKind = 'praise-one-seat'",
        "praise optimize resolves after windup": "case 'praise-optimize':",
        "praise dismiss resolves after windup": "case 'praise-dismiss':",
        "praise one-seat resolves after windup": "case 'praise-one-seat':",
        "praise pending attacks render target warnings": "enemy.attackKind === 'praise-optimize'",
        "praise optimize frozen audit": "telegraphVariant === 'praise-optimize'",
        "praise dismiss frozen audit": "telegraphVariant === 'praise-dismiss'",
        "praise one-seat frozen audit": "telegraphVariant === 'praise-one-seat'",
        "task-simple one-generation split": "enemy.type === 'task-simple' && (enemy.phase ?? 0) === 0",
        "task-revise one-time revival": "enemy.type === 'task-revise' && (enemy.phase ?? 0) === 0",
        "task-deadline timed expiry": "enemy.type === 'task-deadline' && (enemy.mechTimer ?? 0) >= TASK_DEADLINE_DURATION",
        "task-sync periodic gathering": "enemy.type === 'task-sync' && (enemy.mechTimer ?? 0) >= TASK_SYNC_INTERVAL",
        # 2026-07-26 用户批准新招《缝里看你》后扩为四招循环
        "closet four-move cycle": "const move = this.closetMoveIndex % 4;",
        "closet gap strike resolution": "case 'closet-gap':",
        "closet hands attack dispatch": "enemy.attackKind = 'closet-hands'",
        "closet hands strike resolution": "case 'closet-hands':",
        "closet slam attack dispatch": "enemy.attackKind = 'closet-slam'",
        "closet slam strike resolution": "case 'closet-slam':",
        "closet hands dedicated animation": "this.playBossAnimation(enemy, 'closet-hands'",
        "closet slam dedicated animation": "this.playBossAnimation(enemy, 'closet-slam'",
        "closet local target lock": "enemy.attackTargetX = this.heroX",
        "closet dedicated audit scene": "action === 'childhood-boss-hazards'",
        "phone caller wife recovery": "this.healHero(5)",
        "phone caller mother refund": "this.hero.coins += 2",
        "phone caller hospital relief": "this.phoneRelief += 1",
        "phone effective strength tier": "Math.floor(this.phoneMissed / 5) - this.phoneRelief",
        "lamp seize start": "private beginLampSeize(enemy: EnemyUnit)",  # 2026-07-26 用户裁决：取消二选一，改为灯光圈追踪收缴
        "lamp seize window": "timer: 6,",
        "lamp seize tracking resolution": "private updateLampSeize(enemy: EnemyUnit, dt: number)",
        "lamp choice strip resolution": "private finishLampCycle(enemy: EnemyUnit, stripAt: number)",
        "lamp keeper permanent guard": "if (enemy.type === 'lamp-keeper') {",
        "lamp keeper final dim action": "this.playBossAnimation(enemy, 'keeper-dim', LAMP_RELEASE_CONFIRM_DELAY)",
        "lamp keeper final strip playback": "keeper?.bossAnim === 'keeper-strip'",
        "lamp keeper final dim playback": "keeper?.bossAnim === 'keeper-dim'",
        "lamp keeper active release": "private releaseFinalBreath(): void",
        "lamp seize rendering": "private renderLampChoice(): void",
        "collector damage-triggered relocation": "enemy.relocateDamage >= enemy.maxHp * COLLECTOR_RELOCATE_DAMAGE_RATIO",
        "collector relocation action": "private relocateDebtCollector(enemy: EnemyUnit)",
        "collector offscreen-radius pull chain": "const pullDX = enemy.x - this.heroX;",
        "stage elite identity downgrade": "spawn.boss = false",
        "uniform answer canonical elite": "'uniform-answer': { name: '统一答案', hp: 200, speed: 22, radius: 26, damage: 6, elite: true }",
        "last bus canonical elite": "'last-bus': { name: '末班车', hp: 260, speed: 26, radius: 28, damage: 10, elite: true }",
        "elite and backstab windup dispatch": "if ((enemy.boss || enemy.elite || enemy.backstabber) && (enemy.windupTimer ?? 0) > 0)",
        "last bus unified windup": "enemy.attackKind = 'last-bus-dash'",
        "last bus strike dispatch": "case 'last-bus-dash':",
        "hazards update independently from coin drops": "this.updateTrailHazards(dt);",
        "uniform process uses discrete stamps": "visual: 'stamp'",
        "stage elite and backstab attack motion": "const eliteSkillWindup = Boolean((enemy.elite || enemy.backstabber) && (enemy.windupTimer ?? 0) > 0)",
        "coat rack dedicated sleeve animation": "doubleSleeve ? 'coat-double-sleeve' : 'coat-sleeve'",
        "coat rack double sleeve attack dispatch": "enemy.attackKind = doubleSleeve ? 'double-sleeve' : 'sleeve'",
        "coat rack double sleeve strike resolution": "case 'double-sleeve':",
        "uniform answer dedicated action animation": "move === 0 ? 'uniform-standard' : move === 1 ? 'uniform-process' : 'uniform-pass'",
        "uniform answer standard audit scene": "telegraphVariant === 'uniform-answer-standard'",
        "uniform answer process audit scene": "telegraphVariant === 'uniform-answer-process'",
        "uniform answer pass audit scene": "telegraphVariant === 'uniform-answer-pass'",
        "uniform process deterministic audit trail": "this.heroTrail = Array.from({ length: 24 }",
        "uniform process audit trail reaches current position": "const progress = Math.min(index, 22) / 22;",
        "last bus dedicated departure animation": "this.playBossAnimation(enemy, 'bus-depart', 1.25)",
        "wet shoes dedicated pursuit animation": "this.playBossAnimation(enemy, 'wet-shoes-hurry', 0.8)",
        "wet shoes continuous-stop latch": "if (this.heroMoving) enemy.wetShoesStopCharged = false;",
        "wet shoes one tier per stop": "enemy.wetShoesStopCharged = true;",
        "whose box dedicated counting animation": "this.playBossAnimation(enemy, 'box-count', 1.05)",
        "revolving lantern dedicated speed animation": "tier === 0 ? 'lantern-summon' : 'lantern-summon-fast'",
    }
    for contract, token in behavior_contracts.items():
        if token not in game:
            fail(f"boss behavior contract missing: {contract}")
    praise_cycle_start = game.index("const chairMove = this.praiseMoveIndex % 5;")
    praise_cycle_end = game.index("// 一阶段不让你靠近", praise_cycle_start)
    praise_cycle = game[praise_cycle_start:praise_cycle_end]
    for instant_effect in ("eaten.dead = true", "this.resolveOneSeat(enemy, tasks)"):
        if instant_effect in praise_cycle:
            fail(f"praise phase-two effect still resolves before its animation: {instant_effect}")
    if "被照满 1.5 秒即收走一件道具" not in wiki:
        fail("wiki lamp choice rule has drifted from runtime")
    if "主动踩中才让当前加成与本轮任务同时翻倍" not in wiki:
        fail("wiki praise consultation rule has drifted from runtime")
    if "二阶段分裂为 3–4 个独立来电位置" not in wiki:
        fail("wiki phone split rule has drifted from runtime")
    if "当前正典名为《沉默的自己》" in wiki:
        fail("wiki still contains the retired silent-self boss canon")
    if "《谁的纸箱》四帧保留工椅、五星脚与轮子" not in wiki:
        fail("wiki is missing the whose-box cross-atlas identity contract")
    if "《走马灯》四帧保留红边纸灯与灯面奔马" not in wiki:
        fail("wiki is missing the revolving-lantern cross-atlas identity contract")
    if "红框起止与命中带共用同一组几何参数" not in wiki:
        fail("wiki is missing the directional telegraph/strike geometry contract")
    if "title: '响个不停'" not in game:
        fail("adulthood stage title has drifted from its chapter boss")
    print("boss skill validation passed: 16 atlases / 15 stage forms, 41 actions, 164 wired frames")


if __name__ == "__main__":
    main()
