import type { ItemDefinition, ItemId } from './types';

export const ITEM_DEFINITIONS: Record<ItemId, ItemDefinition> = {
  'loose-button': {
    id: 'loose-button', name: '校服上掉下来的纽扣', quality: 1, qualityName: '杂物', slot: 'chest', glyph: '扣',
    flavor: '他把它攥了一整天。', summary: '规律地多射一发', positive: '每第3轮攻击额外+1弹', negative: '没有负面作用', price: 4, color: '#aaa69d',
  },
  'wooden-sword': {
    id: 'wooden-sword', name: '床底下的木剑', quality: 1, qualityName: '杂物', slot: 'back', glyph: '剑',
    flavor: '黑暗里，它确实锋利过。', summary: '近距离重击', positive: '伤害+45% · 弹宽+30%', negative: '射程-35%', price: 5, color: '#9a754d',
  },
  'red-workbook': {
    id: 'red-workbook', name: '写满红叉的练习册', quality: 2, qualityName: '旧物', slot: 'back', glyph: '叉',
    flavor: '错过的题，总得重新做。', summary: '失败后折返加强', positive: '弹道到终点折返并强化', negative: '基础伤害-12%', price: 7, color: '#a64049',
  },
  'stone-schoolbag': {
    id: 'stone-schoolbag', name: '装满石头的书包', quality: 2, qualityName: '旧物', slot: 'back', glyph: '书',
    flavor: '大人说，这都是为你好。', summary: '缓慢而沉重', positive: '伤害+40% · 穿透+2', negative: '弹速-45% · 主角驼背', price: 8, color: '#756d65',
  },
  'bleach-powder': {
    id: 'bleach-powder', name: '剩了半袋的漂粉', quality: 2, qualityName: '旧物', slot: 'head', glyph: '黄',
    flavor: '那年他觉得，先被看见才算存在。', summary: '显眼的叛逆', positive: '射速+22% · 暴击+8%', negative: '敌人逼近速度+15%', price: 8, color: '#d7c84f',
  },
  'eyebrow-razor': {
    id: 'eyebrow-razor', name: '同桌的修眉刀', quality: 3, qualityName: '心结', slot: 'hand', glyph: '刃',
    flavor: '她说只是修眉，夏天却从不卷袖子。', summary: '把弹道削得极细', positive: '伤害+18% · 暴击+25%', negative: '最大生命-8 · 弹宽-55%', price: 11, color: '#c7d0d2',
  },
  'od-pill': {
    id: 'od-pill', name: 'OD妹给的小药丸', quality: 3, qualityName: '心结', slot: 'waist', glyph: '丸',
    flavor: '她说，吃了以后今晚就不会做梦。', summary: '每场产生一次失真', positive: '每场随机大幅强化一项弹道', negative: '同时随机削弱另一项弹道', price: 10, color: '#d7a8c8',
  },
  'front-desk-letter': {
    id: 'front-desk-letter', name: '前桌的情书', quality: 3, qualityName: '心结', slot: 'chest', glyph: '信',
    flavor: '信封上没有他的名字。', summary: '偏离后寻找目标', positive: '弹道强追踪', negative: '散射角增大 · 伤害-8%', price: 11, color: '#e3d3bd',
  },
  'cracked-glasses': {
    id: 'cracked-glasses', name: '裂了一边的眼镜', quality: 2, qualityName: '旧物', slot: 'face', glyph: '镜',
    flavor: '他第一次看清远方，也看不清自己。', summary: '远距精确射击', positive: '射程+55% · 暴击+14%', negative: '弹宽-35%', price: 8, color: '#aac0c0',
  },
  'small-uniform': {
    id: 'small-uniform', name: '小了一号的校服', quality: 2, qualityName: '旧物', slot: 'chest', glyph: '衣',
    flavor: '他长大了，衣服却不允许。', summary: '束缚换取速度', positive: '射速+22%', negative: '最大生命-6 · 弹宽-15%', price: 7, color: '#566d7c',
  },
  'only-key': {
    id: 'only-key', name: '出租屋唯一的钥匙', quality: 2, qualityName: '旧物', slot: 'waist', glyph: '钥',
    flavor: '自由与孤独，是同一扇门。', summary: '终点打开一扇门', positive: '弹道消失时产生小型爆炸', negative: '射程-12%', price: 8, color: '#c59b53',
  },
  'first-salary': {
    id: 'first-salary', name: '第一次工资的信封', quality: 2, qualityName: '旧物', slot: 'hand', glyph: '薪',
    flavor: '那天他第一次觉得自己有用。', summary: '零钱转化为力量', positive: '每5枚零钱使伤害+6%', negative: '花钱会立刻失去加成', price: 9, color: '#b99368',
  },
  'nameless-tie': {
    id: 'nameless-tie', name: '没有商标的领带', quality: 3, qualityName: '心结', slot: 'neck', glyph: '领',
    flavor: '系上它，他们也许会认真听。', summary: '体面而窒息', positive: '伤害+18% · 暴击+18%', negative: '最大生命-10', price: 12, color: '#84313e',
  },
  'fathers-raincoat': {
    id: 'fathers-raincoat', name: '父亲的雨衣', quality: 5, qualityName: '这一身', slot: 'chest', glyph: '雨',
    flavor: '他没有拥抱过你，但那天雨很大。', summary: '承受并化为雨', positive: '每场抵挡首次受伤；受伤释放雨滴', negative: '射速-18% · 身体变得沉重', price: 15, color: '#c4a23f',
  },
  'unsent-phone': {
    id: 'unsent-phone', name: '没打出去的电话', quality: 3, qualityName: '心结', slot: 'hand', glyph: '话',
    flavor: '号码一直都没有换。', summary: '浪费的能量变成来电', positive: '能量溢出时储存声波', negative: '每层来电使射速-3%', price: 11, color: '#668785',
  },
  'baby-tooth': {
    id: 'baby-tooth', name: '女儿换下的乳牙', quality: 4, qualityName: '遗物', slot: 'neck', glyph: '牙',
    flavor: '他开始害怕自己先离开。', summary: '替他留下来一次', positive: '每场首次致命伤保留1生命并爆发', negative: '基础伤害-10%', price: 15, color: '#e9e2c9',
  },
  'revoked-badge': {
    id: 'revoked-badge', name: '已经注销的旧工牌', quality: 5, qualityName: '这一身', slot: 'chest', glyph: '牌',
    flavor: '名字还在，门已经打不开了。', summary: '经历越多伤害越高', positive: '每件穿戴物使伤害+5%', negative: '商城价格+20%', price: 10, color: '#64748a',
  },
  'slow-watch': {
    id: 'slow-watch', name: '慢了七分钟的手表', quality: 3, qualityName: '心结', slot: 'hand', glyph: '表',
    flavor: '身体还在走，时间已经不同步。', summary: '让弹幕停在时间里', positive: '每7秒冻结弹道1秒，恢复后加速', negative: '弹速-15%', price: 12, color: '#81a0aa',
  },
  'missing-photo': {
    id: 'missing-photo', name: '少了一个人的合照', quality: 4, qualityName: '遗物', slot: 'chest', glyph: '照',
    flavor: '回忆越来越满，屋子越来越空。', summary: '每第四轮保护身后', positive: '每第4轮额外发射两枚高伤弹道', negative: '生命低于一半时射速-15%', price: 15, color: '#b6aa94',
  },
  'white-bottle': {
    id: 'white-bottle', name: '药房最下面的白瓶子', quality: 2, qualityName: '旧物', slot: 'waist', glyph: '药',
    flavor: '标签说一天一次，他记不清了。', summary: '透支身体加速攻击', positive: '射速+30%', negative: '每场开始失去2生命 · 伤害-10%', price: 8, color: '#d2dedb',
  },
  'empty-frame': {
    id: 'empty-frame', name: '一直空着的相框', quality: 3, qualityName: '心结', slot: 'shadow', glyph: '框',
    flavor: '他一直说，等大家有空。', summary: '空处发生爆炸', positive: '所有终点爆炸范围扩大', negative: '弹道存在时间-25%', price: 11, color: '#76553d',
  },
  'broken-spine': {
    id: 'broken-spine', name: '断掉的脊梁骨', quality: 4, qualityName: '遗物', slot: 'back', glyph: '脊',
    flavor: '他们说男人要做家里的顶梁柱。', summary: '负面越多，一口气越重', positive: '每条负面词条增伤12% · 每3条负面穿透+1', negative: '支付一口气 · 治疗-30% · 永久弯腰', price: 12, color: '#d8d0bb',
  },
  'spent-decade': {
    id: 'spent-decade', name: '提前花掉的十年', quality: 4, qualityName: '遗物', slot: 'shadow', glyph: '年',
    flavor: '未来的他没有同意，但合同已经生效。', summary: '预支未来的攻击', positive: '每10秒提前释放5轮攻击', negative: '爆发后停止呼吸2秒', price: 12, color: '#b9b7b0',
  },
  'held-pee': {
    id: 'held-pee', name: '憋回去的那泡尿', quality: 2, qualityName: '旧物', slot: 'waist', glyph: '憋',
    flavor: '会开到第三个小时。他练出来了。', summary: '站着不动越憋越狠', positive: '站定时伤害持续积攒，最高+60%', negative: '移速-8%', price: 7, color: '#8a8154',
  },
  'flash-escape': {
    id: 'flash-escape', name: '交掉的闪现', quality: 3, qualityName: '心结', slot: 'shadow', glyph: '闪',
    flavor: '关键团，他闪现撞了墙。后来的很多关键时刻，他也是这样。', summary: '受击瞬间闪现躲开', positive: '受击时自动闪现躲开这次伤害，冷却9秒', negative: '小概率闪向反方向', price: 11, color: '#9a8fb5',
  },
  'class-break': {
    id: 'class-break', name: '课间十分钟', quality: 2, qualityName: '旧物', slot: 'shadow', glyph: '铃',
    flavor: '铃一响就往外冲。那时候快乐只需要十分钟。', summary: '开场十秒撒欢', positive: '每阶段前10秒移速+35%、射速+25%', negative: '结束后疲惫3秒，移速-15%', price: 8, color: '#a8842f',
  },
  'last-page': {
    id: 'last-page', name: '暑假作业最后一页', quality: 2, qualityName: '旧物', slot: 'hand', glyph: '暑',
    flavor: '8月30日晚上，全家总动员。', summary: '死线前爆发', positive: '每阶段最后10秒伤害翻倍', negative: '阶段前30秒伤害-10%', price: 8, color: '#a0524a',
  },
  'five-ha': {
    id: 'five-ha', name: '五个哈', quality: 2, qualityName: '旧物', slot: 'chest', glyph: '哈',
    flavor: '他回了"哈哈哈哈哈"。少一个都显得没礼貌。', summary: '五连发', positive: '攻击变为五连发，一发比一发轻（总量微升）', negative: '治疗-15%', price: 8, color: '#8a8274',
  },
  'red-packet': {
    id: 'red-packet', name: '抢到的0.87元红包', quality: 1, qualityName: '杂物', slot: 'waist', glyph: '包',
    flavor: '群里都说谢谢老板。他也说了。', summary: '零碎的快乐', positive: '击杀15%概率掉一枚零钱', negative: '没有负面作用', price: 4, color: '#a05548',
  },
  'snow-screen': {
    id: 'snow-screen', name: '雪花屏', quality: 3, qualityName: '心结', slot: 'shadow', glyph: '雪',
    flavor: '电视没信号了。他盯着雪花看了很久，总觉得里面有东西。', summary: '这次伤害没有发生', positive: '每阶段一次：致命伤化为雪花，没有发生', negative: '画面偶尔闪过一帧雪花', price: 11, color: '#8b93a0',
  },
  marble: {
    id: 'marble', name: '当年最强的那颗弹珠', quality: 1, qualityName: '杂物', slot: 'hand', glyph: '珠',
    flavor: '全班都输给过它。上周搬家，它从铁盒里滚出来——只是颗玻璃珠。', summary: '还会弹', positive: '命中25%概率弹向另一个敌人', negative: '没有负面作用', price: 5, color: '#7e97a0',
  },
  'always-crying': {
    id: 'always-crying', name: '我一直在哭', quality: 3, qualityName: '心结', slot: 'face', glyph: '哭',
    flavor: '发出去的时候，他正面无表情地刷下一条。', summary: '受伤流出穿透泪', positive: '受到伤害时发射3枚穿透眼泪', negative: '射程-12%', price: 11, color: '#7d8a95',
  },
  'three-day-visible': {
    id: 'three-day-visible', name: '朋友圈仅三天可见', quality: 2, qualityName: '旧物', slot: 'shadow', glyph: '圈',
    flavor: '过去被折叠成三天。', summary: '三圈后放手', positive: '拾取任何道具后，3枚当前弹体绕身三圈，再向外释放', negative: '治疗-5%', price: 8, color: '#8a8274',
  },
  'read-3am': {
    id: 'read-3am', name: '凌晨三点的已读', quality: 2, qualityName: '旧物', slot: 'hand', glyph: '读',
    flavor: '在线不等于回应。', summary: '已读不回', positive: '命中不立即结算：5秒后连本带利×1.3一次爆出', negative: '目标提前倒下则挂账落空', price: 8, color: '#6f7d88',
  },
  'retracted-voice': {
    id: 'retracted-voice', name: '领导撤回的六十秒语音', quality: 3, qualityName: '心结', slot: 'neck', glyph: '音',
    flavor: '你永远不知道那60秒里是什么。', summary: '沉默攒成声波', positive: '咽下+1层；吐出时每层释放6点声波', negative: '每层射速-2%', price: 11, color: '#7a6f85',
  },
  'takeout-3am': {
    id: 'takeout-3am', name: '凌晨三点的外卖袋', quality: 2, qualityName: '旧物', slot: 'waist', glyph: '袋',
    flavor: '对身体的延期付款。', summary: '低血缓慢回补', positive: '生命<40%时每2秒回1', negative: '主动治疗-15%', price: 8, color: '#9a8154',
  },
  'auto-renew': {
    id: 'auto-renew', name: '自动续费到明年的会员', quality: 2, qualityName: '旧物', slot: 'shadow', glyph: '费',
    flavor: '取消入口藏得很深。', summary: '开场自动增益', positive: '每阶段前15秒伤害+10%', negative: '每阶段扣1零钱', price: 8, color: '#7f8a6e',
  },
  'bargain-link': {
    id: 'bargain-link', name: '全家帮砍仍差一刀的链接', quality: 3, qualityName: '心结', slot: 'hand', glyph: '链',
    flavor: '差的永远是那一刀。', summary: '低级道具变奖励', positive: '每件Ⅰ/Ⅱ级道具伤害+3%', negative: '商城价格+10%', price: 10, color: '#a05548',
  },
  'mineral-water': {
    id: 'mineral-water', name: '相亲桌上没拆的矿泉水', quality: 2, qualityName: '旧物', slot: 'hand', glyph: '水',
    flavor: '谁先拧开谁输。', summary: '对峙', positive: '每对峙满8秒无伤：最近的敌人先绷不住，重创+僵直', negative: '受伤重新计时', price: 8, color: '#7e97a0',
  },
  'group-dad': {
    id: 'group-dad', name: '家长群里的“孩子他爸”', quality: 3, qualityName: '心结', slot: 'chest', glyph: '爸',
    flavor: '他的名字最后一次被使用是在实名认证。', summary: '附属更强', positive: '雨滴/分裂/弹跳等继承弹伤害+40%', negative: '本体伤害-10%', price: 10, color: '#77705f',
  },
  'divorce-draft': {
    id: 'divorce-draft', name: '没有按下发送的离婚协议', quality: 4, qualityName: '遗物', slot: 'chest', glyph: '离',
    flavor: '存了三年的草稿箱。', summary: '拖延成了护甲', positive: '首次受伤一半立即结算，另一半阶段末补扣', negative: '治疗-15%', price: 13, color: '#6d6a75',
  },
  'checkup-arrows': {
    id: 'checkup-arrows', name: '体检报告上的向上箭头', quality: 3, qualityName: '心结', slot: 'shadow', glyph: '检',
    flavor: '人被缩成一组异常指标。', summary: '异常继续异常', positive: '高于基准的属性再+8%，低于的再-8%', negative: '双向放大，无法回头', price: 11, color: '#a0524a',
  },
  'shared-powerbank': {
    id: 'shared-powerbank', name: '医院走廊的共享充电宝', quality: 2, qualityName: '旧物', slot: 'waist', glyph: '电',
    flavor: '按分钟计费的等待。', summary: '租来的精力', positive: '攻击空窗租电，恢复攻击时短暂连射加速', negative: '每累计租电8秒扣1零钱', price: 8, color: '#6e8783',
  },
  'third-pill': {
    id: 'third-pill', name: '她没说名字的第三颗药', quality: 4, qualityName: '遗物', slot: 'waist', glyph: '三',
    flavor: '前两颗有名字，第三颗没有。', summary: '周期性失真', positive: '每20秒狂暴8秒（伤害×1.6 射速×1.4）', negative: '随后3秒崩落（全属性×0.6）', price: 13, color: '#96789c',
  },
  'loan-contract': {
    id: 'loan-contract', name: '已经签好名字的网贷合同', quality: 4, qualityName: '遗物', slot: 'hand', glyph: '贷',
    flavor: '利息比字迹清楚。', summary: '预支的力量', positive: '伤害+25%', negative: '每阶段先扣2零钱；不足仍扣现有零钱，再扣4生命', price: 13, color: '#8a6a4f',
  },
  'name-sold': {
    id: 'name-sold', name: '把名字卖掉的合同', quality: 4, qualityName: '遗物', slot: 'chest', glyph: '名',
    flavor: '编号比名字好记。', summary: '制式化', positive: '零散射、零波动，基础伤害+30%', negative: '永不暴击 · 无法再亲口回应命运', price: 13, color: '#6b6f7e',
  },
  'moms-bowl': {
    id: 'moms-bowl', name: '母亲留在锅里的那碗饭', quality: 4, qualityName: '遗物', slot: 'chest', glyph: '饭',
    flavor: '无论多晚，锅里总有一只倒扣的碗。', summary: '溢出的爱变护盾', positive: '溢出的治疗转为护盾', negative: '转化率每阶段-10%（会凉）', price: 14, color: '#a68d55',
  },
  'ruma-msg': {
    id: 'ruma-msg', name: '凌晨两点朋友发来的“在吗”', quality: 4, qualityName: '遗物', slot: 'hand', glyph: '吗',
    flavor: '这一次，有人接了。', summary: '未回复的都在等你', positive: '咽下+1层；生命<35%时每层化为5点护盾', negative: '每层治疗-3%', price: 14, color: '#6f8577',
  },
  'held-elevator': {
    id: 'held-elevator', name: '有人替你按住的电梯', quality: 4, qualityName: '遗物', slot: 'shadow', glyph: '梯',
    flavor: '有人愿意为你多等三秒。', summary: '弹道在终点等你', positive: '弹道消失时30%悬停后追向最近敌人', negative: '弹速-8%', price: 14, color: '#7c828e',
  },
  'old-door-lock': {
    id: 'old-door-lock', name: '一直没有换的家门锁', quality: 4, qualityName: '遗物', slot: 'waist', glyph: '锁',
    flavor: '那把钥匙一直开得了门。', summary: '回家的路更疼', positive: '弹道折返；回程伤害+30%', negative: '射程-10%', price: 14, color: '#8f7a49',
  },
  'drank-for-boss': {
    id: 'drank-for-boss', name: '酒局上代喝的那杯', quality: 3, qualityName: '心结', slot: 'neck', glyph: '杯',
    flavor: '领导说，小周能喝。', summary: '把伤吐还回去', positive: '受伤25%概率攒代喝；3层释放累计范围反伤', negative: '每阶段开场1.2秒站不稳', price: 10, color: '#96603f',
  },
  'hair-in-takeout': {
    id: 'hair-in-takeout', name: '外卖里吃出的头发', quality: 2, qualityName: '旧物', slot: 'waist', glyph: '发',
    flavor: '他挑出来，拍了照，最后还是吃完了。', summary: '将就的一口', positive: '生命<30%时自动回8（每阶段一次）', negative: '所有治疗-10%', price: 7, color: '#6f6a5a',
  },
  'unwashed-pillow': {
    id: 'unwashed-pillow', name: '没洗的枕套', quality: 2, qualityName: '旧物', slot: 'shadow', glyph: '枕',
    flavor: '上面有一个人形的黄印子。', summary: '躺平减伤', positive: '静止2秒后减伤50%', negative: '起身后1秒射速-20%', price: 7, color: '#9b9271',
  },
  'sock-cigs': {
    id: 'sock-cigs', name: '藏在袜子里的烟', quality: 3, qualityName: '心结', slot: 'waist', glyph: '烟',
    flavor: '一天一根。戒了十年。', summary: '提神的代价', positive: '受伤后2秒移速+25%', negative: '每45秒最大生命-1', price: 10, color: '#6d6458',
  },
  'pregnancy-test': {
    id: 'pregnancy-test', name: '验孕棒', quality: 4, qualityName: '遗物', slot: 'hand', glyph: '两',
    flavor: '两道杠那天，他在楼道里坐到天亮。', summary: '身后多了个影子', positive: '每第3轮多1枚继承弹', negative: '商城价格+35%', price: 13, color: '#8f7e8e',
  },
  'gym-card': {
    id: 'gym-card', name: '健身房年卡', quality: 1, qualityName: '杂物', slot: 'waist', glyph: '卡',
    flavor: '去过三次。教练还在发消息。', summary: '花钱买的自觉', positive: '移速+8%', negative: '每阶段扣1零钱', price: 4, color: '#7c8a72',
  },
  'funeral-photo': {
    id: 'funeral-photo', name: '遗照选用的那张', quality: 4, qualityName: '遗物', slot: 'face', glyph: '笑',
    flavor: '照相馆师傅说，笑一点。他就笑了。', summary: '最后的配合', positive: '致命伤时1血狂暴5秒（每局一次）', negative: '生效后治疗-20%', price: 14, color: '#83795f',
  },
  'typing-indicator': {
    id: 'typing-indicator', name: '对方正在输入…', quality: 3, qualityName: '心结', slot: 'hand', glyph: '输',
    flavor: '输入了很久。最后收到的是“嗯”。', summary: '三个点以后，话向四面散开', positive: '头顶每0.5秒出现1个点；第3点触发12向大范围散射，继承当前弹体机制', negative: '取消普通连射，改为每1.5秒结算1轮散射', price: 10, color: '#6f7d88',
  },
  'year-report': {
    id: 'year-report', name: '年度听歌报告', quality: 3, qualityName: '心结', slot: 'shadow', glyph: '歌',
    flavor: '你最爱的那首歌，循环在凌晨。', summary: '单曲循环', positive: '每第4轮把上一轮弹道原样重放一遍（×0.6）', negative: '每阶段开场生命-2', price: 10, color: '#7a6f85',
  },
  'momo-avatar': {
    id: 'momo-avatar', name: 'momo的头像', quality: 3, qualityName: '心结', slot: 'face', glyph: '粉',
    flavor: '换上粉色小恐龙之后，他终于敢说话了。', summary: '匿名的胆量', positive: '无敌人贴脸时暴击+25%', negative: '被贴脸时伤害-8%', price: 10, color: '#a08194',
  },
  'ai-chat': {
    id: 'ai-chat', name: '和AI聊到凌晨', quality: 4, qualityName: '遗物', slot: 'hand', glyph: '聊',
    flavor: '它记得他说过的每一句话。', summary: '它复读你', positive: '每轮攻击后0.4秒复读一轮回声弹（×0.35）；命运牌结算后回4血', negative: '亲口回应的属性变化减半', price: 13, color: '#5f7581',
  },
  'streak-1847': {
    id: 'streak-1847', name: '连续签到1847天', quality: 2, qualityName: '旧物', slot: 'hand', glyph: '签',
    flavor: '断在住院那一周。', summary: '打卡节律', positive: '每个整10秒的第一发必定暴击（准时）', negative: '受伤打断当期打卡', price: 8, color: '#7f8a6e',
  },
  'goodnight-2h': {
    id: 'goodnight-2h', name: '晚安之后的两小时', quality: 2, qualityName: '旧物', slot: 'shadow', glyph: '安',
    flavor: '发完晚安，他又刷了两小时。', summary: '熬出来的精神', positive: '生命<50%时射速+18%', negative: '每30秒最大生命-1', price: 8, color: '#6d6a75',
  },
  'friend-verify': {
    id: 'friend-verify', name: '对方已开启朋友验证', quality: 3, qualityName: '心结', slot: 'hand', glyph: '删',
    flavor: '想转发个段子过去，才发现早就被删了。', summary: '一个人也行', positive: '每次商城不买离开伤害+6%（可叠）', negative: '治疗-10%', price: 10, color: '#77705f',
  },
  'summer-run': {
    id: 'summer-run', name: '练了一个暑假的跑法', quality: 2, qualityName: '旧物', slot: 'shadow', glyph: '跑',
    flavor: '胳膊向后，压低身子。', summary: '那年最快的姿势', positive: '移速+12%', negative: '急停会滑半步', price: 8, color: '#9a8154',
  },
  'one-more-game': {
    id: 'one-more-game', name: '再来一把就睡', quality: 2, qualityName: '旧物', slot: 'hand', glyph: '把',
    flavor: '这话他说了十年。', summary: '不甘心的续航', positive: '章末可跳过回复；伤害+10%一层（最多5层）', negative: '每层令下阶段开场停火0.5秒', price: 8, color: '#6f7d88',
  },
  'eye-exercise': {
    id: 'eye-exercise', name: '眼保健操', quality: 3, qualityName: '心结', slot: 'face', glyph: '眼',
    flavor: '闭眼，睁开，三十岁了。', summary: '闭眼的半秒', positive: '每12秒自动闭眼获得0.5秒无敌', negative: '睁眼后1.5秒敌人加速', price: 10, color: '#5f7581',
  },
  'card-binder': {
    id: 'card-binder', name: '大扫除清掉的卡册', quality: 2, qualityName: '旧物', slot: 'back', glyph: '册',
    flavor: '他集齐了全班羡慕的一切。', summary: '借来的强度', positive: '每阶段随机+12%伤害/射速/射程', negative: '阶段结束即消失', price: 8, color: '#8a6a4f',
  },
  'abstract-lv10': {
    id: 'abstract-lv10', name: '抽象话十级', quality: 2, qualityName: '旧物', slot: 'face', glyph: '6',
    flavor: '6。乐。急了。', summary: '嘲讽拉满', positive: '每8秒嘲讽最近非Boss敌人：受伤+20%但冲向你', negative: '咽下效果-10%', price: 8, color: '#96789c',
  },
  'shop-freezer': {
    id: 'shop-freezer', name: '小卖部的冰柜', quality: 2, qualityName: '旧物', slot: 'back', glyph: '冰',
    flavor: '五毛钱的快乐在最底层。', summary: '冰雾缠弹', positive: '命中20%冻结敌人1.2秒', negative: '射速-5%', price: 8, color: '#7e97a0',
  },
  'server-shutdown': {
    id: 'server-shutdown', name: '关服那天', quality: 4, qualityName: '遗物', slot: 'shadow', glyph: '服',
    flavor: '他养的那只电子宠物还在等他喂食。服务器关闭那天，没有人通知它。', summary: '它替你挡最后一次',
    positive: '致命伤时小剪影替你挡下，然后永远消失', negative: '它消失后，治疗-15%', price: 14, color: '#6f8577',
  },
  'painless-night': {
    id: 'painless-night', name: '没有痛觉的夜晚', quality: 4, qualityName: '遗物', slot: 'shadow', glyph: '麻',
    flavor: '他把麻木误认成了坚强。', summary: '把伤害延迟成重量', positive: '未结算伤害持续提高攻击', negative: '8秒后全额结算 · 普通治疗失效', price: 12, color: '#7f8591',
  },
  'ktv-song': {
    id: 'ktv-song', name: 'KTV里没人听的那首歌', quality: 4, qualityName: '遗物', slot: 'neck', glyph: '吼',
    flavor: '轮到他唱时，包厢里都在点下一首。', summary: '攒一口气吼出去', positive: '每6秒攒满一口，向四周吼出一圈声浪（继承全部形变）', negative: '常规攻击伤害-15%', price: 14, color: '#7a8fa5',
  },
  'breath-on-glass': {
    id: 'breath-on-glass', name: '冬天呵在玻璃上的字', quality: 4, qualityName: '遗物', slot: 'face', glyph: '呵',
    flavor: '他呵出一团雾，写了个名字，又擦掉了。', summary: '一口气呵成雾', positive: '弹体呵成宽雾锥：弹宽×2.2 · 穿透+2', negative: '射程×0.55', price: 14, color: '#a9c2c6',
  },
  // ── 第五档 · 这一身：每章大 Boss 固定掉落，不进随机池，不可拒绝 ──
  'admission-notice': {
    id: 'admission-notice', name: '入学通知书', quality: 5, qualityName: '这一身', slot: 'hand', glyph: '录',
    flavor: '上面印着他的名字，名字后面跟着一个号。', summary: '选择变多了，但你不能不选', positive: '每章奖励三选一变四选一', negative: '不能再跳过奖励，每次必须选走一件', price: 0, color: '#c9b87a',
  },
  'iphone-17-pro-max': {
    id: 'iphone-17-pro-max', name: '最新款的 iPhone 17 Pro Max', quality: 5, qualityName: '这一身', slot: 'hand', glyph: '机',
    flavor: '离职金买的最新款手机。爽歪歪。', summary: '新机就是快', positive: '伤害+30% · 攻速+10%', negative: '拾取时零钱清零 · 每15秒弹一次消息，攻击中断0.4秒', price: 0, color: '#4a5a6e',
  },
  'fathers-chart': {
    id: 'fathers-chart', name: '父亲的病历本', quality: 5, qualityName: '这一身', slot: 'waist', glyph: '病',
    flavor: '名字栏写着他父亲的名字。轮到他填自己的时候，症状栏可以照抄。', summary: '你透支得越多，你越强', positive: '每永久损失10点最大生命，伤害+8%（无上限）', negative: '治疗效果-40%', price: 0, color: '#8f8579',
  },
};

export const ITEM_IDS = Object.keys(ITEM_DEFINITIONS) as ItemId[];

// 第五档「这一身」传承线：固定掉落专用，不进任何随机池（奖励/商店/命运/两间房）。
export const STORY_ITEM_IDS: ItemId[] = ['admission-notice', 'fathers-raincoat', 'iphone-17-pro-max', 'fathers-chart', 'revoked-badge'];

// Fate may only grant modest items; stronger build cores keep their authored sources.
export const FATE_ITEM_IDS = ITEM_IDS.filter((id) => ITEM_DEFINITIONS[id].quality <= 2);

export function getItem(id: ItemId): ItemDefinition {
  return ITEM_DEFINITIONS[id];
}
