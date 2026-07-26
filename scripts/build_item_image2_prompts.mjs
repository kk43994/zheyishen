#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CONTRACT_PATH = resolve(ROOT, 'src/assets/items/equipment-art.json');
const OUTPUT_DIR = resolve(ROOT, 'scripts/image2/items-v1');
const PROMPT_DIR = resolve(OUTPUT_DIR, 'prompts');
const AUDIT_PATH = resolve(OUTPUT_DIR, 'audit.json');

const contract = JSON.parse(await readFile(CONTRACT_PATH, 'utf8'));
const audit = JSON.parse(await readFile(AUDIT_PATH, 'utf8'));
if (contract.itemCount !== 77 || contract.items?.length !== 77) {
  throw new Error(`expected 77 equipment contracts, got ${contract.items?.length ?? 0}`);
}

const channelInstructions = {
  fitted: 'Produce anatomy-aware wearable pieces: torso shell plus separate near/far upper-arm and forearm pieces when relevant. Keep openings at neck, hands and waist clean; the pieces must remain readable from all four directions.',
  rigid: 'Produce a compact rigid prop with its real attachment hardware, strap, cord or fold. Its facing and overlap must make physical sense at the canon body anchor; do not invent floating support bars.',
  decal: 'Produce only the item-specific surface marks or small overlays, spatially separated and shaped for the face, hair, garment, limb or shadow described by canon. No mannequin or body fill.',
  morph: 'Produce only silhouette-contour and body-part adjustment guides needed to communicate the canon posture or distortion. Keep the base person absent and avoid changing unrelated anatomy.',
  aura: 'Produce restrained effect sprites and ground/shadow accents with a clear center gap for the hero. The effect must communicate the canon event, not generic magic.',
  event: 'Produce a short event-effect source in four directional variants. It must read as a momentary game event and must not look like a permanent wearable object.',
  projectile: 'Include one small, isolated projectile or attack-state variant derived from the same physical object and satire concept, placed close to the main component without touching it.',
};

const itemDirectives = {
  'loose-button': 'Draw an ordinary small grey four-hole plastic school-uniform button with a short frayed sewing thread through the holes. It is not a pendant, coin, amulet, pouch or leather object.',
  'wooden-sword': 'Draw a child-made straight wooden toy sword cut from one board, with a clearly readable short crossguard, fabric-wrapped grip and blunt point. It is not a knife, machete, stake or rope-bound plank.',
  'front-desk-letter': 'Draw only a small cream paper love-letter envelope, slightly folded and partly open. Do not add a pouch, case, holster, bag or black container.',
  'spent-decade': 'Use premature grey-white hair strands and sparse time-freeze fragments around a body-shaped center gap. Do not draw a portal, clock ring, magic circle or generic spell effect.',
  'held-pee': 'Show only minimal inward-knee and tense-leg silhouette guide strokes. Do not draw pants, underwear, a pouch, a bladder symbol or any detachable garment.',
  'class-break': 'Draw a dry warm-yellow chalk-like foot ring with short lively speed ticks. It is not liquid, a puddle, slime, portal or magic pool.',
  'five-ha': 'Draw exactly five compact square chat-bubble or laugh-beat tiles in a row, with blank centers reserved for runtime text. Do not draw flowers, beads, pills, balls or petals.',
  marble: 'Draw one small translucent glass cat-eye marble with a colored internal ribbon and a clean round silhouette. No metal shell, hook, cord, ring, pendant, bomb or grenade parts.',
  'retracted-voice': 'Draw a small horizontal phone voice-message bar near ear height, with a simple blank waveform and fragments retracting backward. No lanyard, badge, key fob or hanging card.',
  'group-dad': 'Draw a tiny flat digital group-nickname UI plate that floats just above and beside the hair, with a blank text area. No strap, clip, lanyard, physical badge or document holder.',
  'divorce-draft': 'Draw only one folded cream agreement paper partly caught in the edge of a dark inner chest pocket. Show at most a narrow pocket lip; do not draw a full sweater, shirt, coat or torso.',
  'name-sold': 'Draw a flat contract/employee-number strip that can cover the name area, with blank number blocks and torn signature fragments. No handle, handbag, document bag, suitcase or pouch.',
  'moms-bowl': 'Draw one ordinary ceramic rice bowl kept warm under an inverted bowl or simple lid, with a small serving of rice and fading steam. No cooking pot, cauldron, stove or fantasy vessel.',
  'drank-for-boss': 'Draw only isolated red cheek-flush decals, a few unsteady footstep marks and one tiny plain liquor glass accent. No hair, head, face fill, person or silhouette.',
  'funeral-photo': 'Draw one small black-and-white funeral portrait photo card with a simple oval face silhouette and a separate stiff smile decal. No full head or body, and do not reduce the item to only a mouth line.',
  'typing-indicator': 'Draw exactly three small pixel-period timing states directly above a head-shaped empty center gap, plus twelve isolated current-breath markers in a full radial attack layout. Ignore the generic single-projectile instruction for this item. Do not draw a phone, chat bubble, speech panel, ground aura or readable text.',
  'goodnight-2h': 'Draw only a cold blue phone-screen glow pool on the ground with two faint sleepless clock ticks. No person, body outline, cave, portal, arch or black silhouette.',
  'one-more-game': 'Draw only a stubborn mobile-game result-screen glow in the shadow, with a small retry-arrow fragment and a dim controller-button motif. No person, body outline, cave, portal or black silhouette.',
  'abstract-lv10': 'Draw four bold, compact pixel-meme expression overlays at face scale: mismatched eyes, compressed mouth and one deliberate glitch accent. Make each readable after heavy downscaling; no full head or body.',
  'ktv-song': 'Draw a plain handheld KTV microphone whose frayed cable trails toward an empty disconnected jack and a dim isolated waveform. The cable must not form a heart, and the image must not suggest romance or a live audience.',
  'admission-notice': 'For this source sheet, render only the permanent rigid prop; its event feedback is composed in runtime and must not add a separate sprite. Draw exactly one thin off-white Chinese admission-notice sheet in each quadrant. Front: a small school-emblem block, restrained blank horizontal information bars and one unmistakable old-red rectangular admission stamp. Back: plain paper with one fold crease. Side views: visibly paper-thin. No envelope, folder, diploma scroll, ribbon, book, pouch, extra loose sheets, readable characters or fifth object.',
  'iphone-17-pro-max': 'For this source sheet, render only the permanent rigid prop; its message event is composed in runtime and must not add a separate sprite. Draw exactly one premium current-generation deep titanium-grey smartphone in each quadrant, designed to fit a near-hand grip. Back: one clearly separated three-lens camera cluster with a small sensor. Front: cold-white active screen and a dark pill-shaped top island, no app grid. Side views: thin metal rails and camera bump. No strap, case, holster, cable, floating message panel, logo, readable text, extra phone or fifth object.',
  'fathers-chart': 'For this source sheet, render only the permanent rigid prop; its threshold feedback is composed in runtime and must not add a separate sprite. Draw exactly one worn waist-carried medical record booklet in each quadrant. It has a flat uninterrupted top edge, a muted grey-green cloth spine, thick off-white paper cover, one large old-red registration strip/stamp block, two or three layered page tabs and curled corners. Any waist fastening must be two low-profile loops fully contained within the back-cover silhouette; no metal part may protrude above, below or beside the book. Make the booklet broad enough to read as a bound patient chart after downscaling. Do not draw a top handle, spring clip, clipboard, loose report sheet, first-aid kit, medicine bag, red cross symbol, stethoscope, readable text, extra pages or fifth object.',
};

