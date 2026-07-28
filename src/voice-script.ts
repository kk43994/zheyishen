export type VoiceCueId =
  | 'narrator-opening' | 'narrator-start-breath'
  | 'child-under-bed' | 'caregiver-lights-out' | 'caregiver-no-monster' | 'father-childhood-walk' | 'classmate-family-late' | 'school-gate-closing'
  | 'school-bell-start' | 'teacher-last-row' | 'teacher-answer-format' | 'classmate-score-whisper' | 'teacher-paper-back' | 'father-for-your-good' | 'school-bell-end'
  | 'recruiter-arrival-time' | 'landlord-rent-deposit' | 'last-bus-arrival' | 'station-yellow-line' | 'station-doors-closing' | 'last-bus-departed' | 'interview-thank-you'
  | 'phone-wife-fridge' | 'phone-hospital-not-call' | 'phone-mother-didnt-ask' | 'phone-cannot-connect' | 'father-adult-phone' | 'phone-coworker-group' | 'hero-not-busy'
  | 'family-dinner-cold' | 'hospital-family-needed' | 'hero-became-him' | 'self-stand-straight' | 'self-for-your-good'
  | 'office-badge-denied' | 'office-meeting-continues' | 'manager-tonight-hard' | 'bank-payment-due' | 'clinic-blood-pressure' | 'coworker-cardboard-box' | 'security-return-card'
  | 'clinic-next-number' | 'pharmacist-after-meals' | 'neighbor-corridor-light' | 'hospital-family-late' | 'light-room-keeper' | 'light-room-left-this' | 'back-room-keeper'
  | 'lamp-time-up' | 'lamp-return-due' | 'lamp-one-returned' | 'lamp-pockets-empty' | 'narrator-final-breath';

export type VoiceTreatment = 'clear' | 'phone' | 'pa' | 'behind-door' | 'memory' | 'swallowed' | 'exhaled';
export type VoiceRole = 'narrator' | 'father' | 'hero' | 'caregiver' | 'teacher' | 'classmate' | 'announcer' | 'recruiter' | 'landlord' | 'family' | 'wife' | 'mother' | 'nurse' | 'office' | 'manager' | 'bank' | 'doctor' | 'coworker' | 'security' | 'pharmacist' | 'neighbor' | 'room-keeper' | 'lamp-keeper';
export type VoiceEmotion = 'calm' | 'happy' | 'sad' | 'fearful' | 'surprised' | 'angry' | 'disgusted';
export type VoiceIntensity = 'low' | 'medium';
export type VoicePerformanceTag =
  | 'laughs' | 'chuckle' | 'coughs' | 'clear-throat' | 'groans' | 'breath' | 'pant' | 'inhale'
  | 'exhale' | 'gasps' | 'sniffs' | 'sighs' | 'snorts' | 'burps' | 'lip-smacking' | 'humming'
  | 'hissing' | 'emm' | 'sneezes' | 'pause';
export type VoiceTriggerEvent =
  | 'origin_ready' | 'stage_enter' | 'stage_time' | 'stand_still' | 'boss_spawn' | 'boss_phase' | 'boss_defeat'
  | 'enemy_first_kill' | 'enemy_hit' | 'enemy_count' | 'hp_below' | 'shop_open' | 'special_room_open' | 'special_room_take'
  | 'item_trigger' | 'stage_transition' | 'ending_strip' | 'ending_choice';

export interface VoiceTriggerSpec {
  event: VoiceTriggerEvent;
  atSeconds?: number;
  condition?: string;
  once: 'run' | 'stage';
  required: boolean;
  priority: 1 | 2 | 3;
  interrupt: boolean;
}

export interface VoiceCueContext {
  scene: string;
  speaker: string;
}

export interface VoiceDelivery {
  /** Stable casting direction; provider-specific voice IDs live in generation scripts. */
  voice: string;
  tone: string;
  emotion: VoiceEmotion;
  speed: number;
  pitch: number;
  intensity: VoiceIntensity;
  tags: VoicePerformanceTag[];
}

export interface VoiceCue {
  id: VoiceCueId;
  stage: 0 | 1 | 2 | 3 | 4 | 5 | 'ending';
  role: VoiceRole;
  text: string;
  performance: string;
  delivery: VoiceDelivery;
  treatment: VoiceTreatment;
  file: string;
  playbackFile?: string;
  volume: number;
  cooldownMs: number;
  trigger: VoiceTriggerSpec;
  purpose: string;
  context: VoiceCueContext;
}

