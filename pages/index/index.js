const api = require('../../utils/api');
const MIN_COUNT = 2;
const MAX_COUNT = 6;
const MAX_RECORD_SECONDS = 45;
const CANCEL_DISTANCE = -50;
const FIELD_LABELS = {
  partySize: '人数', origins: '出发地', transportModes: '出行方式', placePreferences: '场所偏好'
};

function emptyPerson(index) {
  return {
    participantId: index === 0 ? 'self' : 'p' + index,
    label: index === 0 ? '我' : String(index + 1),
    value: '', poi: null, suggestions: [], searching: false, searchMessage: ''
  };
}

Page({
  data: {
    maxCount: MAX_COUNT,
    canAdd: true,
    canNext: false,
    activeDepartureIndex: -1,
    departureList: [emptyPerson(0), emptyPerson(1)],
    hasVoiceData: false,
    voiceStatus: 'idle',
    recordingTime: '00:00',
    recordSeconds: 0,
    cancelTip: false,
    waveBars: [0, 1, 2, 3, 4, 5, 6],
    voiceText: '',
    voiceTags: [],
    voiceComplete: false,
    voiceMissingTip: '',
    showDialog: false,
    dialogType: '',
    dialogTitle: '',
    dialogDesc: '',
    dialogConfirmText: ''
  },

  onLoad() {
    this.destroyed = false;
    this.voicePressActive = false;
    this.searchTimers = {};
    this.searchSerials = {};
    this.searchGeneration = 0;
    this.intentSerial = 0;
    this.setupRecorder();
    this.updateState(this.data.departureList);
  },

  onUnload() { this.destroyed = true; this.voicePressActive = false; this.clearTimers(); },
  onHide() { this.clearRecordTimer(); },

  setupRecorder() {
    if (!wx.getRecorderManager) return;
    this.recorder = wx.getRecorderManager();
    this.recorder.onStop(res => {
      if (this.cancelRecording) return;
      this.recognizeRecording(res.tempFilePath, res.duration);
    });
    this.recorder.onError(err => {
      this.clearRecordTimer();
      this.voicePressActive = false;
      this.setData({ voiceStatus: 'idle' });
      wx.showToast({ title: (err && err.errMsg) || '录音失败，请重试', icon: 'none' });
    });
  },

  relabel(list) {
    return list.map((item, index) => Object.assign({}, item, {
      participantId: index === 0 ? 'self' : 'p' + index,
      label: index === 0 ? '我' : String(index + 1)
    }));
  },

  nextUnconfirmedIndex(list, afterIndex = -1) {
    for (let offset = 1; offset <= list.length; offset += 1) {
      const index = (afterIndex + offset) % list.length;
      if (!list[index].poi || !list[index].poi.id) return index;
    }
    return -1;
  },

  invalidateDepartureSearches() {
    this.searchGeneration += 1;
    Object.keys(this.searchTimers).forEach(key => clearTimeout(this.searchTimers[key]));
    this.searchTimers = {};
    this.searchSerials = {};
  },

  updateState(list, activeDepartureIndex = this.data.activeDepartureIndex) {
    const valid = list.length >= MIN_COUNT && list.every(item => item.poi && item.poi.id);
    const intentComplete = this.voiceIntent && !(this.voiceIntent.missingFields || []).length && this.voiceIntent.confidence >= 0.6;
    this.setData({
      departureList: list,
      activeDepartureIndex: activeDepartureIndex < list.length ? activeDepartureIndex : -1,
      canNext: valid,
      canAdd: list.length < MAX_COUNT,
      voiceComplete: this.data.hasVoiceData ? !!(valid && intentComplete) : false,
      voiceMissingTip: this.data.hasVoiceData && valid && intentComplete ? '' : this.data.voiceMissingTip
    });
  },

  onDepartureInput(e) {
    if (this.data.hasVoiceData && this.data.voiceComplete) {
      this.openDialog('toManual');
      return;
    }
    const index = Number(e.currentTarget.dataset.index);
    if (!this.data.departureList[index]) return;
    this.intentSerial += 1;
    clearTimeout(this.parseTimer);
    const value = e.detail.value;
    const list = this.data.departureList.slice();
    list[index] = Object.assign({}, list[index], { value, poi: null, suggestions: [], searching: false, searchMessage: '' });
    this.updateState(list, index);
    clearTimeout(this.searchTimers[index]);
    this.searchSerials[index] = (this.searchSerials[index] || 0) + 1;
    if (!value.trim()) return;
    this.searchTimers[index] = setTimeout(() => this.loadSuggestions(index, value.trim()), 250);
  },

  async loadSuggestions(index, keyword) {
    const row = this.data.departureList[index];
    if (!row || row.value.trim() !== keyword) return;
    clearTimeout(this.searchTimers[index]);
    delete this.searchTimers[index];
    const generation = this.searchGeneration;
    const serial = (this.searchSerials[index] || 0) + 1;
    this.searchSerials[index] = serial;
    const key = 'departureList[' + index + ']';
    this.setData({ [key + '.searching']: true, [key + '.searchMessage']: '' });
    try {
      const suggestions = await api.searchPOI({ keyword, city: '成都', limit: 10 });
      if (this.destroyed || generation !== this.searchGeneration || serial !== this.searchSerials[index]) return;
      const current = this.data.departureList[index];
      if (!current || current.value.trim() !== keyword) return;
      this.setData({
        [key + '.suggestions']: suggestions,
        [key + '.searching']: false,
        [key + '.searchMessage']: suggestions.length ? '' : '没有找到该地点，请重新输入'
      });
    } catch (err) {
      if (this.destroyed || generation !== this.searchGeneration || serial !== this.searchSerials[index]) return;
      this.setData({ [key + '.suggestions']: [], [key + '.searching']: false, [key + '.searchMessage']: err.message });
    }
  },

  onSelectPOI(e) {
    const index = Number(e.currentTarget.dataset.index);
    const poiIndex = Number(e.currentTarget.dataset.poiIndex);
    if (index !== this.data.activeDepartureIndex) return;
    const list = this.data.departureList.slice();
    const poi = list[index] && list[index].suggestions[poiIndex];
    if (!poi) return;
    clearTimeout(this.searchTimers[index]);
    this.searchSerials[index] = (this.searchSerials[index] || 0) + 1;
    list[index] = Object.assign({}, list[index], { value: poi.title, poi, suggestions: [], searching: false, searchMessage: '' });
    this.updateState(list, this.data.hasVoiceData ? this.nextUnconfirmedIndex(list, index) : -1);
  },

  onDepartureFocus(e) {
    if (this.data.hasVoiceData && this.data.voiceComplete) { this.openDialog('toManual'); return; }
    const index = e && Number(e.currentTarget.dataset.index);
    if (Number.isInteger(index) && this.data.departureList[index]) this.setData({ activeDepartureIndex: index });
  },

  onClearInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const list = this.data.departureList.slice();
    if (!list[index]) return;
    this.intentSerial += 1;
    clearTimeout(this.parseTimer);
    clearTimeout(this.searchTimers[index]);
    this.searchSerials[index] = (this.searchSerials[index] || 0) + 1;
    list[index] = Object.assign({}, list[index], { value: '', poi: null, suggestions: [], searching: false, searchMessage: '' });
    this.updateState(list, index);
  },

  onDeleteDeparture(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (index === 0) return;
    if (this.data.departureList.length <= MIN_COUNT) {
      wx.showToast({ title: '至少需要2个出发地', icon: 'none' });
      return;
    }
    this.intentSerial += 1;
    clearTimeout(this.parseTimer);
    const pendingIndices = [];
    this.data.departureList.forEach((item, i) => {
      if (i !== index && !item.poi && item.value.trim() && (item.searching || this.searchTimers[i])) {
        pendingIndices.push(i > index ? i - 1 : i);
      }
    });
    this.invalidateDepartureSearches();
    const list = this.relabel(this.data.departureList.filter((item, i) => i !== index))
      .map(item => Object.assign({}, item, { searching: false }));
    const active = this.data.activeDepartureIndex;
    const next = active === index ? this.nextUnconfirmedIndex(list, index - 1) : (active > index ? active - 1 : active);
    this.updateState(list, next);
    pendingIndices.forEach(i => this.loadSuggestions(i, list[i].value.trim()));
  },

  onAddDeparture() {
    if (!this.data.canAdd) return;
    const list = this.data.departureList.slice();
    list.push(emptyPerson(list.length));
    this.updateState(this.relabel(list));
  },

  hasManualInput() { return this.data.departureList.some(item => item.value && item.value.trim()); },

  onVoiceTouchStart(e) {
    if (this.voicePressActive || this.data.voiceStatus === 'recording' || this.data.voiceStatus === 'recognizing') return;
    if (this.hasManualInput() && !this.data.hasVoiceData) { this.openDialog('toVoice'); return; }
    this.voicePressActive = true;
    const touch = e.touches && e.touches[0];
    this.startY = touch ? touch.clientY : 0;
    this.requestRecordPermission();
  },

  requestRecordPermission() {
    if (!this.recorder) {
      this.voicePressActive = false;
      wx.showToast({ title: '当前环境不支持录音', icon: 'none' });
      return;
    }
    wx.authorize({
      scope: 'scope.record',
      success: () => { if (this.voicePressActive && !this.destroyed) this.startRecord(); },
      fail: () => {
        this.voicePressActive = false;
        wx.showModal({
          title: '需要录音权限',
          content: '请在设置中允许录音，或改用手动输入',
          confirmText: '去设置',
          success: res => { if (res.confirm) wx.openSetting({}); }
        });
      }
    });
  },

  startRecord() {
    this.clearTimers();
    this.invalidateDepartureSearches();
    this.intentSerial += 1;
    this.setData({ activeDepartureIndex: -1 });
    this.cancelRecording = false;
    this.setData({ voiceStatus: 'recording', recordSeconds: 0, recordingTime: '00:00', cancelTip: false, voiceMissingTip: '' });
    this.recordTimer = setInterval(() => {
      const seconds = this.data.recordSeconds + 1;
      this.setData({ recordSeconds: seconds, recordingTime: '00:' + String(seconds).padStart(2, '0') });
      if (seconds >= MAX_RECORD_SECONDS) this.stopRecord(false);
    }, 1000);
    this.recorder.start({ duration: MAX_RECORD_SECONDS * 1000, format: 'mp3', sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000 });
  },

  onVoiceTouchMove(e) {
    if (this.data.voiceStatus !== 'recording') return;
    const touch = e.touches && e.touches[0];
    if (touch) this.setData({ cancelTip: touch.clientY - this.startY < CANCEL_DISTANCE });
  },
  onVoiceTouchEnd() {
    this.voicePressActive = false;
    if (this.data.voiceStatus === 'recording') this.stopRecord(this.data.cancelTip);
  },
  onVoiceTouchCancel() {
    this.voicePressActive = false;
    if (this.data.voiceStatus === 'recording') this.stopRecord(true);
  },

  stopRecord(cancelled) {
    this.clearRecordTimer();
    this.voicePressActive = false;
    this.cancelRecording = !!cancelled;
    this.setData({ voiceStatus: cancelled ? 'idle' : 'recognizing', cancelTip: false });
    if (cancelled) wx.showToast({ title: '已取消', icon: 'none' });
    this.recorder.stop();
  },

  async recognizeRecording(tempFilePath, duration) {
    try {
      const asr = await api.asrRecognize({ tempFilePath, audioDurationMs: duration });
      if (this.destroyed) return;
      this.setData({ voiceStatus: 'result', voiceText: asr.text, hasVoiceData: true });
      await this.applyIntent(asr.text);
    } catch (err) {
      if (this.destroyed) return;
      this.setData({ voiceStatus: 'idle', voiceComplete: false, voiceMissingTip: err.message });
      wx.showToast({ title: err.message, icon: 'none' });
    }
  },

  onVoiceTextInput(e) {
    const text = e.detail.value;
    this.intentSerial += 1;
    this.invalidateDepartureSearches();
    this.setData({ voiceText: text, voiceComplete: false, canNext: false, activeDepartureIndex: -1 });
    clearTimeout(this.parseTimer);
    this.parseTimer = setTimeout(() => this.applyIntent(text), 350);
  },

  async applyIntent(text) {
    if (!text || !text.trim()) return;
    const serial = ++this.intentSerial;
    this.invalidateDepartureSearches();
    this.setData({ activeDepartureIndex: -1 });
    try {
      const intent = await api.parseIntent({ text: text.trim() });
      if (this.destroyed || serial !== this.intentSerial) return;
      const partySize = Math.min(MAX_COUNT, Math.max(MIN_COUNT, intent.partySize || intent.origins.length || MIN_COUNT));
      const rows = Array.from({ length: partySize }, (item, index) => emptyPerson(index));
      await Promise.all((intent.origins || []).slice(0, partySize).map(async (name, index) => {
        rows[index].value = name;
        try {
          const candidates = await api.searchPOI({ keyword: name, city: '成都', limit: 10 });
          const exact = candidates.filter(item => item.title === name);
          rows[index].suggestions = candidates;
          if (exact.length === 1) { rows[index].poi = exact[0]; rows[index].value = exact[0].title; rows[index].suggestions = []; }
          else rows[index].searchMessage = candidates.length ? '请选择具体地点' : '没有找到该地点，请重新输入';
        } catch (err) { rows[index].searchMessage = err.message; }
      }));
      if (this.destroyed || serial !== this.intentSerial) return;
      const missingNames = (intent.missingFields || []).map(item => FIELD_LABELS[item] || item);
      const invalidCount = rows.filter(item => !item.poi).length;
      if (invalidCount && missingNames.indexOf('出发地') < 0) missingNames.push('出发地');
      if (intent.confidence < 0.6) missingNames.push('请确认识别结果');
      const tags = [];
      if (intent.partySize) tags.push({ key: '人数', value: intent.partySize + '人' });
      (intent.origins || []).forEach(value => tags.push({ key: '出发地', value }));
      (intent.transportModes || []).forEach(value => tags.push({ key: '出行方式', value: this.transportLabel(value) }));
      (intent.placePreferences || []).slice(0, 6).forEach(value => tags.push({ key: '场所', value }));
      const complete = missingNames.length === 0;
      this.voiceIntent = intent;
      this.setData({
        voiceTags: tags,
        voiceComplete: complete,
        voiceMissingTip: complete ? '' : '还需补充或确认：' + missingNames.join('、'),
        hasVoiceData: true
      });
      this.updateState(rows, this.nextUnconfirmedIndex(rows));
    } catch (err) {
      if (this.destroyed || serial !== this.intentSerial) return;
      this.voiceIntent = null;
      this.setData({ voiceComplete: false, voiceMissingTip: err.message });
    }
  },

  transportLabel(value) {
    const item = api.transportOptions.find(option => option.value === value);
    return item ? item.label : value;
  },

  switchToVoice() { this.resetAll(); },
  switchToManual() { this.resetAll(); },
  resetAll() {
    this.intentSerial += 1;
    this.invalidateDepartureSearches();
    clearTimeout(this.parseTimer);
    this.voiceIntent = null;
    this.setData({ hasVoiceData: false, voiceStatus: 'idle', voiceText: '', voiceTags: [], voiceComplete: false, voiceMissingTip: '' });
    this.updateState([emptyPerson(0), emptyPerson(1)], -1);
  },

  openDialog(type) {
    const toVoice = type === 'toVoice';
    this.setData({
      dialogType: type,
      dialogTitle: toVoice ? '切换为语音输入？' : '切换为手动输入？',
      dialogDesc: toVoice ? '改用语音会清空已填内容' : '改用手动输入会清空语音内容',
      dialogConfirmText: toVoice ? '清空并用语音' : '清空并手动填',
      showDialog: true
    });
  },
  closeDialog() { this.setData({ showDialog: false, dialogType: '', dialogTitle: '', dialogDesc: '', dialogConfirmText: '' }); },
  onDialogCancel() { this.closeDialog(); },
  onDialogConfirm() {
    const type = this.data.dialogType;
    this.closeDialog();
    this.resetAll();
    if (type === 'toVoice') wx.showToast({ title: '请按住说话', icon: 'none' });
  },

  onNext() {
    const invalid = this.data.departureList.filter(item => !item.poi || !item.poi.id);
    if (invalid.length) {
      wx.showToast({ title: '还有' + invalid.length + '个出发地未选择具体地点', icon: 'none' });
      return;
    }
    const transportMode = this.voiceIntent && this.voiceIntent.transportModes[0];
    getApp().globalData.pendingDraft = {
      participants: this.data.departureList.map((item, index) => ({
        participantId: item.participantId,
        label: item.label,
        poiId: item.poi.id,
        name: item.poi.title,
        lat: item.poi.lat,
        lng: item.poi.lng,
        transportMode: transportMode || 'subway'
      })),
      preferences: (this.voiceIntent && this.voiceIntent.placePreferences) || []
    };
    wx.navigateTo({ url: '/pages/preference/preference' });
  },

  clearRecordTimer() { if (this.recordTimer) { clearInterval(this.recordTimer); this.recordTimer = null; } },
  clearTimers() {
    this.clearRecordTimer();
    clearTimeout(this.parseTimer);
    Object.keys(this.searchTimers || {}).forEach(key => clearTimeout(this.searchTimers[key]));
  }
});
