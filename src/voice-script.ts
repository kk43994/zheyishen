export type VoiceCueId =
  | 'origin-comic-01' | 'origin-comic-02' | 'origin-comic-03' | 'origin-comic-04'
  | 'origin-comic-05' | 'origin-comic-06' | 'origin-comic-07' | 'origin-comic-08'
  | 'narrator-opening' | 'narrator-start-breath'
  | 'child-under-bed' | 'caregiver-lights-out' | 'caregiver-no-monster' | 'boss-closet-defeat'
  | 'father-childhood-walk' | 'boss-father-phase-two' | 'classmate-family-late' | 'school-gate-closing'
  | 'school-bell-start' | 'teacher-last-row' | 'teacher-answer-format' | 'classmate-score-whisper' | 'teacher-paper-back' | 'father-for-your-good' | 'boss-father-stand' | 'school-bell-end'
  | 'recruiter-arrival-time' | 'landlord-rent-deposit' | 'last-bus-arrival' | 'station-yellow-line' | 'station-doors-closing' | 'last-bus-departed' | 'interview-thank-you'
  | 'phone-wife-fridge' | 'phone-hospital-not-call' | 'phone-mother-didnt-ask' | 'phone-cannot-connect' | 'father-adult-phone' | 'phone-coworker-group' | 'hero-not-busy'
  | 'family-dinner-cold' | 'hospital-family-needed' | 'hero-became-him' | 'self-stand-straight' | 'self-for-your-good'
  | 'office-badge-denied' | 'office-meeting-continues' | 'manager-tonight-hard' | 'bank-payment-due' | 'boss-collector-defeat'
  | 'clinic-blood-pressure' | 'coworker-cardboard-box' | 'security-return-card'
  | 'clinic-next-number' | 'pharmacist-after-meals' | 'neighbor-corridor-light' | 'hospital-family-late' | 'light-room-keeper' | 'light-room-left-this' | 'back-room-keeper'
  | 'lamp-time-up' | 'lamp-return-due' | 'lamp-one-returned' | 'lamp-pockets-empty' | 'narrator-final-breath'
  | 'boss-praise-only-you' | 'boss-praise-watch-you' | 'boss-praise-hard-work' | 'boss-praise-as-you-said'
  | 'boss-praise-one-seat' | 'boss-praise-paper' | 'boss-praise-optimize' | 'boss-praise-dismiss'
  | 'boss-praise-xiaozhang' | 'boss-meeting-over'
  | 'xiaozhang-busy-later' | 'xiaozhang-overtime' | 'caregiver-school-send' | 'caregiver-fell-again'
  | 'classmate-slept-late' | 'teacher-daydream' | 'shopkeeper-fifty-cents' | 'station-feel-unwell' | 'passerby-excuse-me'
  | 'cashier-bag-fee' | 'meeting-quarter-hard' | 'coworker-flower-water' | 'courier-timeout'
  | 'clinic-fifty-six' | 'pharmacist-self-pay' | 'bedside-son-money' | 'collector-not-yet' | 'narrator-he-fell-asleep';

export type VoiceTreatment = 'clear' | 'phone' | 'pa' | 'behind-door' | 'memory' | 'swallowed' | 'exhaled';
export type VoiceRole = 'narrator' | 'father' | 'hero' | 'caregiver' | 'teacher' | 'classmate' | 'announcer' | 'recruiter' | 'landlord' | 'family' | 'wife' | 'mother' | 'nurse' | 'office' | 'manager' | 'bank' | 'doctor' | 'coworker' | 'security' | 'pharmacist' | 'neighbor' | 'room-keeper' | 'lamp-keeper' | 'boss' | 'xiaozhang' | 'shopkeeper' | 'passerby' | 'cashier' | 'meeting' | 'courier' | 'bedside';
export type VoiceEmotion = 'calm' | 'happy' | 'sad' | 'fearful' | 'surprised' | 'angry' | 'disgusted';
export type VoiceIntensity = 'low' | 'medium';
export type VoicePerformanceTag =
  | 'laughs' | 'chuckle' | 'coughs' | 'clear-throat' | 'groans' | 'breath' | 'pant' | 'inhale'
  | 'exhale' | 'gasps' | 'sniffs' | 'sighs' | 'snorts' | 'burps' | 'lip-smacking' | 'humming'
  | 'hissing' | 'emm' | 'sneezes' | 'pause';
export type VoiceTriggerEvent =
  | 'origin_comic_scene' | 'origin_ready' | 'stage_enter' | 'stage_time' | 'stand_still' | 'boss_spawn' | 'boss_phase' | 'boss_defeat'
  | 'enemy_first_kill' | 'enemy_hit' | 'enemy_count' | 'hp_below' | 'shop_open' | 'special_room_open' | 'special_room_take'
  | 'item_trigger' | 'stage_transition' | 'ending_strip' | 'ending_choice'
  | 'npc_encounter' | 'death_save' | 'run_lost';

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

export interface VoiceSynthesisSegment {
  text: string;
  /** 句段级语速；用于避免整段像匀速播报。 */
  speed: number;
  /** 句段级响度，0.1—10；轻音不靠含糊咬字实现。 */
  volume: number;
  /** 句段级音高；收尾和内心句可比叙述句更低。 */
  pitch: number;
  emotion: VoiceEmotion;
  /** 这句话落下后真正留出的无声时间。 */
  pauseAfter: number;
  weight: 'light' | 'neutral' | 'firm';
}