/** Player-facing source labels. They keep a short line anchored to a real place and person. */
export const VOICE_CUE_CONTEXT: Record<VoiceCueId, VoiceCueContext> = {
  'narrator-opening': { scene: '出生档案', speaker: '暮年的他' },
  'narrator-start-breath': { scene: '童年门口', speaker: '暮年的他' },
  'child-under-bed': { scene: '熄灯后的卧室', speaker: '小时候的他' },
  'caregiver-lights-out': { scene: '卧室门外', speaker: '照料者' },
  'caregiver-no-monster': { scene: '卧室门外', speaker: '照料者' },
  'father-childhood-walk': { scene: '下雨那天', speaker: '父亲' },
  'classmate-family-late': { scene: '雨停后的校门', speaker: '同学' },
  'school-gate-closing': { scene: '校门口', speaker: '广播' },
  'school-bell-start': { scene: '教室', speaker: '广播' },
  'teacher-last-row': { scene: '教室后排', speaker: '老师' },
  'teacher-answer-format': { scene: '讲台前', speaker: '老师' },
  'classmate-score-whisper': { scene: '教室后排', speaker: '同学' },
  'teacher-paper-back': { scene: '教室', speaker: '老师' },
  'father-for-your-good': { scene: '放学后的校门口', speaker: '父亲' },
  'school-bell-end': { scene: '放学广播', speaker: '广播' },
  'recruiter-arrival-time': { scene: '招聘电话', speaker: '招聘方' },
  'landlord-rent-deposit': { scene: '租房电话', speaker: '房东' },
  'last-bus-arrival': { scene: '城南站台', speaker: '广播' },
  'station-yellow-line': { scene: '城南站台', speaker: '广播' },
  'station-doors-closing': { scene: '城南站台', speaker: '广播' },
  'last-bus-departed': { scene: '空下来的站台', speaker: '广播' },
  'interview-thank-you': { scene: '招聘电话', speaker: '招聘方' },
  'phone-wife-fridge': { scene: '家里来电', speaker: '老婆' },
  'phone-hospital-not-call': { scene: '医院来电', speaker: '护士' },
  'phone-mother-didnt-ask': { scene: '家里来电', speaker: '妈妈' },
  'phone-cannot-connect': { scene: '电话里', speaker: '系统提示' },
  'family-dinner-cold': { scene: '家里来电', speaker: '家里人' },
  'hospital-family-needed': { scene: '医院来电', speaker: '护士' },
  'father-adult-phone': { scene: '电话另一头', speaker: '父亲' },
  'phone-coworker-group': { scene: '工作群来电', speaker: '同事' },
  'hero-not-busy': { scene: '父亲的病历本', speaker: '他自己' },
  'hero-became-him': { scene: '屋檐下的家', speaker: '他自己' },
  'self-stand-straight': { scene: '成年后的玄关', speaker: '他自己' },
  'self-for-your-good': { scene: '成年后的玄关', speaker: '他自己' },
  'office-badge-denied': { scene: '办公楼门禁', speaker: '系统提示' },
  'office-meeting-continues': { scene: '会议室门后', speaker: '同事' },
  'manager-tonight-hard': { scene: '工作群语音', speaker: '经理' },
  'bank-payment-due': { scene: '催款电话', speaker: '银行客服' },
  'clinic-blood-pressure': { scene: '体检室', speaker: '医生' },
  'coworker-cardboard-box': { scene: '工位旁', speaker: '同事' },
  'security-return-card': { scene: '公司前台', speaker: '保安' },
  'clinic-next-number': { scene: '门诊走廊', speaker: '护士' },
  'pharmacist-after-meals': { scene: '药房窗口', speaker: '药师' },
  'neighbor-corridor-light': { scene: '楼道门外', speaker: '邻居' },
  'hospital-family-late': { scene: '病房门口', speaker: '护士' },
  'light-room-keeper': { scene: '留灯间', speaker: '看守人' },
  'light-room-left-this': { scene: '留灯间', speaker: '看守人' },
  'back-room-keeper': { scene: '里屋', speaker: '看守人' },
  'lamp-time-up': { scene: '最后一盏路灯下', speaker: '收灯人' },
  'lamp-return-due': { scene: '收灯处', speaker: '收灯人' },
  'lamp-one-returned': { scene: '收灯处', speaker: '收灯人' },
  'lamp-pockets-empty': { scene: '收灯处', speaker: '收灯人' },
  'narrator-final-breath': { scene: '最后一盏灯旁', speaker: '暮年的他' },
};

const trigger = (
  event: VoiceTriggerEvent,
  condition: string,
  required = false,
  priority: 1 | 2 | 3 = 1,
  interrupt = false,
  atSeconds?: number,
): VoiceTriggerSpec => ({ event, condition, once: 'run', required, priority, interrupt, atSeconds });

type DeliverySpec = Omit<VoiceDelivery, 'tags'>;

