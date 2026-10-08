const MIN_COUNT = 2;
const MAX_COUNT = 6;
const CANCEL_DISTANCE = -50; // 上滑超过 50px 视为取消

// 出行方式关键词（长词优先）
const TRANSPORT_KEYWORDS = [
  { keyword: '步行', value: '步行' },
  { keyword: '走路', value: '步行' },
  { keyword: '开车', value: '开车' },
  { keyword: '自驾', value: '开车' },
  { keyword: '地铁', value: '地铁' },
  { keyword: '公交', value: '公交' }
];

// 场所类型关键词（PRD 六大类）
const PLACE_KEYWORDS = [
  '中餐', '西餐', '快餐', '咖啡厅', '奶茶', '甜品',
  '商场', '超市',
  '酒吧', 'KTV', '棋牌游戏', '网吧', '游乐场', '洗浴推拿',
  '网球', '篮球', '足球', '溜冰', '游泳', '乒乓球', '台球', '羽毛球', '滑雪', '跆拳道', '保龄球', '健身房',
  '电影院', '音乐厅', '剧场',
  '公园广场', '景区', '博物馆', '美术馆', '图书馆'
];

// 地点关键词，用于从文本中兜底提取出发地
const POI_KEYWORDS = ['双流机场', '武侯祠', '春熙路', '天府广场', '宽窄巷子', '成都东站', '环球中心'];

// 本地 mock 的 ASR 结果（无网络请求）：第 1 次完整、第 2 次缺项，便于测试两种状态
const MOCK_ASR_TEXTS = [
  '我们仨从双流机场、武侯祠出发，坐地铁，想找咖啡厅',
  '想找咖啡厅'
];