/** Player-facing source labels. They keep a short line anchored to a real place and person. */
export const VOICE_CUE_CONTEXT: Record<VoiceCueId, VoiceCueContext> = {
  'origin-comic-01': { scene: '开场漫画 · 第一幕', speaker: '暮年的他' },
  'origin-comic-02': { scene: '开场漫画 · 第二幕', speaker: '暮年的他' },
  'origin-comic-03': { scene: '开场漫画 · 第三幕', speaker: '暮年的他' },
  'origin-comic-04': { scene: '开场漫画 · 第四幕', speaker: '暮年的他' },
  'origin-comic-05': { scene: '开场漫画 · 第五幕', speaker: '暮年的他' },
  'origin-comic-06': { scene: '开场漫画 · 第六幕', speaker: '暮年的他' },
  'origin-comic-07': { scene: '开场漫画 · 第七幕', speaker: '暮年的他' },
  'origin-comic-08': { scene: '开场漫画 · 第八幕', speaker: '暮年的他' },
  'narrator-opening': { scene: '出生档案', speaker: '暮年的他' },
  'narrator-start-breath': { scene: '童年门口', speaker: '暮年的他' },
  'child-under-bed': { scene: '熄灯后的卧室', speaker: '小时候的他' },
  'caregiver-lights-out': { scene: '卧室门外', speaker: '照料者' },
  'caregiver-no-monster': { scene: '卧室门外', speaker: '照料者' },
  'boss-closet-defeat': { scene: '熄灯后的卧室门外', speaker: '照料者' },
  'father-childhood-walk': { scene: '少年放学时的雨里', speaker: '父亲' },
  'boss-father-phase-two': { scene: '雨衣落下后的雨里', speaker: '年幼的父亲' },
  'classmate-family-late': { scene: '雨停后的校门', speaker: '同学' },
  'school-gate-closing': { scene: '校门口', speaker: '广播' },
  'school-bell-start': { scene: '教室', speaker: '广播' },
  'teacher-last-row': { scene: '教室后排', speaker: '老师' },
  'teacher-answer-format': { scene: '讲台前', speaker: '老师' },
  'classmate-score-whisper': { scene: '教室后排', speaker: '同学' },
  'teacher-paper-back': { scene: '教室', speaker: '老师' },
  'father-for-your-good': { scene: '放学后的校门口', speaker: '父亲' },
  'boss-father-stand': { scene: '少年雨里的父亲', speaker: '父亲' },
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
  'boss-collector-defeat': { scene: '门外的催款电话', speaker: '催收系统' },
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
  'boss-praise-only-you': { scene: '办公区那头的椅背', speaker: '领导' },
  'boss-praise-watch-you': { scene: '办公区那头的椅背', speaker: '领导' },
  'boss-praise-hard-work': { scene: '办公区那头的椅背', speaker: '领导' },
  'boss-praise-as-you-said': { scene: '《你怎么看》的标记旁', speaker: '领导' },
  'boss-praise-one-seat': { scene: '站起来的老板椅前', speaker: '领导' },
  'boss-praise-paper': { scene: '飞来的文件前', speaker: '领导' },
  'boss-praise-optimize': { scene: '被点名的岗位前', speaker: '领导' },
  'boss-praise-dismiss': { scene: '同时亮起的工位前', speaker: '领导' },
  'boss-praise-xiaozhang': { scene: '岗位只剩一个时', speaker: '领导' },
  'boss-meeting-over': { scene: '椅背上所有的嘴', speaker: '椅子' },
  'xiaozhang-busy-later': { scene: '工位边', speaker: '一起入职的小张' },
  'xiaozhang-overtime': { scene: '跟在身后', speaker: '一起入职的小张' },
  'caregiver-school-send': { scene: '出门前的玄关', speaker: '照料者' },
  'caregiver-fell-again': { scene: '门外', speaker: '照料者' },
  'classmate-slept-late': { scene: '考试前的教室', speaker: '同桌' },
  'teacher-daydream': { scene: '讲台上', speaker: '老师' },
  'shopkeeper-fifty-cents': { scene: '校门口小卖部', speaker: '小卖部老板' },
  'station-feel-unwell': { scene: '城南站台', speaker: '广播' },
  'passerby-excuse-me': { scene: '人流里', speaker: '路人' },
  'cashier-bag-fee': { scene: '超市收银台', speaker: '收银员' },
  'meeting-quarter-hard': { scene: '会议室门后', speaker: '同事' },
  'coworker-flower-water': { scene: '空出来的工位旁', speaker: '同事' },
  'courier-timeout': { scene: '写字楼过道', speaker: '外卖员' },
  'clinic-fifty-six': { scene: '门诊走廊', speaker: '叫号' },
  'pharmacist-self-pay': { scene: '药房窗口', speaker: '药师' },
  'bedside-son-money': { scene: '邻床', speaker: '同病房的老人' },
  'collector-not-yet': { scene: '倒下的地方', speaker: '收灯人' },
  'narrator-he-fell-asleep': { scene: '没走完的那一章', speaker: '暮年的他' },
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
  'origin-comic-01': { voice: '低沉中老年男声', tone: '像从很久以后回望出生；平静沧桑，不念纪录片腔', emotion: 'calm', speed: 0.71, pitch: -2, intensity: 'low' },
  'origin-comic-02': { voice: '低沉中老年男声', tone: '把两个事实并排说；门外热闹与推门迟到之间不加评判', emotion: 'calm', speed: 0.76, pitch: -2, intensity: 'low' },
  'origin-comic-03': { voice: '低沉中老年男声', tone: '“争气”与“忍气”咬字清楚，中间留白，不讽刺', emotion: 'calm', speed: 0.72, pitch: -2, intensity: 'low' },
  'origin-comic-04': { voice: '低沉中老年男声', tone: '像翻过几年旧页；自然陈述，不煽情', emotion: 'calm', speed: 0.74, pitch: -2, intensity: 'low' },
  'origin-comic-05': { voice: '低沉中老年男声', tone: '委屈说得平；最后一句略慢落下，不控诉', emotion: 'calm', speed: 0.74, pitch: -2, intensity: 'low' },
  'origin-comic-06': { voice: '低沉中老年男声', tone: '“脾气”与“骨气”咬字清楚；最后一句收轻', emotion: 'calm', speed: 0.70, pitch: -2, intensity: 'low' },
  'origin-comic-07': { voice: '低沉中老年男声', tone: '像清点穿在身上的东西；得到与失去等重，克制而非悲腔', emotion: 'calm', speed: 0.68, pitch: -2, intensity: 'low' },
  'origin-comic-08': { voice: '低沉中老年男声', tone: '三句逐级放慢；“轮到你了”贴近一点、轻一点，克制而非悲腔', emotion: 'calm', speed: 0.64, pitch: -2, intensity: 'low' },
  'narrator-opening': { voice: '低沉中老年男声', tone: '自然白描，不拖字，句尾轻收', emotion: 'calm', speed: 0.88, pitch: -2, intensity: 'low' },
  'narrator-start-breath': { voice: '低沉中老年男声', tone: '像随手补记事实，不念旁白腔', emotion: 'calm', speed: 0.92, pitch: -2, intensity: 'low' },
  'child-under-bed': { voice: '自然男童声', tone: '贴近耳语，疑问上扬很轻', emotion: 'fearful', speed: 0.84, pitch: 1, intensity: 'low' },
  'caregiver-lights-out': { voice: '成年女声', tone: '门外日常叮嘱', emotion: 'calm', speed: 1.02, pitch: 0, intensity: 'low' },
  'caregiver-no-monster': { voice: '成年女声', tone: '困倦但不嘲笑', emotion: 'calm', speed: 0.98, pitch: 0, intensity: 'low' },
  'boss-closet-defeat': { voice: '成年女声', tone: '像确认一件家常小事，仍然没有看见孩子刚经历过什么', emotion: 'calm', speed: 0.90, pitch: 0, intensity: 'low' },
  'father-childhood-walk': { voice: '克制中年男声', tone: '短句落下后转身', emotion: 'calm', speed: 0.82, pitch: -2, intensity: 'low' },
  'boss-father-phase-two': { voice: '八至十岁男童声', tone: '哭得喘不上气仍本能否认，短促、防御，不可爱化', emotion: 'fearful', speed: 0.78, pitch: 1, intensity: 'low' },
  'classmate-family-late': { voice: '自然男童声', tone: '随口询问，轻微上扬', emotion: 'surprised', speed: 1.06, pitch: 1, intensity: 'low' },
  'school-gate-closing': { voice: '校园广播女声', tone: '旧广播标准口径', emotion: 'calm', speed: 0.98, pitch: 0, intensity: 'medium' },
  'school-bell-start': { voice: '校园广播女声', tone: '平直清楚', emotion: 'calm', speed: 1.00, pitch: 0, intensity: 'medium' },
  'teacher-last-row': { voice: '成熟女教师声', tone: '平静点名，字头清楚，不带训斥腔', emotion: 'calm', speed: 0.98, pitch: 0, intensity: 'medium' },
  'teacher-answer-format': { voice: '成熟女教师声', tone: '重复熟悉规定', emotion: 'calm', speed: 1.02, pitch: 0, intensity: 'medium' },
  'classmate-score-whisper': { voice: '少年男声', tone: '近处压低声音，不笑', emotion: 'surprised', speed: 0.90, pitch: 1, intensity: 'low' },
  'teacher-paper-back': { voice: '成熟女教师声', tone: '课堂顺手交代', emotion: 'calm', speed: 1.06, pitch: 0, intensity: 'medium' },
  'father-for-your-good': { voice: '克制中年男声', tone: '不容讨论的家常话', emotion: 'calm', speed: 0.80, pitch: -2, intensity: 'medium' },
  'boss-father-stand': { voice: '克制中年男声', tone: '雨里短促命令，不怒吼', emotion: 'calm', speed: 0.80, pitch: -2, intensity: 'medium' },
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
  'boss-collector-defeat': { voice: '客服女声', tone: '系统确认口径，平直清楚，不庆祝也不安慰', emotion: 'calm', speed: 0.96, pitch: 0, intensity: 'medium' },
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
  'boss-praise-only-you': { voice: '设计音色·热络空心领导男声', tone: '夸奖像派工，句尾上扬没有温度', emotion: 'calm', speed: 1.06, pitch: -1, intensity: 'medium' },
  'boss-praise-watch-you': { voice: '设计音色·热络空心领导男声', tone: '顺口的器重', emotion: 'calm', speed: 1.06, pitch: -1, intensity: 'medium' },
  'boss-praise-hard-work': { voice: '设计音色·热络空心领导男声', tone: '把加班说成小事', emotion: 'calm', speed: 1.08, pitch: -1, intensity: 'medium' },
  'boss-praise-as-you-said': { voice: '设计音色·热络空心领导男声', tone: '采纳你的意见，也把活递给你', emotion: 'calm', speed: 1.02, pitch: -1, intensity: 'medium' },
  'boss-praise-one-seat': { voice: '设计音色·热络空心领导男声', tone: '先夸一句，再把唯一岗位说成理所当然', emotion: 'calm', speed: 0.92, pitch: -1, intensity: 'medium' },
  'boss-praise-paper': { voice: '设计音色·热络空心领导男声', tone: '像顺手递来一页文件，不给讨论余地', emotion: 'calm', speed: 1.08, pitch: -1, intensity: 'medium' },
  'boss-praise-optimize': { voice: '设计音色·热络空心领导男声', tone: '把清除一个人说成普通流程动作', emotion: 'calm', speed: 1.00, pitch: -1, intensity: 'medium' },
  'boss-praise-dismiss': { voice: '设计音色·热络空心领导男声', tone: '礼貌宣布，不怒吼，不解释', emotion: 'calm', speed: 0.96, pitch: -1, intensity: 'medium' },
  'boss-praise-xiaozhang': { voice: '设计音色·热络空心领导男声', tone: '点名以后把处罚和责任一并推回小张', emotion: 'calm', speed: 0.94, pitch: -1, intensity: 'medium' },
  'boss-meeting-over': { voice: '设计音色·领导男声，多口齐声', tone: '所有的嘴同时说这两个字', emotion: 'calm', speed: 0.90, pitch: -2, intensity: 'low' },
  'xiaozhang-busy-later': { voice: '清澈邻家青年男声', tone: '客气地把忙留给自己', emotion: 'calm', speed: 1.02, pitch: 0, intensity: 'low' },
  'xiaozhang-overtime': { voice: '清澈邻家青年男声', tone: '随口一句，不算抱怨', emotion: 'calm', speed: 0.98, pitch: 0, intensity: 'low' },
  'caregiver-school-send': { voice: '成年女声', tone: '出门前的日常叮嘱', emotion: 'calm', speed: 1.02, pitch: 0, intensity: 'low' },
  'caregiver-fell-again': { voice: '成年女声', tone: '随口安慰，疼不被承认', emotion: 'calm', speed: 0.98, pitch: 0, intensity: 'low' },
  'classmate-slept-late': { voice: '少年男声', tone: '考前压低声音的炫耀式诉苦', emotion: 'calm', speed: 1.00, pitch: 1, intensity: 'low' },
  'teacher-daydream': { voice: '成熟女教师声', tone: '顺口点名，不停下讲课', emotion: 'calm', speed: 1.00, pitch: 0, intensity: 'medium' },
  'shopkeeper-fifty-cents': { voice: '设计音色·沙哑小卖部大爷', tone: '说惯了的两个词', emotion: 'calm', speed: 0.95, pitch: -2, intensity: 'low' },
  'station-feel-unwell': { voice: '交通广播女声', tone: '标准安全播报，没人接住的关心', emotion: 'calm', speed: 1.00, pitch: 0, intensity: 'medium' },
  'passerby-excuse-me': { voice: '不羁青年男声', tone: '借过，脚步不停', emotion: 'calm', speed: 1.12, pitch: 0, intensity: 'medium' },
  'cashier-bag-fee': { voice: '青年男收银声', tone: '流程化的一问', emotion: 'calm', speed: 1.08, pitch: 0, intensity: 'medium' },
  'meeting-quarter-hard': { voice: '精英青年男声', tone: '门后的场面话', emotion: 'calm', speed: 1.05, pitch: -1, intensity: 'medium' },
  'coworker-flower-water': { voice: '率真青年男声', tone: '低声说给旁边的人听', emotion: 'calm', speed: 0.95, pitch: 0, intensity: 'low' },
  'courier-timeout': { voice: '温润青年男声', tone: '急但客气，重复的是系统的倒计时', emotion: 'calm', speed: 1.16, pitch: 0, intensity: 'medium' },
  'clinic-fifty-six': { voice: '忙碌护士女声', tone: '第二遍叫号，略提高', emotion: 'calm', speed: 1.05, pitch: 0, intensity: 'medium' },
  'pharmacist-self-pay': { voice: '中年药师声', tone: '窗口的例行确认', emotion: 'calm', speed: 1.02, pitch: -1, intensity: 'medium' },
  'bedside-son-money': { voice: '设计音色·气短病房老头', tone: '带着笑意的羡慕，说得很慢', emotion: 'calm', speed: 0.88, pitch: -2, intensity: 'low' },
  'collector-not-yet': { voice: '低沉年长男声＋远近叠层', tone: '不是宽恕，只是报时', emotion: 'calm', speed: 0.78, pitch: -2, intensity: 'low' },
  'narrator-he-fell-asleep': { voice: '低沉中老年男声', tone: '只说事实，把评价留给空白', emotion: 'sad', speed: 0.80, pitch: -2, intensity: 'low' },
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
  cooldownMs = 60_000,
): VoiceCue => ({
  id, stage, role, text, performance,
  delivery: { ...VOICE_DELIVERY[id], tags: performanceTags(text) },
  treatment, trigger: voiceTrigger, purpose, volume,
  context: VOICE_CUE_CONTEXT[id],
  file: `assets/audio/voice/${id}.mp3`, cooldownMs,
  // 收灯人的成品混音放在 voice/ 而不是 voice-review/：后者是纯评审目录，打包脚本
  // 会整个删掉、发布预算校验也把它列为禁区——指过去的话真机上收灯人整局无声（404）。
  playbackFile: role === 'lamp-keeper' ? `assets/audio/voice/${id}.ethereal-v2.mp3` : undefined,
});