/** Every line has explicit synthesis direction so casting and delivery survive provider changes. */
const VOICE_DELIVERY: Record<VoiceCueId, DeliverySpec> = {
  'narrator-opening': { voice: '低沉中老年男声', tone: '自然白描，不拖字，句尾轻收', emotion: 'calm', speed: 0.88, pitch: -2, intensity: 'low' },
  'narrator-start-breath': { voice: '低沉中老年男声', tone: '像随手补记事实，不念旁白腔', emotion: 'calm', speed: 0.92, pitch: -2, intensity: 'low' },
  'child-under-bed': { voice: '自然男童声', tone: '贴近耳语，疑问上扬很轻', emotion: 'fearful', speed: 0.84, pitch: 1, intensity: 'low' },
  'caregiver-lights-out': { voice: '成年女声', tone: '门外日常叮嘱', emotion: 'calm', speed: 1.02, pitch: 0, intensity: 'low' },
  'caregiver-no-monster': { voice: '成年女声', tone: '困倦但不嘲笑', emotion: 'calm', speed: 0.98, pitch: 0, intensity: 'low' },
  'father-childhood-walk': { voice: '克制中年男声', tone: '短句落下后转身', emotion: 'calm', speed: 0.82, pitch: -2, intensity: 'low' },
  'classmate-family-late': { voice: '自然男童声', tone: '随口询问，轻微上扬', emotion: 'surprised', speed: 1.06, pitch: 1, intensity: 'low' },
  'school-gate-closing': { voice: '校园广播女声', tone: '旧广播标准口径', emotion: 'calm', speed: 0.98, pitch: 0, intensity: 'medium' },
  'school-bell-start': { voice: '校园广播女声', tone: '平直清楚', emotion: 'calm', speed: 1.00, pitch: 0, intensity: 'medium' },
  'teacher-last-row': { voice: '成熟女教师声', tone: '平静点名，字头清楚，不带训斥腔', emotion: 'calm', speed: 0.98, pitch: 0, intensity: 'medium' },
  'teacher-answer-format': { voice: '成熟女教师声', tone: '重复熟悉规定', emotion: 'calm', speed: 1.02, pitch: 0, intensity: 'medium' },
  'classmate-score-whisper': { voice: '少年男声', tone: '近处压低声音，不笑', emotion: 'surprised', speed: 0.90, pitch: 1, intensity: 'low' },
  'teacher-paper-back': { voice: '成熟女教师声', tone: '课堂顺手交代', emotion: 'calm', speed: 1.06, pitch: 0, intensity: 'medium' },
  'father-for-your-good': { voice: '克制中年男声', tone: '不容讨论的家常话', emotion: 'calm', speed: 0.80, pitch: -2, intensity: 'medium' },
  'school-bell-end': { voice: '校园广播女声', tone: '标准播报，无重音', emotion: 'calm', speed: 1.00, pitch: 0, intensity: 'medium' },
  'recruiter-arrival-time': { voice: '职业女性声', tone: '礼貌快速的流程问题', emotion: 'calm', speed: 1.15, pitch: 0, intensity: 'medium' },
  'landlord-rent-deposit': { voice: '中年女声', tone: '生活化地直接报条件，咬字清楚', emotion: 'calm', speed: 1.04, pitch: -1, intensity: 'medium' },
  'last-bus-arrival': { voice: '交通广播女声', tone: '标准站内播报', emotion: 'calm', speed: 0.98, pitch: 0, intensity: 'medium' },
  'station-yellow-line': { voice: '交通广播女声', tone: '清楚的安全提醒', emotion: 'calm', speed: 1.05, pitch: 0, intensity: 'medium' },
  'station-doors-closing': { voice: '交通广播女声', tone: '略快但不制造恐慌', emotion: 'calm', speed: 1.14, pitch: 0, intensity: 'medium' },
  'last-bus-departed': { voice: '交通广播女声', tone: '运营结束的标准口径', emotion: 'calm', speed: 0.95, pitch: 0, intensity: 'medium' },
  'interview-thank-you': { voice: '职业女性声', tone: '礼貌收尾，不暗示嘲讽', emotion: 'calm', speed: 1.10, pitch: 0, intensity: 'medium' },
  'phone-wife-fridge': { voice: '三十岁左右成年女声', tone: '平、略疲，不埋怨', emotion: 'calm', speed: 0.88, pitch: 0, intensity: 'low' },
  'phone-hospital-not-call': { voice: '疲惫护士女声', tone: '忙碌中转述原话，公事公办，不加同情腔', emotion: 'calm', speed: 1.08, pitch: -1, intensity: 'medium' },
  'phone-mother-didnt-ask': { voice: '六十岁左右女性声', tone: '轻声把父亲瞒着的事说出来，不哭', emotion: 'sad', speed: 0.80, pitch: -1, intensity: 'low' },
  'phone-cannot-connect': { voice: '电话系统女声', tone: '合成提示，字头清晰', emotion: 'calm', speed: 1.00, pitch: 0, intensity: 'medium' },
  'family-dinner-cold': { voice: '成年女声', tone: '普通询问，句尾等待回答', emotion: 'sad', speed: 0.86, pitch: -1, intensity: 'low' },
  'hospital-family-needed': { voice: '疲惫护士女声', tone: '公事公办，一口气交代完手续', emotion: 'calm', speed: 1.14, pitch: -1, intensity: 'medium' },
  'father-adult-phone': { voice: '克制中老年男声', tone: '把需要收回句尾', emotion: 'calm', speed: 0.78, pitch: -2, intensity: 'low' },
  'phone-coworker-group': { voice: '成年同事男声', tone: '快、客气，像补一条工作提醒', emotion: 'calm', speed: 1.16, pitch: 0, intensity: 'medium' },
  'hero-not-busy': { voice: '成年主角男声', tone: '照着父亲的停顿说完，自己没有意识到', emotion: 'calm', speed: 0.82, pitch: -1, intensity: 'low' },
  'hero-became-him': { voice: '成年主角男声＋父亲记忆叠层', tone: '主角先脱口而出，父亲旧声从后面贴上来', emotion: 'fearful', speed: 0.80, pitch: -1, intensity: 'low' },
  'self-stand-straight': { voice: '成年主角男声＋父亲记忆叠层', tone: '主角短句在前，父亲原声很轻地重合', emotion: 'calm', speed: 0.86, pitch: -1, intensity: 'medium' },
  'self-for-your-good': { voice: '成年主角男声＋父亲记忆叠层', tone: '主角平静复述，父亲旧声只作为回声出现', emotion: 'calm', speed: 0.84, pitch: -1, intensity: 'medium' },
  'office-badge-denied': { voice: '门禁系统女声', tone: '短促、字头清晰', emotion: 'calm', speed: 1.08, pitch: 0, intensity: 'medium' },
  'office-meeting-continues': { voice: '自然成年同事女声', tone: '隔门正常开会，不使用播报腔', emotion: 'calm', speed: 1.10, pitch: 0, intensity: 'medium' },
  'manager-tonight-hard': { voice: '成年经理男声', tone: '随口安排任务', emotion: 'calm', speed: 1.08, pitch: -1, intensity: 'medium' },
  'bank-payment-due': { voice: '客服女声', tone: '标准提醒，不威胁', emotion: 'calm', speed: 1.05, pitch: 0, intensity: 'medium' },
  'clinic-blood-pressure': { voice: '低沉中年男医生声', tone: '平常复测交代，不制造重病感', emotion: 'calm', speed: 1.00, pitch: -2, intensity: 'medium' },
  'coworker-cardboard-box': { voice: '自然成年同事男声', tone: '正常、直接，真的不知道，不发软', emotion: 'surprised', speed: 1.02, pitch: -1, intensity: 'medium' },
  'security-return-card': { voice: '中年保安男声', tone: '快速、无所谓，像每天重复很多次', emotion: 'calm', speed: 1.06, pitch: -1, intensity: 'low' },
  'clinic-next-number': { voice: '疲惫护士女声', tone: '重复了一整天，略不耐烦但仍保持职业', emotion: 'calm', speed: 1.12, pitch: -1, intensity: 'medium' },
  'pharmacist-after-meals': { voice: '低沉中年男药师声', tone: '熟练、清楚地拆分服药步骤', emotion: 'calm', speed: 1.03, pitch: -2, intensity: 'medium' },
  'neighbor-corridor-light': { voice: '年长邻居女声', tone: '隔门闲话，具体温和', emotion: 'calm', speed: 0.85, pitch: -1, intensity: 'low' },
  'hospital-family-late': { voice: '疲惫护士女声', tone: '忙碌确认流程，略不耐烦，不带安慰腔', emotion: 'calm', speed: 1.08, pitch: -1, intensity: 'medium' },
  'light-room-keeper': { voice: '年长店主男声', tone: '平常招呼，留出坐下时间', emotion: 'calm', speed: 0.84, pitch: -2, intensity: 'low' },
  'light-room-left-this': { voice: '年长店主男声', tone: '看一眼物件，只说明来历，不神秘化', emotion: 'calm', speed: 0.82, pitch: -2, intensity: 'low' },
  'back-room-keeper': { voice: '年长店主男声', tone: '说明交换条件，不诱惑', emotion: 'calm', speed: 0.83, pitch: -2, intensity: 'low' },
  'lamp-time-up': { voice: '低沉年长男声＋远近叠层', tone: '像从路灯近处和黑暗远处同时传来，平静报时', emotion: 'calm', speed: 0.72, pitch: -2, intensity: 'low' },
  'lamp-return-due': { voice: '低沉年长男声＋远近叠层', tone: '不催促，只陈述轮到这一件了', emotion: 'calm', speed: 0.76, pitch: -2, intensity: 'low' },
  'lamp-one-returned': { voice: '低沉年长男声＋远近叠层', tone: '近声先到，远声慢半拍贴上，空灵但不恐怖', emotion: 'calm', speed: 0.78, pitch: -2, intensity: 'low' },
  'lamp-pockets-empty': { voice: '低沉年长男声＋远近叠层', tone: '远近同声缓慢收拢，不催促，句间留白', emotion: 'calm', speed: 0.74, pitch: -2, intensity: 'low' },
  'narrator-final-breath': { voice: '低沉中老年男声', tone: '比开场更轻，带遗憾，不要释然得太圆满', emotion: 'sad', speed: 0.74, pitch: -2, intensity: 'low' },
};