Page({
  data: {
    maxCount: MAX_COUNT,
    canAdd: true,
    canNext: false,

    departureList: [
      { id: 1, label: '我', value: '', showClear: false },
      { id: 2, label: '2', value: '', showClear: false }
    ],

    // 语音相关状态
    hasVoiceData: false,
    voiceStatus: 'idle', // idle | recording | recognizing | result
    recordingTime: '00:00',
    recordSeconds: 0,
    cancelTip: false,
    waveBars: [0, 1, 2, 3, 4, 5, 6],
    voiceText: '',
    voiceTags: [],
    voiceComplete: false,
    voiceMissingTip: '',

    // 互斥弹窗
    showDialog: false,
    dialogType: '',
    dialogTitle: '',
    dialogDesc: '',
    dialogConfirmText: ''
  },

  onLoad() {
    this.mockRound = 0;
    this.updateState(this.data.departureList);
  },

  onUnload() {
    this.clearTimers();
  },

  onHide() {
    this.clearTimers();
  },

  /* ---------------- 出发地列表 ---------------- */

  // 统一刷新派生状态：下一步可用性、添加按钮可用性
  updateState(departureList) {
    const allFilled = departureList.length > 0 &&
      departureList.every(item => item.value && item.value.trim().length > 0);
    const voiceReady = this.data.hasVoiceData && this.data.voiceComplete;

    this.setData({
      departureList,
      canNext: allFilled || voiceReady,
      canAdd: departureList.length < MAX_COUNT
    });
  },

  createDefaultList() {
    return [
      { id: 1, label: '我', value: '', showClear: false },
      { id: 2, label: '2', value: '', showClear: false }
    ];
  },

  // 重算标签：第一项固定「我」，其余为序号
  relabel(list) {
    return list.map((item, index) => ({
      id: item.id,
      label: index === 0 ? '我' : String(index + 1),
      value: item.value,
      showClear: item.showClear
    }));
  },

  onDepartureInput(e) {
    if (this.data.hasVoiceData) {
      this.openDialog('toManual');
      return;
    }

    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    const list = this.data.departureList.slice();

    list[index] = {
      id: list[index].id,
      label: list[index].label,
      value,
      showClear: value.length > 0
    };

    this.updateState(list);
  },

  onDepartureFocus() {
    if (this.data.hasVoiceData) {
      this.openDialog('toManual');
    }
  },

  onClearInput(e) {
    const index = e.currentTarget.dataset.index;
    const list = this.data.departureList.slice();

    list[index] = {
      id: list[index].id,
      label: list[index].label,
      value: '',
      showClear: false
    };

    this.updateState(list);
  },

  onDeleteDeparture(e) {
    const index = e.currentTarget.dataset.index;

    // 第一项「我」始终不可删除
    if (index === 0) {
      return;
    }

    // PRD：聚会最少 2 人 —— 只剩 2 个出发地时禁止删除
    if (this.data.departureList.length <= MIN_COUNT) {
      wx.showToast({
        title: '至少需要 2 个出发地',
        icon: 'none'
      });
      return;
    }

    const list = this.data.departureList.filter((item, i) => i !== index);

    // 删除后重算标签：第一项固定「我」，其余按顺序重排（3 删掉后 4 变 3）
    this.updateState(this.relabel(list));
  },

  onAddDeparture() {
    if (!this.data.canAdd) {
      return;
    }

    const list = this.data.departureList.slice();
    list.push({
      id: Date.now(),
      label: String(list.length + 1),
      value: '',
      showClear: false
    });

    this.updateState(this.relabel(list));
  },

  hasManualInput() {
    return this.data.departureList.some(item => item.value && item.value.trim().length > 0);
  },

  /* ---------------- 录音交互 ---------------- */

  onVoiceTouchStart(e) {
    if (this.data.voiceStatus === 'recording' || this.data.voiceStatus === 'recognizing') {
      return;
    }

    // 已有手动内容：先弹互斥确认
    if (this.hasManualInput()) {
      this.openDialog('toVoice');
      return;
    }

    const touch = e.touches && e.touches[0];
    this.startY = touch ? touch.clientY : 0;
    this.startRecord();
  },

  onVoiceTouchMove(e) {
    if (this.data.voiceStatus !== 'recording') {
      return;
    }

    const touch = e.touches && e.touches[0];
    if (!touch) {
      return;
    }

    const diff = touch.clientY - this.startY;
    const cancelTip = diff < CANCEL_DISTANCE;

    if (cancelTip !== this.data.cancelTip) {
      this.setData({ cancelTip });
    }
  },

  onVoiceTouchEnd() {
    if (this.data.voiceStatus !== 'recording') {
      return;
    }

    this.stopRecord(this.data.cancelTip);
  },

  onVoiceTouchCancel() {
    if (this.data.voiceStatus !== 'recording') {
      return;
    }

    this.stopRecord(true);
  },

  startRecord() {
    this.clearTimers();

    this.setData({
      voiceStatus: 'recording',
      recordSeconds: 0,
      recordingTime: '00:00',
      cancelTip: false,
      voiceText: '',
      voiceTags: [],
      voiceComplete: false,
      voiceMissingTip: ''
    });

    this.recordTimer = setInterval(() => {
      const seconds = this.data.recordSeconds + 1;
      this.setData({
        recordSeconds: seconds,
        recordingTime: this.formatTime(seconds)
      });
    }, 1000);
  },

  stopRecord(cancelled) {
    this.clearRecordTimer();

    if (cancelled) {
      wx.showToast({ title: '已取消', icon: 'none' });
      this.setData({
        voiceStatus: 'idle',
        recordSeconds: 0,
        recordingTime: '00:00',
        cancelTip: false
      });
      return;
    }

    // 松手后进入识别中，2 秒后返回 mock 结果
    this.setData({
      voiceStatus: 'recognizing',
      cancelTip: false
    });

    this.recognizeTimer = setTimeout(() => {
      this.recognizeTimer = null;
      this.finishRecognize();
    }, 2000);
  },

  formatTime(seconds) {
    const s = seconds < 10 ? '0' + seconds : String(seconds);
    return '00:' + s;
  },

  /* ---------------- 识别与解析（本地 mock） ---------------- */

  finishRecognize() {
    const text = MOCK_ASR_TEXTS[this.mockRound % MOCK_ASR_TEXTS.length];
    this.mockRound += 1;

    this.setData({
      voiceStatus: 'result',
      voiceText: text
    });

    this.applyParse(text);
  },

  onVoiceTextInput(e) {
    const text = e.detail.value;
    this.setData({ voiceText: text });
    this.applyParse(text);
  },

  // 解析文本 → 标签 + 缺项提示 + 下一步可用性
  applyParse(text) {
    const parsed = this.parseVoiceText(text || '');
    const tags = [];

    if (parsed.count) {
      tags.push({ key: '人数', value: parsed.count + '人' });
    }
    parsed.departures.forEach(item => {
      tags.push({ key: '出发地', value: item.name });
    });
    if (parsed.transport) {
      tags.push({ key: '出行方式', value: parsed.transport });
    }
    parsed.preferences.forEach(item => {
      tags.push({ key: '场所', value: item });
    });

    const missing = parsed.missingItems;
    const complete = missing.length === 0 && !!(text && text.trim().length > 0);

    this.setData({
      voiceTags: tags,
      voiceComplete: complete,
      voiceMissingTip: complete
        ? ''
        : '请重说，还缺 ' + missing.length + ' 项，请补充（' + missing.join('·') + '）',
      hasVoiceData: !!(text && text.trim().length > 0)
    });

    this.updateState(this.data.departureList);
  },

  parseVoiceText(text) {
    const departures = [];
    const missingItems = [];
    const upperText = text.toUpperCase();

    // 人数
    let count = 0;
    const numMatch = text.match(/(\d+)\s*[人个位]/);
    if (numMatch) {
      count = parseInt(numMatch[1], 10);
    } else if (text.indexOf('仨') > -1) {
      count = 3;
    } else if (text.indexOf('俩') > -1 || text.indexOf('两个') > -1) {
      count = 2;
    }

    // 出发地：优先取「从……出发」
    const fromMatch = text.match(/从(.+?)(?:出发|过去|过来|走)/);
    if (fromMatch) {
      fromMatch[1].split(/[、,，和及\s]+/).forEach(name => {
        const place = name.replace(/[（(].*?[)）]/g, '').trim();
        if (place && place.length <= 12 && !this.isTransportWord(place)) {
          departures.push({ name: place });
        }
      });
    }
    if (departures.length === 0) {
      POI_KEYWORDS.forEach(name => {
        if (text.indexOf(name) > -1) {
          departures.push({ name });
        }
      });
    }

    // 出行方式
    let transport = '';
    for (let i = 0; i < TRANSPORT_KEYWORDS.length; i++) {
      if (text.indexOf(TRANSPORT_KEYWORDS[i].keyword) > -1) {
        transport = TRANSPORT_KEYWORDS[i].value;
        break;
      }
    }

    // 场所偏好
    let preferences = [];
    if (/都行|随便|都可以|无所谓/.test(text)) {
      preferences = PLACE_KEYWORDS.slice();
    } else {
      PLACE_KEYWORDS.forEach(name => {
        const hit = name === 'KTV'
          ? upperText.indexOf('KTV') > -1
          : text.indexOf(name) > -1;
        if (hit && preferences.indexOf(name) === -1) {
          preferences.push(name);
        }
      });
    }

    // 缺项（顺序与提示文案一致）
    if (departures.length === 0) {
      missingItems.push('出发地');
    }
    if (!count) {
      missingItems.push('人数');
    }
    if (!transport) {
      missingItems.push('出行方式');
    }
    if (preferences.length === 0) {
      missingItems.push('场所偏好');
    }

    return {
      count,
      departures,
      transport,
      preferences,
      missingItems
    };
  },

  isTransportWord(word) {
    return TRANSPORT_KEYWORDS.some(item => item.keyword === word);
  },

  /* ---------------- 状态切换与弹窗 ---------------- */

  switchToVoice() {
    this.resetVoice();
    this.setData({ hasVoiceData: false });
    this.updateState(this.createDefaultList());
  },

  switchToManual() {
    this.resetVoice();
    this.setData({ hasVoiceData: false });
    this.updateState(this.createDefaultList());
  },

  resetVoice() {
    this.clearTimers();
    this.setData({
      voiceStatus: 'idle',
      recordingTime: '00:00',
      recordSeconds: 0,
      cancelTip: false,
      voiceText: '',
      voiceTags: [],
      voiceComplete: false,
      voiceMissingTip: ''
    });
  },

  clearRecordTimer() {
    if (this.recordTimer) {
      clearInterval(this.recordTimer);
      this.recordTimer = null;
    }
  },

  clearTimers() {
    this.clearRecordTimer();
    if (this.recognizeTimer) {
      clearTimeout(this.recognizeTimer);
      this.recognizeTimer = null;
    }
  },

  openDialog(type) {
    if (type === 'toVoice') {
      this.setData({
        dialogType: 'toVoice',
        dialogTitle: '切换为语音输入？',
        dialogDesc: '你已手动填写了出发地，改用语音输入会清空已填内容',
        dialogConfirmText: '清空并用语音',
        showDialog: true
      });
      return;
    }

    this.setData({
      dialogType: 'toManual',
      dialogTitle: '切换为手动输入？',
      dialogDesc: '你已用语音识别出信息，改用手动输入会清空语音内容',
      dialogConfirmText: '清空并手动填',
      showDialog: true
    });
  },

  closeDialog() {
    this.setData({
      showDialog: false,
      dialogType: '',
      dialogTitle: '',
      dialogDesc: '',
      dialogConfirmText: ''
    });
  },

  onDialogCancel() {
    this.closeDialog();
  },

  onDialogConfirm() {
    const type = this.data.dialogType;

    this.closeDialog();

    if (type === 'toVoice') {
      this.switchToVoice();
      return;
    }

    this.switchToManual();
  },

  /* ---------------- 下一步：校验 + 跳转 ---------------- */

  onNext() {
    const departureList = this.data.departureList || [];
    const emptyItems = departureList.filter(item => !item.value || item.value.trim().length === 0);

    if (departureList.length === 0 || emptyItems.length > 0) {
      // 语音路径：信息完整时用解析出的出发地继续（不强制要求手动填写）
      if (this.data.hasVoiceData && this.data.voiceComplete) {
        const parsed = this.parseVoiceText(this.data.voiceText || '');
        this.buildPersonList(parsed.departures.map(item => item.name), parsed.transport);
        return;
      }

      wx.showToast({
        title: '还有 ' + (emptyItems.length || 1) + ' 个出发地没有填写',
        icon: 'none'
      });
      return;
    }

    const locations = departureList.map(item => item.value.trim());

    this.buildPersonList(locations, '');
  },

  // 组装参与人数据（字段与选择偏好页保持一致）并跳转
  buildPersonList(locations, transport) {
    const personList = locations.map((location, index) => ({
      id: index + 1,
      name: index === 0 ? '我' : String(index + 1),
      location,
      transport: transport || '地铁'
    }));

    const personParam = encodeURIComponent(JSON.stringify(personList));
    const preferencesParam = '';

    wx.navigateTo({
      url: '/pages/preference/preference?personList=' + personParam + preferencesParam,
      fail: () => {
        wx.showToast({
          title: '页面跳转失败，请稍后重试',
          icon: 'none'
        });
      }
    });
  }
});