/** 门外妈妈要比普通远景对白更实一点，否则在童年配乐和小扬声器上会显得轻。 */
const CAREGIVER_VOICE_VOLUME = 0.96;

/** Fixed production script. No line is generated at runtime. */
export const VOICE_CUES: Record<VoiceCueId, VoiceCue> = {
  'origin-comic-01': cue('origin-comic-01', 0, 'narrator', '人出生的时候，先哭一声。<#0.65#>那是他来到世上，领到的第一口气。', '像老人坐下来后自然开口；前句只是说事实，完整停一拍，再把“第一口气”轻轻放低，不拖尾、不表演换气。', 'clear', trigger('origin_comic_scene', '开场漫画第一幕显现', true, 3), '让开场第一声来自暮年的主角，而不是全知旁白。'),
  'origin-comic-02': cue('origin-comic-02', 0, 'narrator', '有人出生时，门外站满了人；<#0.26#>有人哭了很久，才有人推门。<#0.32#>芸芸众生，来处不同。', '三段平稳说完；第二段不卖惨，末句放慢半拍并轻收。', 'clear', trigger('origin_comic_scene', '开场漫画第二幕显现', true, 3), '把出身差异说清，但不替任何一种人生下判词。'),
  'origin-comic-03': cue('origin-comic-03', 0, 'narrator', '后来大人教他争气，<#0.28#>也教他忍气。', '“争气”略实，“忍气”略轻；停顿清楚，禁止嘲讽语气。', 'clear', trigger('origin_comic_scene', '开场漫画第三幕显现', true, 3), '建立这一口气在成长中的两种方向。'),
  'origin-comic-04': cue('origin-comic-04', 0, 'narrator', '后来他们各自长大，<#0.28#>也各自遇见，<#0.18#>各自躲不过的事。', '像翻旧档案一样自然推进；三个“各自”不做朗诵式重音。', 'clear', trigger('origin_comic_scene', '开场漫画第四幕显现', true, 3), '从共同出生推到各自不同的劫。'),
  'origin-comic-05': cue('origin-comic-05', 0, 'narrator', '受了委屈，咽下去叫懂事；<#0.22#>吐出来，又有人说他不懂事。<#0.32#>每种选择，都有所得，也有所失。', '前两段平静并列，不控诉；最后一句放慢一点，得失两个词等重。', 'clear', trigger('origin_comic_scene', '开场漫画第五幕显现', true, 3), '把玩家之后的咽下与吐出变成选择，而不是标准答案。'),
  'origin-comic-06': cue('origin-comic-06', 0, 'narrator', '有些气成了脾气，<#0.18#>有些气撑成了骨气，<#0.28#>还有一些，一直留在身体里。', '“脾气、骨气”咬字清楚但不喊；最后一段声音收窄，像说到自己。', 'clear', trigger('origin_comic_scene', '开场漫画第六幕显现', true, 3), '把经历如何留在身体里说成具体变化。'),
  'origin-comic-07': cue('origin-comic-07', 0, 'narrator', '得到的，穿在身上；<#0.2#>失去的，也穿在身上。<#0.34#>芸芸众生，各有各的这一身。', '得与失保持同样分量；末句沧桑但克制，不拔高。', 'clear', trigger('origin_comic_scene', '开场漫画第七幕显现', true, 3), '把玩法名与一生携带的得失合在一起。'),
  'origin-comic-08': cue('origin-comic-08', 0, 'narrator', '这一身并非生来如此，<#0.34#>而是被这一生，一件件穿成的。<#0.52#>(breath)现在，<#0.22#>轮到你了。(exhale)', '前两句缓慢落定；长停顿后靠近话筒，最后四字轻而清楚，呼气自然消失。', 'clear', trigger('origin_comic_scene', '开场漫画第八幕显现', true, 3), '把解释权交还给玩家，进入他的这一生。'),
  'narrator-opening': cue('narrator-opening', 0, 'narrator', '(inhale)他还没有名字。<#0.48#>第一口气进来以前，谁也不知道，<#0.3#>这一身会穿上什么。(exhale)', '普通中老年男性，自然说出，不拖长、不使用纪录片旁白腔。', 'clear', trigger('origin_ready', '出生档案文字完全显现', true, 3, true), '确定旁白是暮年的主角本人。'),
  'narrator-start-breath': cue('narrator-start-breath', 0, 'narrator', '后来，他开始呼吸。', '像随手补记一条事实，不抒情、不压低每个字。', 'clear', trigger('stage_enter', '童年章首次开始', true, 2), '把开场按钮变成叙事动作。'),

  'child-under-bed': cue('child-under-bed', 0, 'hero', '(breath)那里……<#0.32#>是不是有东西？', '儿童压低声音，是真的不确定。', 'clear', trigger('stage_time', '童年第22秒、照料者关灯台词结束后', true, 2, false, 22), '让童年怪物必然先从孩子真实的提问里出现，再让衣架走出来。'),
  'caregiver-lights-out': cue('caregiver-lights-out', 0, 'caregiver', '灯关了。<#0.3#>明天还要上学。', '门外正常说话，不凶。', 'behind-door', trigger('stage_time', '童年章第18秒', true, 1, false, 18), '交代时间和家庭现场。', CAREGIVER_VOICE_VOLUME),
  'caregiver-no-monster': cue('caregiver-no-monster', 0, 'caregiver', '哪有什么怪物。<#0.22#>快睡吧。', '带一点困倦，不嘲笑孩子。', 'behind-door', trigger('boss_spawn', '没人相信的怪物登场', true, 2), '怪物名字由一次真实的否认成立。', CAREGIVER_VOICE_VOLUME),
  'boss-closet-defeat': cue('boss-closet-defeat', 0, 'caregiver', '好了。<#0.34#>里面什么也没有。', '门外像确认一件家常小事，不知道孩子刚才真的看见过。', 'behind-door', trigger('boss_defeat', '没人相信的怪物被击败', true, 3, true), '击败怪物没有换来被相信；日常否认成为童年章最后一个声音。', CAREGIVER_VOICE_VOLUME),
  // 资源 ID 沿用旧名以保持存档和成品音频兼容；正典归属是少年放学雨夜。
  'father-childhood-walk': cue('father-childhood-walk', 1, 'father', '走吧。', '雨里说完就转身，不表演温柔。', 'memory', trigger('boss_defeat', '沉默的父亲被击败、雨衣落在地上', true, 3, true), '父亲线在击败的一刻落地：他会做，但不会多说。'),
  'boss-father-phase-two': cue('boss-father-phase-two', 1, 'father', '(sniffs)我没有哭。', '八至十岁的男孩哭得喘不上气，仍本能地否认；短促、防御，不可爱化。', 'clear', trigger('boss_phase', '沉默的父亲雨衣倒下、二阶段短句落下', true, 3, true), '让二阶段揭示不只依靠画面和字幕：雨衣里的父亲仍是那个不敢承认疼的孩子。'),
  // 正典：学校整条线属于少年章——童年还没上学，这两条从童年章移来。
  'classmate-family-late': cue('classmate-family-late', 1, 'classmate', '你家里人，<#0.24#>还没来吗？', '孩子随口问，不带怜悯。', 'behind-door', trigger('stage_time', '少年章第52秒', true, 1, false, 52), '不解释家庭，只让玩家发现别人已经走了。'),
  'school-gate-closing': cue('school-gate-closing', 1, 'announcer', '请还未离校的同学，尽快到校门口等候。', '旧学校广播，清楚但略失真。', 'pa', trigger('stage_time', '少年章第58秒', true, 2, false, 58), '放学没人来接，接在统一答案之后。'),

  'school-bell-start': cue('school-bell-start', 1, 'announcer', '上课时间到了。请同学们回到座位。', '校园广播，平直。', 'pa', trigger('stage_enter', '少年章首次开始', true, 1), '明确少年章正在学校发生。'),
  'teacher-last-row': cue('teacher-last-row', 1, 'teacher', '最后一排。<#0.24#>站起来。', '平静、熟练，字头清楚，禁止反派腔。', 'clear', trigger('enemy_count', '场上首次同时出现6个红叉或碎语敌人', false, 2), '把公开注视变成战斗压力。'),
  'teacher-answer-format': cue('teacher-answer-format', 1, 'teacher', '过程没写。<#0.26#>这题只能给结果分。', '像重复过很多遍的规定。', 'clear', trigger('boss_spawn', '统一答案登场', true, 2), '先说规则，Boss 机制才不抽象。'),
  'classmate-score-whisper': cue('classmate-score-whisper', 1, 'classmate', '他才三十八分。', '近处小声说，不笑。', 'memory', trigger('hp_below', '少年章生命首次低于70%', false, 1), '轻声议论比集体嘲笑更真实。'),
  'teacher-paper-back': cue('teacher-paper-back', 1, 'teacher', '卷子往后传。<#0.2#>别折。', '日常课堂口径。', 'clear', trigger('boss_phase', '统一答案第一次召出红叉', false, 1), '在激烈战斗中插回一件普通小事。'),
  'father-for-your-good': cue('father-for-your-good', 1, 'father', '站好。<#0.82#>都是为你好。', '不怒吼，像一句不容讨论的家常话。', 'memory', trigger('boss_defeat', '统一答案被击败', true, 3, true), '父亲线第二次埋点，成年由主角复述。'),
  'boss-father-stand': cue('boss-father-stand', 1, 'father', '站好。', '雨里短促地说，不怒吼。', 'clear', trigger('boss_phase', '沉默的父亲一阶段第一次使用《站好》', true, 2), '招式文字与父亲原声同时落下，避免父亲战只剩无声字幕。', 0.9),
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
  'father-adult-phone': cue('father-adult-phone', 3, 'father', '(clear-throat)没什么事。<#0.92#>你忙吧。', '与少年雨中“走吧”同音色，句尾收回。', 'phone', trigger('boss_phase', '响个不停固定第6通：父亲回拨', true, 3), '父亲仍然只会把需要说成没事。'),
  'phone-coworker-group': cue('phone-coworker-group', 3, 'coworker', '群里@你了。<#0.15#>你没看到吧。', '快、客气，只确认工作消息。', 'phone', trigger('boss_phase', '响个不停固定第7通：同事', true, 2), '二阶段最后一通把玩家从医院重新拉回工作。'),
  'hero-not-busy': cue('hero-not-busy', 3, 'hero', '没事。<#0.88#>不忙。', '成年主角照着父亲刚才的停顿说完。', 'phone', trigger('boss_defeat', '响个不停结束后的固定第8通：他打给家里', true, 3, true), '用同一句否认闭合父子传承，落在父亲的病历本固定掉落页。'),
  'hero-became-him': cue('hero-became-him', 3, 'hero', '我也是……<#0.68#>(exhale)为你好。', '成年主角先脱口而出；父亲的“都是为你好”作为很轻的旧声叠在后面。', 'memory', trigger('stage_enter', '成年章入场，主角第一次听见自己说出旧句', true, 3, true), '少年从父亲那里听见的话，到成年才从主角嘴里回来；双声明确它源自父亲。'),
  'self-stand-straight': cue('self-stand-straight', 3, 'hero', '站好。', '主角短句在前，父亲同一句作为低频远声重合。', 'memory', trigger('stand_still', '成年章第一次停步让湿鞋追近', true, 2), '压力已经内化为主角自己的短句，同时让玩家听清它来自父亲。'),
  'self-for-your-good': cue('self-for-your-good', 3, 'hero', '我也是为你好。', '主角平静复述；父亲的“都是为你好”只在后方轻轻出现。', 'memory', trigger('stand_still', '成年章第二次停步让湿鞋追近', true, 3, true), '第二次停步把少年听过的完整旧句还到成年主角身上，并保留父亲来源。'),

  'office-badge-denied': cue('office-badge-denied', 4, 'office', '验证失败。请联系管理员。', '合成门禁女声，短促清晰。', 'clear', trigger('enemy_hit', '中年章第一次被打包纸箱命中', false, 2), '身份被收回先表现为门禁失败。'),
  'office-meeting-continues': cue('office-meeting-continues', 4, 'office', '下一页。<#0.2#>这个数字再往下拆一下。', '门后真实同事继续开会，不使用系统播报声。', 'behind-door', trigger('stage_time', '门禁失败后1.2秒', false, 2, false, 1.2), '世界没有为他的离开暂停。'),
  'manager-tonight-hard': cue('manager-tonight-hard', 4, 'manager', '今晚辛苦一下。<#0.2#>明早要。', '随口安排，不需要恶人语气。', 'phone', trigger('stage_time', '中年章第14秒', false, 1, false, 14), '职业压力落到具体截止时间。'),
  'bank-payment-due': cue('bank-payment-due', 4, 'bank', '您本期账单尚未结清，请留意还款日期。', '标准客服女声。', 'phone', trigger('boss_spawn', '上门催收登场', true, 2), 'Boss 有真实账单前因。'),
  'boss-collector-defeat': cue('boss-collector-defeat', 4, 'bank', '本次欠款，<#0.28#>已经结清。', '系统确认口径，平直清楚，不庆祝也不安慰。', 'phone', trigger('boss_defeat', '上门催收被击败', true, 3, true), '战斗结束只结清这一笔；日光灯和下一张账单仍然留着。'),
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
  // 每剥下一件都要响一次。默认 60 秒冷却会把第二件之后的全部吃掉——收灯周期是
  // LAMP_CYCLE_INTERVAL 8.5 秒，台词约 2.5 秒，4 秒冷却既保证件件都念，又不会自相打断。
  'lamp-one-returned': cue('lamp-one-returned', 5, 'lamp-keeper', '这一件，<#0.42#>先还回去。', '低沉近声先到，远处同声慢半拍叠上来；空灵但禁止恐怖混响。', 'clear', trigger('ending_strip', '收灯人每剥下一件道具', true, 3, true), '终局不是打败死神，而是逐件归还。', 0.84, 4_000),
  'lamp-pockets-empty': cue('lamp-pockets-empty', 5, 'lamp-keeper', '口袋空了。<#0.4#>再看看手里。', '远近叠声一起收窄，不催促，给玩家检查自己的时间。', 'clear', trigger('ending_strip', '最后一件道具离身', true, 3, true), '把注意力从这一身移到一口气。'),
  'narrator-final-breath': cue('narrator-final-breath', 'ending', 'narrator', '(inhale)手里空了。<#0.82#>这一口气，<#0.46#>也可以放下了。(exhale)', '与开场同一音色，更轻、更遗憾；不是释然地宣布圆满。', 'clear', trigger('ending_choice', '所有道具归还后，最后一次攻击重新有效', true, 3, true), '用同一次呼吸闭合开场；玩家再次攻击就是回答。'),
  'boss-praise-only-you': cue('boss-praise-only-you', 2, 'boss', '这个只有你能做。', '热络得像发任务，句尾上扬却没有温度。', 'clear', trigger('boss_phase', '你很优秀一阶段推出任务波并给出伤害好话', false, 1), '加成是真的，好话也是真的——这正是它可怕的地方。', 0.8, 9_000),
  'boss-praise-watch-you': cue('boss-praise-watch-you', 2, 'boss', '我看好你。', '顺口的器重，说完人已经在看下一份文件。', 'clear', trigger('boss_phase', '你很优秀一阶段给出攻速好话', false, 1), '被看好的代价是被继续使用。', 0.8, 9_000),
  'boss-praise-hard-work': cue('boss-praise-hard-work', 2, 'boss', '辛苦一下。', '把加班说成小事的口吻。', 'clear', trigger('boss_phase', '你很优秀一阶段给出移速好话', false, 1), '「一下」是这句话里唯一的谎。', 0.8, 9_000),
  'boss-praise-as-you-said': cue('boss-praise-as-you-said', 2, 'boss', '很好，就按你说的办。', '采纳你的意见，也把活递给你。', 'clear', trigger('boss_phase', '玩家踩下《你怎么看》标记', false, 2), '主动走过去的那一步是玩家自己选的。', 0.82, 20_000),
  'boss-praise-one-seat': cue('boss-praise-one-seat', 2, 'boss', '你很优秀。<#0.32#>可岗位，只有一个。', '先夸一句，再把唯一岗位说成理所当然。', 'clear', trigger('boss_phase', '你很优秀站起、进入二阶段', true, 3, true), '二阶段第一次开口就拆掉一阶段夸奖的伪装。', 0.84, 20_000),
  'boss-praise-paper': cue('boss-praise-paper', 2, 'boss', '这份，<#0.16#>下班前给我。', '像顺手递来一页文件，不给讨论余地。', 'clear', trigger('boss_phase', '二阶段《这个下班前给我》前摇', false, 2), '让文件攻击先由一句熟悉的工作口径成立。', 0.82, 12_000),
  'boss-praise-optimize': cue('boss-praise-optimize', 2, 'boss', '这个，<#0.18#>优化掉。', '把清除一个人说成普通流程动作。', 'clear', trigger('boss_phase', '二阶段《优化》点名岗位', false, 2), '“优化”不再只是屏幕上的技能名，而是老板亲口下的决定。', 0.82, 12_000),
  'boss-praise-dismiss': cue('boss-praise-dismiss', 2, 'boss', '你可以离职了。', '礼貌宣布，不怒吼，不解释。', 'clear', trigger('boss_phase', '二阶段《离职》点亮所有积压任务', false, 2), '最重的处罚保持最日常的语气。', 0.82, 12_000),
  'boss-praise-xiaozhang': cue('boss-praise-xiaozhang', 2, 'boss', '小张，<#0.28#>你自己看着办。', '点名以后把处罚和责任一并推回小张。', 'clear', trigger('boss_phase', '岗位只剩一个且小张被迫背刺', false, 3, true), '只在帮助过小张却仍被岗位机制反噬的剧情分支响起。', 0.84, 20_000),
  'boss-meeting-over': cue('boss-meeting-over', 2, 'boss', '散会。', '椅背上所有的嘴同时说，只说这两个字。', 'clear', trigger('boss_defeat', '你很优秀被击败', true, 3, true), '椅子空出来了，马上会有人坐进去——这句留给玩家自己想。', 0.78),
  'xiaozhang-busy-later': cue('xiaozhang-busy-later', 2, 'xiaozhang', '你先忙，我这边还有点没弄完。', '客气地把忙留给自己。', 'clear', trigger('npc_encounter', '碰到一起入职的小张弹出选择框', false, 2), '他后来在岗位混战里活下来的方式，也是这句。'),
  'xiaozhang-overtime': cue('xiaozhang-overtime', 2, 'xiaozhang', '今晚又得加班了。', '随口一句，不算抱怨。', 'clear', trigger('stage_time', '帮助小张20秒后他跟随时随口说', false, 1, false, 20), '友军也在撑。'),
  'caregiver-school-send': cue('caregiver-school-send', 0, 'caregiver', '书包背好了吗？<#0.3#>路上慢点。', '出门前的日常叮嘱，不看着他说。', 'behind-door', trigger('stage_transition', '童年结束、进入少年学校前', true, 2), '童年结束时的日常送别，接到少年章校园广播。', CAREGIVER_VOICE_VOLUME),
  'caregiver-fell-again': cue('caregiver-fell-again', 0, 'caregiver', '男孩子，摔摔没事的。', '门外随口安慰。', 'behind-door', trigger('hp_below', '童年章生命首次低于60%', false, 1), '疼不被承认，是从很小开始的。', CAREGIVER_VOICE_VOLUME),
  'classmate-slept-late': cue('classmate-slept-late', 1, 'classmate', '我昨晚一点才睡。', '考前压低声音的炫耀式诉苦。', 'clear', trigger('stage_time', '少年章第30秒', false, 1, false, 30), '考试前的谎言日常。'),
  'teacher-daydream': cue('teacher-daydream', 1, 'teacher', '发什么呆？', '顺口点名，不停下讲课。', 'clear', trigger('stand_still', '少年章静止3秒且附近没有敌人', false, 1, false, 3), '静止惩罚的少年版。'),
  'shopkeeper-fifty-cents': cue('shopkeeper-fifty-cents', 1, 'shopkeeper', '同学，五毛。', '说惯了的两个词，眼睛没离开电视。', 'clear', trigger('shop_open', '少年章第一次打开小卖部', false, 1), '让商店有地点、有人。'),
  'station-feel-unwell': cue('station-feel-unwell', 2, 'announcer', '如遇身体不适，请联系站台工作人员。', '标准安全播报。', 'pa', trigger('hp_below', '青年章生命首次低于50%', false, 1), '制式播报里藏一句没人接住的关心。'),
  'passerby-excuse-me': cue('passerby-excuse-me', 2, 'passerby', '让一让，谢谢。', '借过，脚步不停。', 'clear', trigger('stand_still', '青年章静止3秒', false, 1, false, 3), '人流不会为任何人停。'),
  'cashier-bag-fee': cue('cashier-bag-fee', 3, 'cashier', '袋子要吗？<#0.2#>四毛。', '流程化的一问。', 'clear', trigger('shop_open', '成年章第一次打开商店', false, 1), '生活的价格精确到毛。'),
  'meeting-quarter-hard': cue('meeting-quarter-hard', 4, 'meeting', '这个季度大家都不容易。', '门后的场面话。', 'behind-door', trigger('stage_time', '门禁失败后7.5秒，会议还在继续', false, 1), '门里门外是两个世界。'),
  'coworker-flower-water': cue('coworker-flower-water', 4, 'coworker', '他工位那盆花，没人浇了。', '低声说给旁边的人听。', 'clear', trigger('enemy_count', '累计击败8个打包纸箱', false, 1), '裁员不点破，只剩一盆花。', 0.7),
  'courier-timeout': cue('courier-timeout', 4, 'courier', '麻烦让一下，<#0.15#>超时了超时了。', '急但客气，重复的是系统的倒计时。', 'clear', trigger('stand_still', '中年章静止3秒', false, 1, false, 3), '连站着不动都在挡别人赶时间。'),
  'clinic-fifty-six': cue('clinic-fifty-six', 5, 'nurse', '五十六号。<#0.4#>五十六号到了没有？', '第二遍叫号，略提高音量。', 'pa', trigger('stage_time', '暮年章第40秒', false, 1, false, 40), '叫号没人应——也许就是他没力气应。'),
  'pharmacist-self-pay': cue('pharmacist-self-pay', 5, 'pharmacist', '这个自费的，要吗？', '窗口的例行确认。', 'clear', trigger('shop_open', '暮年章第二次打开药房', false, 1), '健康是分档的。'),
  'bedside-son-money': cue('bedside-son-money', 5, 'bedside', '你儿子又打钱来了吧。', '带着笑意的羡慕，说得很慢。', 'clear', trigger('hp_below', '暮年章生命首次低于50%', false, 1), '邻床的羡慕，比探望更常来。'),
  'collector-not-yet': cue('collector-not-yet', 5, 'lamp-keeper', '还不是时候。', '不是宽恕，只是报时。', 'clear', trigger('death_save', '免死道具生效的瞬间', false, 3, true), '免死瞬间由收灯人亲口盖章。', 0.84, 20_000),
  'narrator-he-fell-asleep': cue('narrator-he-fell-asleep', 'ending', 'narrator', '他睡着了。', '只说事实，把评价留给空白。', 'clear', trigger('run_lost', '战败结算开始', false, 2), '战败不需要审判，一句轻的就够重了。'),
};