const performanceTags = (text: string): VoicePerformanceTag[] => {
  const tags = [...text.matchAll(/\(([^)]+)\)/g)].map((match) => match[1] as VoicePerformanceTag);
  if (/<#[\d.]+#>/.test(text)) tags.push('pause');
  return [...new Set(tags)];
};

const cue = (
  id: VoiceCueId,
  stage: VoiceCue['stage'],
  role: VoiceRole,
  text: string,
  performance: string,
  treatment: VoiceTreatment,
  voiceTrigger: VoiceTriggerSpec,
  purpose: string,
  volume = 0.84,
): VoiceCue => ({
  id, stage, role, text, performance,
  delivery: { ...VOICE_DELIVERY[id], tags: performanceTags(text) },
  treatment, trigger: voiceTrigger, purpose, volume,
  context: VOICE_CUE_CONTEXT[id],
  file: `assets/audio/voice/${id}.mp3`, cooldownMs: 60_000,
  playbackFile: role === 'lamp-keeper' ? `assets/audio/voice-review/${id}.ethereal-v2.mp3` : undefined,
});

/** Fixed production script. No line is generated at runtime. */
export const VOICE_CUES: Record<VoiceCueId, VoiceCue> = {
  'narrator-opening': cue('narrator-opening', 0, 'narrator', '(inhale)他还没有名字。<#0.48#>第一口气进来以前，谁也不知道，<#0.3#>这一身会穿上什么。(exhale)', '普通中老年男性，自然说出，不拖长、不使用纪录片旁白腔。', 'clear', trigger('origin_ready', '出生档案文字完全显现', true, 3, true), '确定旁白是暮年的主角本人。'),
  'narrator-start-breath': cue('narrator-start-breath', 0, 'narrator', '后来，他开始呼吸。', '像随手补记一条事实，不抒情、不压低每个字。', 'clear', trigger('stage_enter', '童年章首次开始', true, 2), '把开场按钮变成叙事动作。'),

  'child-under-bed': cue('child-under-bed', 0, 'hero', '(breath)那里……<#0.32#>是不是有东西？', '儿童压低声音，是真的不确定。', 'clear', trigger('stand_still', '熄灯后静止3秒且140像素内没有敌人', false, 1, false, 3), '让床底怪先从孩子真实的提问里出现。'),
  'caregiver-lights-out': cue('caregiver-lights-out', 0, 'caregiver', '灯关了。<#0.3#>明天还要上学。', '门外正常说话，不凶。', 'behind-door', trigger('stage_time', '童年章第18秒', true, 1, false, 18), '交代时间和家庭现场。'),
  'caregiver-no-monster': cue('caregiver-no-monster', 0, 'caregiver', '哪有什么怪物。<#0.22#>快睡吧。', '带一点困倦，不嘲笑孩子。', 'behind-door', trigger('boss_spawn', '没人相信的怪物登场', true, 2), '怪物名字由一次真实的否认成立。'),
  'father-childhood-walk': cue('father-childhood-walk', 0, 'father', '走吧。', '雨里说完就转身，不表演温柔。', 'memory', trigger('item_trigger', '本局第一次得到父亲的雨衣', false, 2), '父亲线第一次埋点：他会做，但不会说。'),
  // 正典：学校整条线属于少年章——童年还没上学，这两条从童年章移来。
  'classmate-family-late': cue('classmate-family-late', 1, 'classmate', '你家里人，<#0.24#>还没来吗？', '孩子随口问，不带怜悯。', 'behind-door', trigger('stage_time', '少年章第52秒', true, 1, false, 52), '不解释家庭，只让玩家发现别人已经走了。'),
  'school-gate-closing': cue('school-gate-closing', 1, 'announcer', '请还未离校的同学，尽快到校门口等候。', '旧学校广播，清楚但略失真。', 'pa', trigger('stage_time', '少年章第58秒', true, 2, false, 58), '放学没人来接，接在统一答案之后。'),

  'school-bell-start': cue('school-bell-start', 1, 'announcer', '上课时间到了。请同学们回到座位。', '校园广播，平直。', 'pa', trigger('stage_enter', '少年章首次开始', true, 1), '明确少年章正在学校发生。'),
  'teacher-last-row': cue('teacher-last-row', 1, 'teacher', '最后一排。<#0.24#>站起来。', '平静、熟练，字头清楚，禁止反派腔。', 'clear', trigger('enemy_count', '场上首次同时出现6个红叉或碎语敌人', false, 2), '把公开注视变成战斗压力。'),
  'teacher-answer-format': cue('teacher-answer-format', 1, 'teacher', '过程没写。<#0.26#>这题只能给结果分。', '像重复过很多遍的规定。', 'clear', trigger('boss_spawn', '统一答案登场', true, 2), '先说规则，Boss 机制才不抽象。'),
  'classmate-score-whisper': cue('classmate-score-whisper', 1, 'classmate', '他才三十八分。', '近处小声说，不笑。', 'memory', trigger('hp_below', '少年章生命首次低于70%', false, 1), '轻声议论比集体嘲笑更真实。'),
  'teacher-paper-back': cue('teacher-paper-back', 1, 'teacher', '卷子往后传。<#0.2#>别折。', '日常课堂口径。', 'clear', trigger('boss_phase', '统一答案第一次召出红叉', false, 1), '在激烈战斗中插回一件普通小事。'),
  'father-for-your-good': cue('father-for-your-good', 1, 'father', '站好。<#0.82#>都是为你好。', '不怒吼，像一句不容讨论的家常话。', 'memory', trigger('boss_defeat', '统一答案被击败', true, 3, true), '父亲线第二次埋点，成年由主角复述。'),
  'school-bell-end': cue('school-bell-end', 1, 'announcer', '放学后请直接回家，不要在校门口逗留。', '校园广播，无额外感情。', 'pa', trigger('stage_transition', '少年向青年过渡开始', true, 2), '“直接回家”接到青年无家可回的通勤。'),

  'recruiter-arrival-time': cue('recruiter-arrival-time', 2, 'recruiter', '最快什么时候可以到岗？', '礼貌、快速，像面试最后一个问题。', 'phone', trigger('stage_enter', '青年章第4秒', true, 1, false, 4), '用一句话完成毕业到工作的切换。'),
  'landlord-rent-deposit': cue('landlord-rent-deposit', 2, 'landlord', '押一，付三。<#0.22#>水电另算。', '房东生活化地报条件，确保“押、付、另”咬字清楚。', 'phone', trigger('shop_open', '青年章第一次进入商城', false, 1), '把商城与租房现实重叠。'),
  'last-bus-arrival': cue('last-bus-arrival', 2, 'announcer', '开往城南方向的末班车已经到站。<#0.25#>请乘客有序上车。', '标准女声站内广播。', 'pa', trigger('boss_spawn', '末班车登场', true, 3, true), '真实广播先于隐喻。'),
  'station-yellow-line': cue('station-yellow-line', 2, 'announcer', '列车进站。请退到黄色安全线以内。', '清楚、无情绪。', 'pa', trigger('boss_phase', '末班车第一次冲锋前摇', true, 2), '同时承担玩法预警。'),
  'station-doors-closing': cue('station-doors-closing', 2, 'announcer', '车门即将关闭。<#0.18#>请勿冲门。', '比上一句稍快，仍不紧张表演。', 'pa', trigger('boss_phase', '末班车第二次冲锋前摇', false, 2), '把冲锋机制变成车门时限。'),
  'last-bus-departed': cue('last-bus-departed', 2, 'announcer', '本线路今日运营已经结束。<#0.38#>请从出口有序离站。', '标准广播，不加重音。', 'pa', trigger('boss_defeat', '末班车被击败', true, 3, true), '余味来自普通口径与追赶事实重合。'),
  'interview-thank-you': cue('interview-thank-you', 2, 'recruiter', '感谢你的时间。后续结果，我们会再通知。', '职业礼貌，不冷笑。', 'phone', trigger('stage_transition', '青年向成年过渡开始', false, 1), '没有明确拒绝，玩家仍然知道发生了什么。'),

  'phone-wife-fridge': cue('phone-wife-fridge', 3, 'wife', '我把你那份放冰箱了。<#0.35#>明天热一下还能吃。', '平、略疲，像已经独自处理过很多次。', 'phone', trigger('boss_phase', '响个不停固定第1通：老婆', true, 2), '第一通用不埋怨的具体生活事实建立家庭距离。'),
  'phone-hospital-not-call': cue('phone-hospital-not-call', 3, 'nurse', '他一直说，<#0.24#>不用叫你。', '疲惫护士只转述父亲原话，公事公办，不替任何人解释。', 'phone', trigger('boss_phase', '响个不停固定第3通：医院', true, 3), '父亲的沉默从家庭习惯变成正在发生的照护事实。'),
  'phone-mother-didnt-ask': cue('phone-mother-didnt-ask', 3, 'mother', '你爸，<#0.28#>没让我给你打这个电话。', '轻声、克制，不哭，不责怪。', 'phone', trigger('boss_phase', '响个不停固定第4通：妈妈', true, 3), '让父亲说没事之前，先听见他如何要求家里继续沉默。'),
  'phone-cannot-connect': cue('phone-cannot-connect', 3, 'announcer', '您拨打的用户暂时无法接通，请稍后再拨。', '真实电话系统女声。', 'phone', trigger('boss_phase', '响个不停固定第5通：他打给父亲', true, 3), '玩家主动打出去，系统提示才真正落下。'),
  'family-dinner-cold': cue('family-dinner-cold', 3, 'family', '饭热过两次了。<#0.25#>还等你吗？', '家里人的普通询问，不埋怨。', 'phone', trigger('stage_time', '成年章第18秒', false, 1, false, 18), '交代屋檐下的家为何总坐不齐。'),
  'hospital-family-needed': cue('hospital-family-needed', 3, 'nurse', '家属您好，您父亲已经收住院了。<#0.12#>麻烦尽快过来办理陪护手续。', '护士电话口径，公事公办，一口气交代手续。', 'phone', trigger('enemy_count', '累计击败3个未接来电，或成年章第26秒仍未响起', true, 2), '交代父亲为何在成年章重新出现。'),
  'father-adult-phone': cue('father-adult-phone', 3, 'father', '(clear-throat)没什么事。<#0.92#>你忙吧。', '与童年“走吧”同音色，句尾收回。', 'phone', trigger('boss_phase', '响个不停固定第6通：父亲回拨', true, 3), '父亲仍然只会把需要说成没事。'),
  'phone-coworker-group': cue('phone-coworker-group', 3, 'coworker', '群里@你了。<#0.15#>你没看到吧。', '快、客气，只确认工作消息。', 'phone', trigger('boss_phase', '响个不停固定第7通：同事', true, 2), '二阶段最后一通把玩家从医院重新拉回工作。'),
  'hero-not-busy': cue('hero-not-busy', 3, 'hero', '没事。<#0.88#>不忙。', '成年主角照着父亲刚才的停顿说完。', 'phone', trigger('boss_defeat', '响个不停结束后的固定第8通：他打给家里', true, 3, true), '用同一句否认闭合父子传承，落在父亲的病历本固定掉落页。'),
  'hero-became-him': cue('hero-became-him', 3, 'hero', '我也是……<#0.68#>(exhale)为你好。', '成年主角先脱口而出；父亲的“都是为你好”作为很轻的旧声叠在后面。', 'memory', trigger('stage_enter', '成年章入场，主角第一次听见自己说出旧句', true, 3, true), '少年从父亲那里听见的话，到成年才从主角嘴里回来；双声明确它源自父亲。'),
  'self-stand-straight': cue('self-stand-straight', 3, 'hero', '站好。', '主角短句在前，父亲同一句作为低频远声重合。', 'memory', trigger('stand_still', '成年章第一次停步让湿鞋追近', true, 2), '压力已经内化为主角自己的短句，同时让玩家听清它来自父亲。'),
  'self-for-your-good': cue('self-for-your-good', 3, 'hero', '我也是为你好。', '主角平静复述；父亲的“都是为你好”只在后方轻轻出现。', 'memory', trigger('stand_still', '成年章第二次停步让湿鞋追近', true, 3, true), '第二次停步把少年听过的完整旧句还到成年主角身上，并保留父亲来源。'),

  'office-badge-denied': cue('office-badge-denied', 4, 'office', '验证失败。请联系管理员。', '合成门禁女声，短促清晰。', 'clear', trigger('enemy_hit', '中年章第一次被打包纸箱命中', false, 2), '身份被收回先表现为门禁失败。'),
  'office-meeting-continues': cue('office-meeting-continues', 4, 'office', '下一页。<#0.2#>这个数字再往下拆一下。', '门后真实同事继续开会，不使用系统播报声。', 'behind-door', trigger('stage_time', '门禁失败后1.2秒', false, 2, false, 1.2), '世界没有为他的离开暂停。'),
  'manager-tonight-hard': cue('manager-tonight-hard', 4, 'manager', '今晚辛苦一下。<#0.2#>明早要。', '随口安排，不需要恶人语气。', 'phone', trigger('stage_time', '中年章第14秒', false, 1, false, 14), '职业压力落到具体截止时间。'),
  'bank-payment-due': cue('bank-payment-due', 4, 'bank', '您本期账单尚未结清，请留意还款日期。', '标准客服女声。', 'phone', trigger('boss_spawn', '上门催收登场', true, 2), 'Boss 有真实账单前因。'),
  'clinic-blood-pressure': cue('clinic-blood-pressure', 4, 'doctor', '血压有点高。<#0.18#>坐十分钟再量一次。', '低沉男医生的日常口径，不制造重病。', 'clear', trigger('hp_below', '中年章生命首次低于50%', false, 1), '身体衰老从普通复测开始。'),
  'coworker-cardboard-box': cue('coworker-cardboard-box', 4, 'coworker', '这个箱子，<#0.18#>是给谁的？', '同事真的不知道，正常、直接，不发软。', 'behind-door', trigger('enemy_count', '累计击败4个打包纸箱', false, 1), '不点明裁员，让玩家自己拼起来。'),
  'security-return-card': cue('security-return-card', 4, 'security', '工牌放这儿就行。', '保安快速说完，不看主角，像每天重复很多次。', 'clear', trigger('stage_transition', '中年向暮年过渡开始', true, 2), '工牌离身是暮年的入口。'),

  'clinic-next-number': cue('clinic-next-number', 5, 'nurse', '四十二号，请到三诊室。<#0.2#>陪同家属准备好证件。', '疲惫护士走廊叫号，略不耐烦但不刻薄。', 'pa', trigger('stage_enter', '暮年章第5秒', true, 1, false, 5), '暮年仍然发生在具体地点。'),
  'pharmacist-after-meals': cue('pharmacist-after-meals', 5, 'pharmacist', '这盒一天三次，饭后吃。<#0.18#>和刚才那盒隔开半小时。', '低沉男药师熟练交代用法，清晰直接。', 'clear', trigger('shop_open', '暮年章第一次进入药房摊位', false, 1), '让暮年商城成为真实药房。'),
  'neighbor-corridor-light': cue('neighbor-corridor-light', 5, 'neighbor', '楼道灯又坏了。<#0.25#>我给你留了把椅子。', '邻居隔门说，平常而具体。', 'behind-door', trigger('stand_still', '暮年章静止5秒且140像素内没有敌人', false, 1, false, 5), '不是所有照顾都来自宏大关系。'),
  'hospital-family-late': cue('hospital-family-late', 5, 'nurse', '家属还在路上吗？', '疲惫护士忙碌确认流程，略不耐烦，不带安慰腔。', 'clear', trigger('hp_below', '暮年章生命首次低于35%', false, 2), '与童年“家里人还没来吗”形成无解释回声。'),
  'light-room-keeper': cue('light-room-keeper', 5, 'room-keeper', '进来坐会儿。<#0.3#>灯还亮着。', '普通店主招呼，温暖但不神圣。', 'clear', trigger('special_room_open', '任意阶段进入留灯间', false, 2), '留灯间首先是一处能坐下来的地方。'),
  'light-room-left-this': cue('light-room-left-this', 5, 'room-keeper', '有人把它留在这儿了。', '看一眼玩家拿起的旧物，只说一条来历。', 'clear', trigger('special_room_take', '拿走标有“上一世的”普通物证', true, 2), '把跨局继承落在一个普通人的说明里，不把物件神秘化。'),
  'back-room-keeper': cue('back-room-keeper', 5, 'room-keeper', '拿走可以。<#0.35#>留点东西。', '像当铺，不邪恶、不诱惑表演。', 'behind-door', trigger('special_room_open', '任意阶段进入里屋', false, 2), '代价规则在玩家拿取前说清。'),
  'lamp-time-up': cue('lamp-time-up', 5, 'lamp-keeper', '到点了。', '声音同时从路灯下和远处黑暗传来，平静、准时，不演死神。', 'clear', trigger('boss_spawn', '收灯人在最后一盏路灯下出现', true, 3, true), '用一句报时建立收灯人的职责，而不是威胁。'),
  'lamp-return-due': cue('lamp-return-due', 5, 'lamp-keeper', '该还这一件了。', '低沉近声先到，远声轻贴；不催促，只说明轮到它。', 'clear', trigger('ending_strip', '收灯人的灯光第一次开始追逐一件道具', true, 3, true), '把收灯机制在第一次追逐前说清。'),
  'lamp-one-returned': cue('lamp-one-returned', 5, 'lamp-keeper', '这一件，<#0.42#>先还回去。', '低沉近声先到，远处同声慢半拍叠上来；空灵但禁止恐怖混响。', 'clear', trigger('ending_strip', '收灯人第一次剥下道具', true, 3, true), '终局不是打败死神，而是逐件归还。'),
  'lamp-pockets-empty': cue('lamp-pockets-empty', 5, 'lamp-keeper', '口袋空了。<#0.4#>再看看手里。', '远近叠声一起收窄，不催促，给玩家检查自己的时间。', 'clear', trigger('ending_strip', '最后一件道具离身', true, 3, true), '把注意力从这一身移到一口气。'),
  'narrator-final-breath': cue('narrator-final-breath', 'ending', 'narrator', '(inhale)手里空了。<#0.82#>这一口气，<#0.46#>也可以放下了。(exhale)', '与开场同一音色，更轻、更遗憾；不是释然地宣布圆满。', 'clear', trigger('ending_choice', '所有道具归还后，最后一次攻击重新有效', true, 3, true), '用同一次呼吸闭合开场；玩家再次攻击就是回答。'),
};

