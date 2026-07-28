#!/usr/bin/env python3
"""VFX/UI 资源包基底生成：弹体、命中特效、免死演出、协同、状态标记、
卡框、档案饰件、房间内景、地面、五毒图腾、章节字卡、命运纹样、结局、宣传。

grid 模式=绿幕 2x2 格（后续按格切）；full 模式=整幅画（无绿幕）。
断点续跑：已存在的文件跳过；命令行传文件名（不含 .png）可强制重跑指定条目。
用法：IMAGE2_API_KEY=... [IMAGE2_BASE_URL=...] python3 scripts/generate_vfx_ui_pack_image2.py [名字...]
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get("IMAGE2_BASE_URL", "https://api.gbgjxj.store/v1")
MODEL = "gpt-image-2"
RAW_DIR = Path("output/imagegen/zhe-yi-shen-vfx-ui-v1/raw")

PIXEL = (
    "Chunky low-resolution pixel art, crisp hard pixels, no anti-aliasing, no gradients, "
    "muted dark fairytale palette: deep ink purple-grey, worn browns, faded paper cream, "
    "occasional dull red or cold blue accent. Absolutely no text, no letters, no numbers."
)
GRID = (
    "2x2 grid on solid pure green background (#00FF00), four separate elements, each centered "
    "in its own quadrant, no overlap, no grid lines. " + PIXEL
)

# (名字, 模式 grid|full, 提示词)
# 弹体 v4 公共尾注：粗描边+专属主色+24px 可读，是弹体告别"整片月白"的关键约束。
ANIM4 = (
    " Four animation frames of the same object, quadrant order (1)(2)(3)(4), a smooth looping cycle."
    " Muted low-saturation colors matching a dark fairytale palette - dusty, worn, faded tones,"
    " NOT vibrant, NOT neon, NOT glossy. Chunky simple pixel shapes readable at 20 pixels: "
)
HIT4 = (
    " Four animation frames of the same impact effect, quadrant order (1)(2)(3)(4), "
    "bold chunky shapes with high contrast and strong saturated identity color, "
    "readable when shrunk to 28 pixels, isolated effect on green, no background scene: "
)
READ = (
    " Each object bold and chunky with a thick dark outline and strong saturated identity color,"
    " high contrast, must stay readable when shrunk to 24 pixels. Isolated objects, no background scene."
)

SPECS: list[tuple[str, str, str]] = [
    # ── 弹体（孤立实物，无场景背景）─────────────────────────────
    ("proj-breath", "grid", GRID + " Four clearly DIFFERENT condensation states of one exhaled breath, all moon-white, differences must be obvious: (1) loose torn wisps of fog with no outline, barely a shape, very translucent feeling, (2) a soft fog ball, fuzzy edge, NO outline yet, pale grey, (3) a firm round orb with a thin dark slate outline and a faint inner swirl, (4) a hard glossy pearl with a bright white core highlight and a thick dark slate-blue outline. State 1 is formless mist, state 4 is a solid pearl - maximum contrast between states." + " Isolated objects, no background scene."),
    ("proj-forms", "grid", GRID + " Elements: (1) a folded cream paper note seen edge-on flying, warm cream with sepia fold lines and dark brown outline, (2) a glossy saturated cold-blue raindrop with a white specular highlight and deep navy outline, (3) a thick bold teal double-arc sound wave, heavy strokes, (4) a rich antique brass-gold key seen from the side, dark bronze outline." + READ),
    ("proj-special", "grid", GRID + " Elements: (1) a short bolt of three ivory vertebra bone segments in a row, warm bone cream with grey-brown outline, (2) one large glossy sky-blue tear drop with bright highlight and deep navy outline, (3) a directional cone of moon-white breath spreading right with slate-blue rim streaks showing motion, (4) two offset pale mint-green echo rings, one fainter, both with soft green outlines." + READ),
    ("proj-wood-slash-v2", "grid", GRID + " Four variants of the same object: a curved crescent slash arc carved from warm wood, toy wooden sword swing trail, warm brown wood grain with two short motion lines, thick dark brown outline. Same object in all four quadrants with tiny variations." + READ),
    ("proj-readable-a", "grid", GRID + " Elements: (1) a curved warm wood-brown crescent slash arc with motion lines, (2) a cold steel needle blade with a cyan glint, gunmetal outline, (3) a glossy glass marble with a vivid amber-and-teal cat-eye swirl inside, round specular highlight, dark outline, (4) a cluster of pale cyan ice shards with crisp facets and deep teal outline." + READ),
    ("proj-readable-b", "grid", GRID + " Elements: (1) a matte grey capsule pill with three dark vent slots, uniform and standardized feeling, (2) a grey-blue rounded chat bubble containing three dark typing dots, (3) a round warm amber shirt button with four holes and stitch marks, (4) a pair of linked bold gold chain links." + READ),
    ("proj-readable-c", "grid", GRID + " Elements: (1) a deep crimson ink scribble seal, angry red pen strokes crossing out, (2) a warm grey pebble stone with a hairline crack, heavy feeling, (3) a round eyeglass lens with a diagonal cyan glare stripe and thin dark rim, (4) the bold ink-black Chinese character 哈 in thick brush strokes with a thin cream halo edge." + READ),
    # ── 命中/消散特效（每张 2x2 = 4 帧动画序列）───────────────────
    ("hit-mist", "grid", GRID + " Four animation frames of the same effect, order (1)(2)(3)(4): a small puff of pale moon-white fog bursting and dissipating into thin wisps, frame 1 tight burst, frame 4 almost gone. Isolated effect on green, no background."),
    ("hit-water", "grid", GRID + " Four animation frames of the same effect, order (1)(2)(3)(4): a small cold blue-grey water splash bursting outward into droplets and settling, frame 1 tight impact, frame 4 last falling drops. Isolated effect on green, no background."),
    ("hit-crit", "grid", GRID + " Four animation frames of the same effect, order (1)(2)(3)(4): a pale warm gold four-pointed star flash expanding then collapsing, frame 1 small bright point, frame 2 full star, frame 4 fading sparks. Isolated effect on green, no background."),
    ("hit-paper", "grid", GRID + " Four animation frames of the same effect, order (1)(2)(3)(4): a few cream paper scraps bursting outward and fluttering down, frame 1 tight bunch, frame 4 scattered falling pieces. Isolated effect on green, no background."),
    # ── 弹体 v5 飞行帧动画：每形态 2x2 = 4 帧循环。纪律：低饱和暗调、
    #    大色块、粗轮廓、极少内部细节（v4 的"强饱和识别色"被用户否决）。──
    ("proj-anim-breath", "grid", GRID + ANIM4 + "the same soft moon-white breath orb pulsing gently: (1) a round fog orb, (2) the orb slightly swollen with one tiny wisp curling off its top, (3) the orb round and a little denser, (4) the orb slightly squeezed with a small wisp trailing behind. Soft pale moon-white with a faint warm-grey shadow side, NO dark outline, soft but chunky edges."),
    ("proj-anim-marble", "grid", GRID + ANIM4 + "the same small round glass marble, its single round white highlight dot moving around the surface: (1) highlight at top-left, (2) highlight at top-right, (3) highlight at bottom-right, (4) highlight at bottom-left. Muted dusty teal glass with one soft dull-amber swirl band inside, thick dark outline, big simple flat shapes, minimal interior detail."),
    ("proj-anim-key", "grid", GRID + ANIM4 + "the same small antique key rotating clockwise, drawn cleanly at each angle: (1) key horizontal pointing right, (2) key tilted 45 degrees, (3) key vertical pointing down, (4) key tilted 135 degrees. Muted dull brass, thick dark bronze outline, big readable silhouette, flat simple shapes, no engraving detail."),
    ("proj-anim-slash", "grid", GRID + ANIM4 + "the same curved wooden slash arc mid-swing: (1) a narrow thin crescent, (2) the crescent open at full width, (3) the crescent leaning forward with two short motion lines, (4) the crescent thin again and fading. Muted warm wood brown with one darker grain stripe, thick dark outline, flat simple shapes."),
    # ── 弹体 v5 呼吸凝实态：雾→珠 四档成长，现有 proj-anim-breath 充当态1 ──
    ("proj-anim-breath0", "grid", GRID + ANIM4 + "the same barely-formed cluster of exhaled breath shreds: (1) three or four SOLID pale cream fog shreds loosely clustered, (2) the shreds drifting slightly apart, (3) the shreds loosely gathering, (4) the cluster stretched with one trailing shred. SOLID opaque moon-white and warm cream pieces, absolutely NOT transparent, NOT translucent, no green tint, chunky ragged solid shapes like torn cotton."),
    ("proj-anim-breath2", "grid", GRID + ANIM4 + "the same firm round orb of condensed breath with a thin soft slate-grey rim and a faint inner swirl: (1) orb round, swirl at left, (2) orb slightly swollen, swirl rotated to top, (3) orb round, swirl at right, (4) orb slightly squeezed, swirl at bottom. Moon-white with a subtle grey rim, chunky soft shapes."),
    ("proj-anim-breath3", "grid", GRID + ANIM4 + "the same perfectly ROUND hard glossy pearl of fully condensed breath, thin dark slate outline all around, one BIG bright white specular highlight dot clearly visible: (1) highlight at top-left, (2) highlight at top-right, (3) highlight at bottom-right with a tiny sparkle beside, (4) highlight at top-left again. Ivory-white pearl, perfect circle, clean dark outline, the highlight must be obvious."),
    # ── 弹体 v5 铺开：其余 14 种形态 ─────────────────────────────
    ("proj-anim-rain", "grid", GRID + ANIM4 + "the same small raindrop flying sideways, its tail swaying: (1) drop with tail straight behind, (2) tail curving slightly up, (3) tail straight again a bit longer, (4) tail curving slightly down. Muted dusty blue-grey water with one pale highlight, soft dark outline, simple flat shapes."),
    ("proj-anim-tear", "grid", GRID + ANIM4 + "the same single teardrop stretching and rebounding in flight: (1) round drop, (2) drop stretched long, (3) drop rebounding shorter and fat, (4) drop slightly stretched again. Muted pale blue-grey with one soft highlight, soft dark outline, simple flat shapes."),
    ("proj-anim-ice", "grid", GRID + ANIM4 + "the same small cluster of ice crystals, facet highlights blinking in turn: (1) left facet bright, (2) top facet bright, (3) right facet bright, (4) all facets dim. Muted pale grey-cyan ice with deep dull-teal outline, chunky faceted shapes."),
    ("proj-anim-laugh", "grid", GRID + ANIM4 + "the same bold ink-black Chinese character 哈 bouncing: (1) normal, (2) squashed shorter and wider, (3) stretched taller and thinner, (4) normal but tilted slightly. Ink black strokes with a thin worn cream halo, chunky brush look."),
    ("proj-anim-serial", "grid", GRID + ANIM4 + "the same matte grey capsule pill with three dark vent slots, deliberately rigid and identical in every frame, the ONLY change is one tiny pale indicator dot cycling across the three slots: (1) dot on first slot, (2) dot on second, (3) dot on third, (4) no dot. Muted cold grey, dark outline, standardized lifeless feeling."),
    ("proj-anim-paper", "grid", GRID + ANIM4 + "the same folded cream paper note tumbling as it flies: (1) seen flat and wide, (2) folding narrower, (3) seen almost edge-on as a thin line, (4) opening wide again. Muted worn cream with faint sepia fold lines, soft dark outline."),
    ("proj-anim-razor", "grid", GRID + ANIM4 + "the same small slim razor blade, a cold glint sweeping along its edge: (1) glint at the back of the edge, (2) glint at the middle, (3) glint at the front tip, (4) no glint. Muted gunmetal grey, dark outline, slim chunky silhouette."),
    ("proj-anim-lens", "grid", GRID + ANIM4 + "the same round eyeglass lens, a diagonal reflection stripe sweeping across: (1) stripe at left edge, (2) stripe across the middle, (3) stripe at right edge, (4) no stripe, plain glass. Muted pale grey glass with thin dark rim, simple flat shapes."),
    ("proj-anim-sound", "grid", GRID + ANIM4 + "the same double-arc sound wave breathing: (1) two arcs close together, (2) arcs spread apart, (3) arcs close again with a third faint arc appearing, (4) arcs spread with the faint arc gone. Muted dusty teal, thick strokes, simple flat shapes."),
    ("proj-anim-link", "grid", GRID + ANIM4 + "the same two interlocked chain links, the two links alternately catching light: (1) left link brighter, (2) both equal, (3) right link brighter, (4) both equal. Muted dull old gold, dark outline, chunky simple shapes."),
    ("proj-anim-button", "grid", GRID + ANIM4 + "the same round shirt button tumbling, its four thread holes shifting as it turns: (1) holes in a square, (2) holes in a diamond, (3) holes in a narrow ellipse as the button tilts edge-on, (4) holes in a diamond again. Muted worn amber-brown, dark outline, simple flat shapes."),
    ("proj-anim-stone", "grid", GRID + ANIM4 + "the same small heavy pebble stone slowly tumbling with tiny dust specks: (1) crack line at left, one dust speck below, (2) crack rotated up, dust speck behind, (3) crack at right, two dust specks trailing, (4) crack down, no dust. Muted warm grey stone, dark charcoal outline, chunky heavy shapes."),
    ("proj-anim-cone", "grid", GRID + ANIM4 + "the same soft cone of breath fog spreading to the right, edge wisps streaming backward: (1) cone compact, (2) cone slightly wider with one wisp curling off the top edge, (3) cone compact again with a wisp below, (4) cone wide with two faint trailing wisps. Soft moon-white fading to transparent at the wide end, NO outline, soft chunky edges."),
    ("proj-anim-stamp", "grid", GRID + ANIM4 + "the same small dark red ink seal stamp tumbling in flight, its square inked face catching light in turn: (1) face tilted left, (2) face straight on showing an illegible square seal mark, (3) face tilted right, (4) edge-on showing the wooden handle. Muted dark crimson ink and worn wood handle, dark outline, chunky simple shapes."),
    # ── 命中特效 v2：11 材质 × 4 帧，配色对齐弹体 v4 主色 ─────────
    ("hit-mist-v2", "grid", GRID + HIT4 + "a puff of moon-white breath fog bursting: (1) tight dense white puff, (2) puff torn open into curling wisps, (3) thin scattered wisps drifting apart, (4) last faint traces almost gone. Moon-white with pale slate-grey shadows."),
    ("hit-water-v2", "grid", GRID + HIT4 + "a saturated cold-blue water splash: (1) tight crown splash impact, (2) glossy droplets flying outward with white specular highlights, (3) droplets falling and breaking, (4) last small drops and a thin puddle ring. Vivid cold blue with deep navy outlines."),
    ("hit-crit-v2", "grid", GRID + HIT4 + "a warm gold four-pointed star flash: (1) small bright cream point, (2) full bold four-pointed gold star with cream core, (3) star breaking into sparks, (4) fading gold sparks. Rich warm gold with dark bronze outline."),
    ("hit-paper-v2", "grid", GRID + HIT4 + "cream paper scraps bursting: (1) tight bunch of torn cream scraps, (2) scraps flung outward showing sepia fold lines, (3) scraps fluttering down, (4) last pieces settling. Warm cream with sepia and dark brown outlines."),
    ("hit-wood-v2", "grid", GRID + HIT4 + "warm brown wood splinters bursting: (1) tight crack with two splinters, (2) chunky splinters flying outward showing wood grain, (3) splinters tumbling apart, (4) small chips settling. Warm wood brown with thick dark brown outlines."),
    ("hit-stone-v2", "grid", GRID + HIT4 + "heavy grey stone chips bursting: (1) tight crack with dust, (2) chunky angular pebble chips flying out with hairline cracks, (3) chips falling heavily, (4) settling dust and last chips. Warm grey stone with dark charcoal outlines."),
    ("hit-metal-v2", "grid", GRID + HIT4 + "cold steel sparks glancing off metal: (1) tight bright impact point, (2) straight gunmetal spark streaks with cyan glints, (3) sparks scattering, (4) fading cyan glints. Gunmetal grey with vivid cyan accents and dark outlines."),
    ("hit-ice-v2", "grid", GRID + HIT4 + "pale cyan ice shattering: (1) tight frozen crack, (2) crisp faceted ice shards flying outward, (3) shards breaking smaller, (4) fading frost sparkle. Pale cyan with deep teal outlines and white facet highlights."),
    ("hit-signal-v2", "grid", GRID + HIT4 + "a teal sound-signal ripple: (1) small tight double arc, (2) bold thick teal double-arc rings expanding, (3) rings breaking into dashes, (4) faint scattered dashes fading. Saturated teal with dark slate outlines."),
    ("hit-key-v2", "grid", GRID + HIT4 + "brass-gold key glints bursting: (1) tight gold flash, (2) small brass fragments and star glints flying out, (3) fragments tumbling with bronze edges, (4) last gold dust settling. Rich antique brass-gold with dark bronze outlines."),
    ("hit-glass-v2", "grid", GRID + HIT4 + "a glass marble shattering: (1) tight crack flash, (2) glossy glass shards flying outward, some amber and some teal like a broken cat-eye marble, with round white highlights, (3) shards breaking smaller, (4) last glittering fragments. Vivid amber and teal glass with dark outlines."),
    # ── 免死演出 ────────────────────────────────────────────────
    ("save-tooth", "grid", GRID + " Four animation frames of the same effect, order (1)(2)(3)(4): a single small white milk tooth cracking, frame 1 whole tooth with a hairline crack, frame 2 crack spreading, frame 3 splitting into shards, frame 4 shards scattering with tiny pale sparks. Isolated on green."),
    ("save-photo", "grid", GRID + " Four animation frames of the same effect, order (1)(2)(3)(4): a small old framed portrait photo flashing, frame 1 dark frame, frame 2 frame glowing bright white, frame 3 white light spilling out, frame 4 dimming back with a faint afterglow. Isolated on green."),
    ("save-static", "full", "Full-frame analog CRT television static noise texture, dense random monochrome snow pixels, subtle horizontal scanline bands, dark grey and pale grey speckle, seamless texture feeling, no recognizable shapes. " + PIXEL),
    ("save-shutdown", "grid", GRID + " Four animation frames of the same effect, order (1)(2)(3)(4): an old CRT screen turning off, frame 1 full pale glowing rectangle, frame 2 collapsing into a bright horizontal line, frame 3 the line shrinking to a small bright dot, frame 4 tiny fading dot in darkness. Isolated on green."),
    # ── 协同「成双」静态覆盖 + 状态标记 ──────────────────────────
    ("syn-overlays", "grid", GRID + " Elements: (1) a small cluster of sharp ice crystals growing upward, cold pale blue, (2) a star of thin dark crack lines as on old porcelain, (3) a small collapsing plume of dust and debris falling inward, grey-brown, (4) two short jagged electric arcs, pale cold white-blue. Isolated effects on green, no background."),
    ("syn-overlays-v2", "grid", GRID + " Elements, each a bold chunky effect overlay with strong saturated identity color and thick dark outline, readable at 24 pixels: (1) a cluster of crisp pale-cyan ice crystal spikes growing upward with deep teal outlines and white facet highlights, (2) a bold spiderweb star of thick dark charcoal crack lines radiating from an impact point, like shattered porcelain, clearly readable as cracks, (3) a heavy collapsing burst of warm grey-brown rubble chunks and dust falling inward toward the center with motion streaks pointing inward, (4) two thick jagged electric lightning bolts crossing, vivid cold cyan-white with dark slate outlines. Isolated effects on green, no background."),
    ("status-marks", "grid", GRID + " Elements, each a tiny simple game status icon: (1) a minimal ice crystal snowflake, (2) a tiny electric spark zigzag, (3) a tiny rounded chat bubble containing two small check marks, (4) a small circular loop of two arrows chasing each other. Bold minimal silhouettes, isolated on green."),
    # ── 五毒图腾 + 摇杆 ─────────────────────────────────────────
    ("poison-a", "grid", GRID + " Elements, each a small quiet emblem drawn as an everyday object, no faces: (1) a cupped hand closing around one coin, (2) a single thin flame rising from a matchstick, (3) a moth pressed against a glowing lamp glass, (4) a slightly tilted paper crown. Muted colors, isolated on green."),
    ("poison-b", "grid", GRID + " Elements: (1) a short rope tied into a tangled knot with both ends loose, (2) a flat worn stone ring pad seen from above, subtle concentric grooves, dark neutral, (3) a small round worn stone cap seen from above with a soft center dimple, dark neutral, (4) a small dark red wax seal stamp with an illegible relief. Isolated on green."),
    # ── 卡框（中心必须纯绿，供程序抠空）──────────────────────────
    ("frame-quality", "grid", GRID + " Elements, each a thin rectangular horizontal FRAME BORDER only, landscape ratio about 2.3:1, the inside of each frame is pure green (#00FF00) empty: (1) a plain single-line worn dark border, (2) a double-line border with small corner ticks, aged brown, (3) a border with tiny stitched dashes and one small dark red corner seal, (4) an ornate but restrained border with faded dull gold corner filigree. Only borders, hollow centers."),
    ("frame-panels", "grid", GRID + " Elements: (1) a large thin rectangular portrait FRAME BORDER with hollow pure green center, quiet worn paper-edge style with corner folds, (2) a small horizontal button frame border with hollow green center, single worn line with notched corners, (3) a horizontal strip of torn paper edge, cream, ragged lower edge, (4) a horizontal strip of receipt paper edge with a row of small punched holes. Only borders and strips, hollow centers where stated."),
    # ── 档案饰件 + 桌面 ─────────────────────────────────────────
    ("archive-deco", "grid", GRID + " Elements: (1) two short strips of translucent aged sticky paper tape, cream-yellow, (2) a slightly bent metal paperclip, (3) a faded round postmark ring stamp with an illegible center, dull ink blue, (4) a rectangular dark red ink seal stamp, edges unevenly inked, illegible relief. Isolated objects on green."),
    ("archive-desk", "full", "Full-frame top-down view of a dark worn wooden desk surface, old lacquer rubbed off in places, faint ring stains from cups, one shallow scratch, very dark and quiet, mostly uniform so paper documents can sit on top. " + PIXEL),
    # ── 房间内景（整幅，竖屏构图，中部留空给 UI）─────────────────
    ("room-lamp", "full", "Vertical portrait pixel art scene: a tiny dark room at night where one warm desk lamp has been left on, the lamp stands on a small table to one side, warm pool of light on the floor, a folded blanket and a cup still steaming faintly, walls fade into darkness, middle of the image relatively empty and dark so interface text can sit there, quiet and kind mood. " + PIXEL),
    ("room-inner", "full", "Vertical portrait pixel art scene: a dark inner room behind a curtain, the curtain half open at the top, a single cold small bulb hanging, shelves with indistinct wrapped bundles at the sides, floor boards dark, middle of the image relatively empty and very dark so interface text can sit there, uneasy quiet mood, nothing supernatural, no faces. " + PIXEL),
    ("room-pawn", "full", "Vertical portrait pixel art scene: inside a cramped unnamed pawnshop at night, a worn wooden counter at the bottom edge, shelves with tagged bundles and boxes rising at both sides, one dim hanging bulb, dust in the light, middle of the image relatively empty and dark so interface text can sit there. " + PIXEL),
    # ── 地面材质（整幅可平铺感）──────────────────────────────────
    ("ground-a", "grid", GRID + " Elements, each a small square swatch of floor material seen top-down, flat, tileable feeling, very dark and low contrast: (1) worn dark wooden floor planks, (2) old terrazzo school floor with tiny speckles, (3) grey office carpet with faint weave, (4) pale-green hospital vinyl floor with subtle sheen lines. Swatches fill their quadrants fully."),
    ("ground-b", "grid", GRID + " Elements, each a small square swatch of floor material seen top-down, flat, tileable feeling, very dark and low contrast: (1) dark riveted metal plate floor with faint gear-tooth imprints, (2) night asphalt with tiny cold speckles, (3) plain packed dark earth, (4) dark dusty concrete. Swatches fill their quadrants fully."),
    # ── 章节字卡小景 ────────────────────────────────────────────
    ("chapter-a", "grid", GRID + " Elements, each a tiny quiet scene vignette in a small rectangle: (1) the dark space under a bed with one golden rattle bell lying on the floorboards, (2) a school desk edge with a stub of chalk and an eraser, (3) interlocking rusty gears against darkness, (4) an office cubicle corner with a dim monitor glow. No people. Vignettes fill their quadrants."),
    ("chapter-b", "grid", GRID + " Elements, each a tiny quiet scene vignette in a small rectangle: (1) a hospital bed side rail with an IV stand silhouette, (2) one street lamp cone of light on wet night pavement, (3) a windowsill at night with a cooling cup of tea, (4) an empty coat hook on a dark wall. No people. Vignettes fill their quadrants."),
    # ── 命运 profile 纹样 ───────────────────────────────────────
    ("fate-profile-a", "grid", GRID + " Elements, each a small quiet emblem, no faces: (1) a thin warm light leaking through a door crack, (2) two open hands exchanging a small parcel, (3) a boiled sweet in a shiny wrapper with a thin thread tied to it, (4) a fishhook hidden inside a piece of bread. Muted, isolated on green."),
    ("fate-profile-b", "grid", GRID + " Elements, each a small quiet emblem, no faces: (1) an umbrella turned inside out by wind, (2) an old telephone handset resting off the hook, cord coiled, (3) an empty chair facing a wall, (4) a curtain drawn shut with light behind it. Muted, isolated on green."),
    # ── 结局 + 宣传 ─────────────────────────────────────────────
    ("ending-table", "full", "Vertical portrait pixel art scene: a plain table under one cold ceiling light at night, personal belongings laid out in a careful row on the table like evidence: a key, a folded jacket, a small bottle, an envelope, a watch, a marble, seen at a slight angle, background pure darkness, upper third of image empty darkness so text can sit there, quiet museum-of-a-life mood, no people. " + PIXEL),
    ("ending-lampman", "full", "Vertical portrait pixel art scene: one tall street lamp at night casting a warm cone of light on the ground, a quiet figure in a long coat and wide-brimmed hat standing just inside the edge of the light holding a small unlit lantern, face completely in shadow, gentle not menacing, darkness all around, lower third mostly dark ground. " + PIXEL),
    ("promo-cover", "full", "Vertical portrait pixel art poster composition: a small dark bedroom scene at night seen from the front, a lone small pixel figure standing in the center surrounded by towering piles of everyday life objects fading up into darkness — schoolbags, desks, clocks, bottles, envelopes, a hanging necktie — one warm lamp glow from one side, melancholic dark fairytale mood, no text anywhere, generous empty dark space at top for a title. " + PIXEL),
    ("promo-banner", "full", "Wide horizontal pixel art banner composition: a night road lit by a row of street lamps stretching right, a small pixel figure walking away carrying an oversized bundle of everyday objects on his back — a schoolbag, a clock, an envelope, a kettle — each lamp pool of light a different faint color of a life stage, melancholic but gently humorous dark fairytale mood, no text anywhere. " + PIXEL),
]


def generate(name: str, prompt: str, api_key: str) -> None:
    body = json.dumps({
        "model": MODEL, "prompt": prompt, "size": "1024x1024", "n": 1,
    }).encode()
    request = urllib.request.Request(
        f"{BASE_URL}/images/generations",
        data=body,
        headers={"authorization": f"Bearer {api_key}", "content-type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        payload = json.load(response)
    image = base64.b64decode(payload["data"][0]["b64_json"])
    (RAW_DIR / f"{name}.png").write_bytes(image)
    print(f"{name}: {len(image)} bytes", flush=True)


def main() -> None:
    api_key = os.environ.get("IMAGE2_API_KEY", "")
    if not api_key:
        sys.exit("IMAGE2_API_KEY not set")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    failures: list[str] = []
    for name, _mode, prompt in SPECS:
        if only and name not in only:
            continue
        if not only and (RAW_DIR / f"{name}.png").exists():
            print(f"{name}: exists, skip", flush=True)
            continue
        for attempt in (1, 2, 3):
            try:
                generate(name, prompt, api_key)
                break
            except Exception as error:  # noqa: BLE001 — 断点续跑，逐条容错
                print(f"{name}: attempt {attempt} failed · {error}", flush=True)
                if attempt == 3:
                    failures.append(name)
                else:
                    time.sleep(8)
    if failures:
        print(f"FAILED: {', '.join(failures)}", flush=True)
        sys.exit(1)
    print("all done", flush=True)


if __name__ == "__main__":
    main()