function promptFor(item) {
  const production = item.production.map((channel) => channelInstructions[channel]).join('\n');
  return `Use case: stylized-concept
Asset type: production source sheet for one item in the Chinese pixel-art action game \u300a\u8fd9\u4e00\u8eab\u300b, targeting a 40x56 logical hero sprite
Primary request: design the complete item-specific art layers for \u201c${item.name}\u201d as a strict four-direction 2x2 source sheet
Input images:
Image 1 is the canonical palette, pixel density and outline reference.
Image 2 is the approved front/left/back/right hero proportion and direction reference; do not redraw the hero.
Image 3 is the approved torso/head anatomy-part reference.
Image 4 is the approved near/far arm anatomy-part reference.
Canon appearance: ${item.look}
Canon hero manifestation: ${item.hero}
Canon irony/event: ${item.irony}
Runtime production channels: ${item.production.join(', ')}
Item-specific disambiguation: ${itemDirectives[item.id] ?? 'Follow the canon literally and avoid replacing it with a generic fantasy or UI symbol.'}
Production requirements:
${production}
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background, with no shadow, gradient, texture, floor or lighting variation
Style/medium: restrained Chinese indie-game pixel art, hard 1-pixel-equivalent edges, deliberate clusters, muted lived-in materials, up to 8 subject colors plus outline
Composition/framing: strict 2x2 layout; top-left front, top-right left, bottom-left back, bottom-right right; equal scale and generous cell padding; no labels, separators or grid lines
Semantic direction: translate the specific irony into physical wear, tension, placement, material, absence or repetition. Do not draw a generic collectible icon and do not add unrelated melodrama.
Constraints: show only item-specific garment parts, props, decals, silhouette guides and effects; keep every component disconnected only where it is a real anatomy or rig part; preserve identical identity, palette and scale across directions; reserve blank pixel blocks where runtime text is required
Avoid: hero body, head, skin, hands, legs, complete character, UI frame, Chinese or Latin text, watermark, fantasy armor, magical ornament, photorealism, smooth vector edges, floating rods, unexplained bars, duplicate limbs, decorative clutter`;
}

function promptStatus(item) {
  if (item.id === 'small-uniform') return 'superseded-by-uniform-v1';
  if (audit.redo[item.id]) return 'redo';
  if (item.index <= audit.reviewedThrough) return 'source-approved';
  return 'pending-review';
}

await mkdir(PROMPT_DIR, { recursive: true });
const manifest = {
  version: 1,
  model: 'gpt-image-2',
  route: 'DMIT sub2 owner pool',
  intent: 'edit-with-four-project-references',
  size: '1024x1024',
  quality: 'high',
  background: '#00ff00 chroma key',
  panelOrder: ['front', 'left', 'back', 'right'],
  itemCount: contract.itemCount,
  items: [],
};

for (const item of contract.items) {
  const prompt = promptFor(item);
  const promptPath = resolve(PROMPT_DIR, `${String(item.index + 1).padStart(2, '0')}-${item.id}.txt`);
  await writeFile(promptPath, `${prompt}\n`);
  manifest.items.push({
    index: item.index,
    id: item.id,
    name: item.name,
    production: item.production,
    prompt: `prompts/${String(item.index + 1).padStart(2, '0')}-${item.id}.txt`,
    promptSha256: createHash('sha256').update(prompt).digest('hex'),
    output: `raw/${String(item.index + 1).padStart(2, '0')}-${item.id}.png`,
    status: promptStatus(item),
  });
}

await writeFile(resolve(OUTPUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(
  resolve(OUTPUT_DIR, 'redo.txt'),
  `${contract.items
    .filter((item) => audit.redo[item.id])
    .map((item) => `${String(item.index + 1).padStart(2, '0')}-${item.id}.txt`)
    .join('\n')}\n`,
);
console.log(`wrote ${manifest.items.length} item prompts -> ${OUTPUT_DIR}`);