export const VOICE_CUE_IDS = Object.keys(VOICE_CUES) as VoiceCueId[];

export const STAGE_VOICE_PRELOADS: ReadonlyArray<ReadonlyArray<VoiceCueId>> = [
  ['narrator-opening', 'narrator-start-breath', 'child-under-bed', 'caregiver-lights-out', 'caregiver-no-monster', 'father-childhood-walk'],
  ['school-bell-start', 'classmate-family-late', 'school-gate-closing', 'teacher-last-row', 'teacher-answer-format', 'classmate-score-whisper', 'teacher-paper-back', 'father-for-your-good', 'school-bell-end'],
  ['recruiter-arrival-time', 'landlord-rent-deposit', 'last-bus-arrival', 'station-yellow-line', 'station-doors-closing', 'last-bus-departed', 'interview-thank-you'],
  ['phone-wife-fridge', 'phone-hospital-not-call', 'phone-mother-didnt-ask', 'phone-cannot-connect', 'father-adult-phone', 'phone-coworker-group', 'hero-not-busy', 'family-dinner-cold', 'hospital-family-needed', 'hero-became-him', 'self-stand-straight', 'self-for-your-good', 'light-room-keeper', 'light-room-left-this', 'back-room-keeper'],
  ['office-badge-denied', 'office-meeting-continues', 'manager-tonight-hard', 'bank-payment-due', 'clinic-blood-pressure', 'coworker-cardboard-box', 'security-return-card', 'light-room-keeper', 'light-room-left-this', 'back-room-keeper'],
  ['clinic-next-number', 'pharmacist-after-meals', 'neighbor-corridor-light', 'hospital-family-late', 'light-room-keeper', 'light-room-left-this', 'back-room-keeper', 'lamp-time-up', 'lamp-return-due', 'lamp-one-returned', 'lamp-pockets-empty', 'narrator-final-breath'],
];