/**
 * 开场漫画每幕只做一次连续合成，避免硬拼短句切断气息。
 * pauseAfter 会转成 MiniMax 原生停顿标签；其余字段是表演规划和人工复听标记，
 * 用来描述句内轻重、落句和字幕节拍，不把一句话拆成多段音频。
 */
export const VOICE_SYNTHESIS_SEGMENTS: Partial<Record<VoiceCueId, readonly VoiceSynthesisSegment[]>> = {
  'origin-comic-01': [
    { text: '人出生的时候，先哭一声。', speed: 0.72, volume: 0.88, pitch: -2, emotion: 'calm', pauseAfter: 0.65, weight: 'neutral' },
    { text: '那是他来到世上，领到的第一口气。', speed: 0.62, volume: 0.78, pitch: -3, emotion: 'calm', pauseAfter: 0, weight: 'light' },
  ],
  'origin-comic-02': [
    { text: '有人出生时，门外站满了人。', speed: 0.80, volume: 0.90, pitch: -2, emotion: 'calm', pauseAfter: 0.36, weight: 'neutral' },
    { text: '有人哭了很久，才有人推门。', speed: 0.72, volume: 0.84, pitch: -2, emotion: 'calm', pauseAfter: 0.58, weight: 'light' },
    { text: '芸芸众生，来处不同。', speed: 0.62, volume: 0.78, pitch: -3, emotion: 'calm', pauseAfter: 0, weight: 'light' },
  ],
  'origin-comic-03': [
    { text: '后来，大人教他争气。', speed: 0.75, volume: 0.92, pitch: -2, emotion: 'calm', pauseAfter: 0.52, weight: 'firm' },
    { text: '也教他忍气。', speed: 0.60, volume: 0.74, pitch: -3, emotion: 'calm', pauseAfter: 0, weight: 'light' },
  ],
  'origin-comic-04': [
    { text: '后来，他们各自长大。', speed: 0.76, volume: 0.88, pitch: -2, emotion: 'calm', pauseAfter: 0.44, weight: 'neutral' },
    { text: '也各自遇见，各自躲不过的事。', speed: 0.66, volume: 0.80, pitch: -3, emotion: 'calm', pauseAfter: 0, weight: 'light' },
  ],
  'origin-comic-05': [
    { text: '受了委屈，咽下去，叫懂事。', speed: 0.76, volume: 0.84, pitch: -2, emotion: 'calm', pauseAfter: 0.44, weight: 'neutral' },
    { text: '吐出来，又有人说他不懂事。', speed: 0.72, volume: 0.88, pitch: -2, emotion: 'calm', pauseAfter: 0.62, weight: 'firm' },
    { text: '每种选择，都有所得，也有所失。', speed: 0.62, volume: 0.76, pitch: -3, emotion: 'calm', pauseAfter: 0, weight: 'light' },
  ],
  'origin-comic-06': [
    { text: '有些气，成了脾气。', speed: 0.74, volume: 0.84, pitch: -2, emotion: 'calm', pauseAfter: 0.34, weight: 'neutral' },
    { text: '有些气，撑成了骨气。', speed: 0.68, volume: 0.92, pitch: -2, emotion: 'calm', pauseAfter: 0.58, weight: 'firm' },
    { text: '还有一些，一直留在身体里。', speed: 0.58, volume: 0.74, pitch: -3, emotion: 'calm', pauseAfter: 0, weight: 'light' },
  ],
  'origin-comic-07': [
    { text: '得到的，穿在身上。', speed: 0.70, volume: 0.84, pitch: -2, emotion: 'calm', pauseAfter: 0.40, weight: 'neutral' },
    { text: '失去的，也穿在身上。', speed: 0.66, volume: 0.82, pitch: -2, emotion: 'calm', pauseAfter: 0.64, weight: 'neutral' },
    { text: '芸芸众生，各有各的这一身。', speed: 0.58, volume: 0.74, pitch: -3, emotion: 'calm', pauseAfter: 0, weight: 'light' },
  ],
  'origin-comic-08': [
    { text: '这一身，并非生来如此。', speed: 0.70, volume: 0.82, pitch: -2, emotion: 'calm', pauseAfter: 0.56, weight: 'neutral' },
    { text: '而是被这一生，一件件，穿成的。', speed: 0.64, volume: 0.78, pitch: -3, emotion: 'calm', pauseAfter: 0.86, weight: 'light' },
    { text: '(breath)现在。', speed: 0.58, volume: 0.70, pitch: -3, emotion: 'calm', pauseAfter: 0.46, weight: 'light' },
    { text: '轮到你了。(exhale)', speed: 0.54, volume: 0.72, pitch: -3, emotion: 'calm', pauseAfter: 0, weight: 'light' },
  ],
};

