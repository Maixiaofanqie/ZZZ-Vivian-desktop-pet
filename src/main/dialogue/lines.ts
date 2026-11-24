export type DayPeriod = 'morning' | 'day' | 'evening' | 'night' | 'any'

/** 台词分类；决定它由哪个选择器取用 */
export type DialogueTag =
  | 'daily'
  | 'greeting'
  | 'reminder'
  | 'milestone'
  | 'easter-egg'
  | 'idle'
  | 'sleep'

/** 触发条件；全部满足才可被选中 */
export interface DialogueConditions {
  /** 至少共处 N 个自然日 */
  minDaysTogether?: number
  /** 至少累计互动 N 次 */
  minInteractions?: number
  /** 最多累计互动 N 次（早期台词） */
  maxInteractions?: number
}

export interface DialogueLine {
  id: string
  /** 支持 {days} / {interactions} / {address} 模板变量，由主进程渲染后发给气泡 */
  text: string
  timeRange?: DayPeriod
  weight?: number
  tags: DialogueTag[]
  conditions?: DialogueConditions
}

/** 台词库：按时段、标签、条件与权重选择；每个时段至少一句问候 */
export const DIALOGUE_LINES: DialogueLine[] = [
  {
    id: 'morning-01',
    text: '早安，法厄同大人。今天也从一杯水开始吧。',
    timeRange: 'morning',
    tags: ['greeting'],
  },
  {
    id: 'morning-02',
    text: '窗外的光刚刚好。法厄同大人，今天也请多指教。',
    timeRange: 'morning',
    tags: ['daily'],
  },
  {
    id: 'morning-03',
    text: '法厄同大人，昨天没做完的事，今天慢慢来就好，薇薇安会一直陪着您的。',
    timeRange: 'morning',
    tags: ['daily'],
  },
  {
    id: 'morning-04',
    text: '今天的晨光很温和，法厄同大人。',
    timeRange: 'morning',
    tags: ['daily'],
  },
  {
    id: 'morning-05',
    text: '薇薇安把窗边的位置留好了。法厄同大人，今天也请多指教。',
    timeRange: 'morning',
    tags: ['daily'],
  },
  {
    id: 'morning-06',
    text: '法厄同大人，先深呼吸一下，不必着急。',
    timeRange: 'morning',
    tags: ['daily'],
  },
  {
    id: 'day-01',
    text: '写累了吗，法厄同大人？稍微站起来走一走吧。',
    timeRange: 'day',
    tags: ['daily'],
  },
  {
    id: 'day-02',
    text: '法厄同大人，薇薇安在这里。需要递什么东西的话，请尽情吩咐薇薇安。',
    timeRange: 'day',
    tags: ['daily'],
  },
  {
    id: 'day-03',
    text: '中午了……法厄同大人是不是又忘记吃饭了？',
    timeRange: 'day',
    tags: ['daily'],
  },
  {
    id: 'day-04',
    text: '日安，法厄同大人。今天也一起慢慢来吧。',
    timeRange: 'day',
    tags: ['greeting'],
  },
  {
    id: 'day-05',
    text: '水杯空了吗，法厄同大人？薇薇安去替您添一点。',
    timeRange: 'day',
    tags: ['daily'],
  },
  {
    id: 'day-06',
    text: '法厄同大人，眼睛酸的话，看看窗外吧。薇薇安替您数三秒。',
    timeRange: 'day',
    tags: ['daily'],
  },
  {
    id: 'day-07',
    text: '法厄同大人，桌面乱一点也没关系。重要的东西，薇薇安帮您记着。',
    timeRange: 'day',
    tags: ['daily'],
  },
  {
    id: 'day-08',
    text: '需要安静的话，法厄同大人，薇薇安就不说话，只在这里。',
    timeRange: 'day',
    tags: ['daily'],
  },
  {
    id: 'evening-01',
    text: '天暗下来了呢。桌面上的灯，薇薇安替法厄同大人留着。',
    timeRange: 'evening',
    tags: ['daily'],
  },
  {
    id: 'evening-02',
    text: '法厄同大人，今天也辛苦了。剩下的事情明天再说吧。',
    timeRange: 'evening',
    tags: ['daily'],
  },
  {
    id: 'evening-03',
    text: '傍晚的风……很适合散步呢，法厄同大人。',
    timeRange: 'evening',
    tags: ['greeting'],
  },
  {
    id: 'evening-05',
    text: '收工之前，法厄同大人先把明天最想做的第一件事写下来吧。',
    timeRange: 'evening',
    tags: ['daily'],
  },
  {
    id: 'evening-06',
    text: '法厄同呀法厄同~',
    timeRange: 'evening',
    tags: ['daily'],
  },
  {
    id: 'night-01',
    text: '这么晚还在忙吗，法厄同大人？……薇薇安陪着您。',
    timeRange: 'night',
    tags: ['daily'],
  },
  {
    id: 'night-02',
    text: '已经这个时间了，法厄同大人。眼睛会疼的，休息一下吧。',
    timeRange: 'night',
    tags: ['daily'],
  },
  {
    id: 'night-03',
    text: '夜深了……法厄同大人，别熬太久。',
    timeRange: 'night',
    tags: ['greeting'],
  },
  {
    id: 'night-04',
    text: '夜深了，法厄同大人。薇薇安把声音也放轻一点。',
    timeRange: 'night',
    tags: ['daily'],
  },
  {
    id: 'night-05',
    text: '法厄同大人，再看五分钟就休息，好不好？',
    timeRange: 'night',
    tags: ['daily'],
  },
  {
    id: 'night-06',
    text: '今晚的月亮，替法厄同大人把窗帘拉上了一半呢。',
    timeRange: 'night',
    tags: ['daily'],
  },
  {
    id: 'night-07',
    text: '如果还睡不着，法厄同大人，就让我陪您再坐一会儿。',
    timeRange: 'night',
    tags: ['daily'],
  },
  {
    id: 'any-01',
    text: '法厄同大人，有薇薇安在的今天，希望能比昨天更好一些。',
    timeRange: 'any',
    tags: ['daily'],
  },
  {
    id: 'any-02',
    text: '需要薇薇安的时候，法厄同大人叫一声就好。',
    timeRange: 'any',
    tags: ['daily'],
  },
  {
    id: 'any-03',
    text: '……法厄同大人刚才，是不是偷偷看薇薇安了？',
    timeRange: 'any',
    tags: ['daily'],
  },
  {
    id: 'any-04',
    text: '法厄同大人，薇薇安在这里。不会走开。',
    timeRange: 'any',
    tags: ['daily'],
  },
  {
    id: 'any-05',
    text: '法厄同大人，如果今天很难，就先只做下一件小事。',
    timeRange: 'any',
    tags: ['daily'],
  },
  {
    id: 'any-06',
    text: '法厄同大人认真做事的样子……薇薇安记下来了。',
    timeRange: 'any',
    tags: ['daily'],
  },
  {
    id: 'any-07',
    text: '伞薇薇安收好了。等下雨的时候，再和法厄同大人一起出门。',
    timeRange: 'any',
    tags: ['daily'],
  },
  {
    id: 'any-09',
    text: '今天的法厄同大人，也比昨天更努力了一点。',
    timeRange: 'any',
    tags: ['daily'],
  },
  {
    id: 'any-10',
    text: '算上今天，我和法厄同大人已经一起走过 {days} 天了。……我都有好好数着。',
    timeRange: 'any',
    tags: ['daily'],
    conditions: { minDaysTogether: 7 },
  },
  {
    id: 'any-11',
    text: '法厄同大人，这是第 {interactions} 次对话了。……每一次，薇薇安都记得。',
    timeRange: 'any',
    tags: ['daily'],
    conditions: { minInteractions: 50 },
  },
  {
    id: 'any-12',
    text: '{address}，薇薇安会一直在这里。',
    timeRange: 'any',
    tags: ['daily'],
  },
  {
    id: 'any-13',
    text: '法厄同大人，薇薇安才刚来到这里不久呢……不过，薇薇安已经记住这里的样子了。',
    timeRange: 'any',
    tags: ['daily'],
    conditions: { maxInteractions: 20 },
  },
  {
    id: 'morning-07',
    text: '法厄同大人，窗开了，透透气吧。今天外面挺安静的。',
    timeRange: 'morning',
    tags: ['daily'],
    weight: 0.9,
  },
  {
    id: 'morning-08',
    text: '薇薇安把咖啡煮好了。……只是刚好煮了两杯，不是特意等法厄同大人的。',
    timeRange: 'morning',
    tags: ['daily'],
    weight: 0.8,
  },
  {
    id: 'morning-09',
    text: '昨晚睡得好吗，法厄同大人？您看起来……好像还没完全醒。',
    timeRange: 'morning',
    tags: ['daily'],
    weight: 0.7,
  },
  {
    id: 'morning-10',
    text: '早上好，法厄同大人！……薇薇安是不是比闹钟早了一点？',
    timeRange: 'morning',
    tags: ['daily'],
    weight: 0.7,
  },
  {
    id: 'morning-11',
    text: '天气预报说下午有雨。薇薇安带了伞，法厄同大人呢？',
    timeRange: 'morning',
    tags: ['daily'],
    weight: 0.8,
  },
  {
    id: 'day-09',
    text: '午饭时间到了，法厄同大人，薇薇安也给您做了一份，请您收下！',
    timeRange: 'day',
    tags: ['daily'],
    weight: 0.8,
  },
  {
    id: 'day-10',
    text: '法厄同大人需要翻译、修东西，还是找一份不太好找的资料？薇薇安都能试试。',
    timeRange: 'day',
    tags: ['daily'],
    weight: 0.6,
  },
  {
    id: 'day-11',
    text: '这幅画的颜色不太对。……法厄同大人别笑，薇薇安认真画的时候不是这样的。',
    timeRange: 'day',
    tags: ['daily'],
    weight: 0.5,
  },
  {
    id: 'day-12',
    text: '法厄同大人，窗外有只气球飞走了。等会儿薇薇安去把它送到治安局。',
    timeRange: 'day',
    tags: ['daily'],
    weight: 0.7,
  },
  {
    id: 'day-13',
    text: '今天又接了一份打工。法厄同大人放心，薇薇安不会耽误陪您的时间的！',
    timeRange: 'day',
    tags: ['daily'],
    weight: 0.7,
  },
  {
    id: 'day-14',
    text: '桌角那颗糖是法厄同大人的吗？……不是的话，薇薇安可以吃吗？',
    timeRange: 'day',
    tags: ['daily'],
    weight: 0.7,
  },
  {
    id: 'evening-08',
    text: '傍晚的风里有雨的味道。伞薇薇安放在门边了，法厄同大人。',
    timeRange: 'evening',
    tags: ['daily'],
    weight: 0.9,
  },
  {
    id: 'evening-09',
    text: '法厄同大人，新闻说厄匹斯港又有人看见了怪盗。……不是薇薇安，是雨果啦！',
    timeRange: 'evening',
    tags: ['daily'],
    weight: 0.5,
  },
  {
    id: 'evening-10',
    text: '要不要薇薇安把灯调暗一点？这样法厄同大人看屏幕会舒服些。',
    timeRange: 'evening',
    tags: ['daily'],
    weight: 0.8,
  },
  {
    id: 'evening-11',
    text: '一天里最喜欢这个时候。灯一关，代表着一天忙碌的结束。法厄同大人呢？',
    timeRange: 'evening',
    tags: ['daily'],
    weight: 0.7,
  },
  {
    id: 'night-08',
    text: '夜深了，法厄同大人。窗户我留了一条缝，透透气吧。',
    timeRange: 'night',
    tags: ['daily'],
    weight: 0.8,
  },
  {
    id: 'night-09',
    text: '法厄同大人还不睡的话，薇薇安就陪您再坐一会儿。困了要告诉薇薇安。',
    timeRange: 'night',
    tags: ['daily'],
    weight: 0.7,
  },
  {
    id: 'night-11',
    text: '睡不着的话，薇薇安给法厄同大人读一段纪录片旁白吧。声音会很轻很轻的。',
    timeRange: 'night',
    tags: ['daily'],
    weight: 0.6,
  },
  {
    id: 'night-12',
    text: '法厄同大人有没有那种，明明很困但不想睡的时候？……薇薇安陪您。',
    timeRange: 'night',
    tags: ['daily'],
    weight: 0.8,
  },
  {
    id: 'any-14',
    text: '计划没有变。今天也照原样，陪在法厄同大人身边。',
    timeRange: 'any',
    tags: ['daily'],
    weight: 0.5,
  },
  {
    id: 'any-15',
    text: '薇薇安最近在写一首歌。……不、不是「降临在空洞」什么的啦……',
    timeRange: 'any',
    tags: ['daily'],
    weight: 0.5,
  },
  {
    id: 'any-17',
    text: '伞我带了。要是下雨，就和法厄同大人一起走一段吧。',
    timeRange: 'any',
    tags: ['daily'],
    weight: 0.6,
  },
  {
    id: 'any-18',
    text: '法厄同大人要是忙到忘了吃饭，薇薇安会提醒您的。',
    timeRange: 'any',
    tags: ['daily'],
    weight: 0.7,
  },
  {
    id: 'any-21',
    text: '刚才眼睛有点酸……大概是薇薇安盯屏幕太久了。法厄同大人也是，歇一会儿吧。',
    timeRange: 'any',
    tags: ['daily'],
    weight: 0.6,
  },
  {
    id: 'any-22',
    text: '法厄同大人认真做事的时候，薇薇安都不太敢出声。……需要我安静就眨眨眼。',
    timeRange: 'any',
    tags: ['daily'],
    weight: 0.7,
  },
  {
    id: 'any-25',
    text: '法厄同大人今天话比平时少。……是薇薇安多心了吗？',
    timeRange: 'any',
    tags: ['daily'],
    weight: 0.7,
  },
]