export function validateVoiceScript(): void {
  if (VOICE_CUE_IDS.length < 30) throw new Error(`voice script requires at least 30 cues, got ${VOICE_CUE_IDS.length}`);
  const files = new Set<string>();
  for (const id of VOICE_CUE_IDS) {
    const item = VOICE_CUES[id];
    if (item.id !== id) throw new Error(`voice id mismatch: ${id}`);
    if (files.has(item.file)) throw new Error(`duplicate voice file: ${item.file}`);
    files.add(item.file);
    if (!item.trigger.condition || !item.performance || !item.purpose || !item.context.scene || !item.context.speaker) {
      throw new Error(`incomplete voice contract: ${id}`);
    }
    if (!item.delivery.voice || !item.delivery.tone || item.delivery.speed < 0.5 || item.delivery.speed > 2) {
      throw new Error(`invalid voice delivery: ${id}`);
    }
    if (!Number.isInteger(item.delivery.pitch) || item.delivery.pitch < -12 || item.delivery.pitch > 12) {
      throw new Error(`invalid voice pitch: ${id}`);
    }
    if ((item.delivery.emotion === 'sad' || item.delivery.emotion === 'fearful') && item.delivery.speed >= 1) {
      throw new Error(`sad/fearful cue must stay below speed 1: ${id}`);
    }
    const inlineTags = [...item.text.matchAll(/\(([^)]+)\)/g)].map((match) => match[1]);
    const unsupported = inlineTags.filter((tag) => !item.delivery.tags.includes(tag as VoicePerformanceTag));
    if (unsupported.length) throw new Error(`unsupported voice tags in ${id}: ${unsupported.join(', ')}`);
  }
}

validateVoiceScript();