export const VOICE_CUE_IDS = Object.keys(VOICE_CUES) as VoiceCueId[];

/** 出生漫画整体略快于成品音频；幕时长、字幕推进与播放速率必须共用这一个系数。 */
export const ORIGIN_COMIC_PACE = 1.12;

export function voicePlaybackRate(id: VoiceCueId, treatment?: VoiceTreatment): number {
  if (id.startsWith('origin-comic-')) return ORIGIN_COMIC_PACE;
  return treatment === 'swallowed' ? 0.96 : treatment === 'exhaled' ? 1.02 : 1;
}

export const STAGE_VOICE_PRELOADS: ReadonlyArray<ReadonlyArray<VoiceCueId>> = [
  ['origin-comic-01', 'origin-comic-02', 'origin-comic-03', 'origin-comic-04', 'origin-comic-05', 'origin-comic-06', 'origin-comic-07', 'origin-comic-08', 'narrator-opening', 'narrator-start-breath', 'child-under-bed', 'caregiver-lights-out', 'caregiver-no-monster', 'boss-closet-defeat', 'caregiver-school-send', 'caregiver-fell-again', 'narrator-he-fell-asleep'],
  ['school-bell-start', 'classmate-family-late', 'school-gate-closing', 'teacher-last-row', 'teacher-answer-format', 'classmate-score-whisper', 'teacher-paper-back', 'father-for-your-good', 'boss-father-stand', 'father-childhood-walk', 'boss-father-phase-two', 'school-bell-end', 'classmate-slept-late', 'teacher-daydream', 'shopkeeper-fifty-cents'],
  ['recruiter-arrival-time', 'landlord-rent-deposit', 'last-bus-arrival', 'station-yellow-line', 'station-doors-closing', 'last-bus-departed', 'interview-thank-you', 'boss-praise-only-you', 'boss-praise-watch-you', 'boss-praise-hard-work', 'boss-praise-as-you-said', 'boss-praise-one-seat', 'boss-praise-paper', 'boss-praise-optimize', 'boss-praise-dismiss', 'boss-praise-xiaozhang', 'boss-meeting-over', 'xiaozhang-busy-later', 'xiaozhang-overtime', 'station-feel-unwell', 'passerby-excuse-me'],
  ['phone-wife-fridge', 'phone-hospital-not-call', 'phone-mother-didnt-ask', 'phone-cannot-connect', 'father-adult-phone', 'phone-coworker-group', 'hero-not-busy', 'family-dinner-cold', 'hospital-family-needed', 'hero-became-him', 'self-stand-straight', 'self-for-your-good', 'light-room-keeper', 'light-room-left-this', 'back-room-keeper', 'cashier-bag-fee'],
  ['office-badge-denied', 'office-meeting-continues', 'manager-tonight-hard', 'bank-payment-due', 'boss-collector-defeat', 'clinic-blood-pressure', 'coworker-cardboard-box', 'security-return-card', 'light-room-keeper', 'light-room-left-this', 'back-room-keeper', 'meeting-quarter-hard', 'coworker-flower-water', 'courier-timeout'],
  ['clinic-next-number', 'pharmacist-after-meals', 'neighbor-corridor-light', 'hospital-family-late', 'light-room-keeper', 'light-room-left-this', 'back-room-keeper', 'lamp-time-up', 'lamp-return-due', 'lamp-one-returned', 'lamp-pockets-empty', 'narrator-final-breath', 'clinic-fifty-six', 'pharmacist-self-pay', 'bedside-son-money', 'collector-not-yet'],
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
    const synthesisSegments = VOICE_SYNTHESIS_SEGMENTS[id];
    if (synthesisSegments) {
      const spoken = (text: string) => text
        .replace(/<#[\d.]+#>/g, '')
        .replace(/\([a-z-]+\)/g, '')
        .replace(/[，。；、！？\s]/g, '');
      if (spoken(synthesisSegments.map((segment) => segment.text).join('')) !== spoken(item.text)) {
        throw new Error(`synthesis segments do not match cue text: ${id}`);
      }
      synthesisSegments.forEach((segment, segmentIndex) => {
        if (segment.speed < 0.5 || segment.speed > 2
          || segment.volume < 0.1 || segment.volume > 10
          || !Number.isInteger(segment.pitch) || segment.pitch < -12 || segment.pitch > 12
          || segment.pauseAfter < 0 || segment.pauseAfter > 5) {
          throw new Error(`invalid synthesis segment: ${id}[${segmentIndex}]`);
        }
      });
    }
  }
}

validateVoiceScript();
