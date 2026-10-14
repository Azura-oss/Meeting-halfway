const api = require('../../utils/api');
const COLORS = ['#07C160', '#1989FA', '#FF9500', '#FA5151', '#8E44AD', '#00B8D9'];
const DEFAULT_MAP = { lat: 30.67, lng: 104.06 };

Page({
  data: {
    loading: true,
    loadingText: '正在为你计算碰面点，大家都不吃亏的位置',
    errorMessage: '',
    mapLat: DEFAULT_MAP.lat,
    mapLng: DEFAULT_MAP.lng,
    markers: [],
    polylines: [],
    midpoint: {},
    arrivalList: [],
    distanceExpanded: false,
    searchRadiusMeters: 1000,
    departures: [],
    preferences: [],
    showStrategy: false,
    strategy: 'least_transfer',
    strategyList: api.strategyList,
    places: [],
    selectedPlaceId: '',
    selectedPlaceName: '',
    routeLegend: [],
    routeLoading: false,
    routeError: '',
    pinnedIds: [],
    favoritedIds: [],
    favoriteBusyId: ''
  },

  onLoad() {
    this.destroyed = false;
    this.requestSerial = 0;
    this.routeSerial = 0;
    const context = getApp().globalData.pendingSearchContext;
    if (!context || !Array.isArray(context.departures) || !context.departures.length) {
      this.setData({ loading: false, errorMessage: '搜索条件已失效，请返回重新填写' });
      return;
    }
    this.context = context;
    this.searchedAt = context.searchedAt || new Date().toISOString();
    const showStrategy = context.departures.every(item => item.transportMode === 'subway');
    this.setData({
      departures: context.departures,
      preferences: context.preferences || [],
      strategy: showStrategy ? (context.strategy || 'least_transfer') : null,
      showStrategy,
      pinnedIds: context.pinnedIds || [],
      favoritedIds: context.favoritedIds || []
    });
    const snapshot = context.resultSnapshot;
    if (context.fromHistory && snapshot && Array.isArray(snapshot.places) && snapshot.places.length) {
      this.applyRecommendation({
        midpoint: context.midpoint,
        searchRadiusMeters: context.searchRadiusMeters,
        distanceExpanded: context.distanceExpanded,
        strategy: context.strategy,
        places: snapshot.places
      });
      return;
    }
    this.loadRecommendations(false);
  },

  onShow() {
    if (!this.context || this.destroyed) return;
    const detailContext = getApp().globalData.detailContext;
    const change = detailContext && detailContext.favoriteChange;
    if (!change || change.placeId !== detailContext.placeId) return;
    delete detailContext.favoriteChange;
    if (!this.data.places.some(item => item.id === change.placeId)) return;
    this.applyFavoriteState(change.placeId, change.isFavorite);
    this.saveHistorySnapshot();
  },

  onUnload() { this.destroyed = true; },

  async loadRecommendations(isStrategyChange) {
    const serial = ++this.requestSerial;
    this.setData({ loading: true, errorMessage: '', polylines: [], routeLegend: [], selectedPlaceId: '' });
    try {
      const result = await api.getRecommendations({
        departures: this.data.departures,
        preferences: this.data.preferences,
        strategy: this.data.showStrategy ? this.data.strategy : null,
        midpointMode: 'auto'
      });
      if (this.destroyed || serial !== this.requestSerial) return;
      this.applyRecommendation(result);
      if (!this.context.fromHistory && !isStrategyChange) this.saveHistorySnapshot();
    } catch (err) {
      if (this.destroyed || serial !== this.requestSerial) return;
      this.setData({ loading: false, errorMessage: err.message || '网络开小差了' });
    }
  },

  applyRecommendation(result) {
    const responseFavoriteIds = (result.places || []).filter(item => item.isFavorite).map(item => item.id);
    const favoritedIds = this.context.fromHistory
      ? this.data.favoritedIds
      : Array.from(new Set(this.data.favoritedIds.concat(responseFavoriteIds)));
    const places = this.decorate(result.places || [], this.data.pinnedIds, favoritedIds);
    const midpoint = result.midpoint || {};
    this.currentResult = Object.assign({}, result, { places: (result.places || []).map(item => Object.assign({}, item)) });
    this.setData({
      loading: false,
      midpoint,
      mapLat: midpoint.lat || DEFAULT_MAP.lat,
      mapLng: midpoint.lng || DEFAULT_MAP.lng,
      distanceExpanded: !!result.distanceExpanded,
      searchRadiusMeters: result.searchRadiusMeters || 1000,
      strategy: this.data.showStrategy ? (result.strategy || this.data.strategy) : null,
      places,
      favoritedIds,
      markers: this.buildMarkers(midpoint, places),
      arrivalList: [],
      errorMessage: ''
    });
  },

  decorate(places, pinnedIds, favoritedIds) {
    const buckets = [[], [], []];
    places.forEach((place, order) => {
      const isPinned = pinnedIds.indexOf(place.id) >= 0;
      const isFavorite = favoritedIds.indexOf(place.id) >= 0 || (!this.context.fromHistory && !!place.isFavorite);
      const selfMetric = (place.participantMetrics || []).find(item => item.participantId === 'self');
      const item = Object.assign({}, place, {
        _order: typeof place._order === 'number' ? place._order : order,
        isPinned,
        isFavorite,
        selfDistanceMeters: selfMetric ? selfMetric.distanceMeters : null
      });
      buckets[isPinned ? 0 : (isFavorite ? 1 : 2)].push(item);
    });
    buckets.forEach(bucket => bucket.sort((a, b) => a._order - b._order));
    return buckets[0].concat(buckets[1], buckets[2]);
  },

  buildMarkers(midpoint, places, selected) {
    const markers = [];
    if (midpoint && typeof midpoint.lat === 'number') markers.push({
      id: 1, latitude: midpoint.lat, longitude: midpoint.lng, width: 30, height: 30,
      label: { content: '碰面点', color: '#07C160', fontSize: 11, anchorY: -40, borderRadius: 6, bgColor: '#FFFFFF', padding: 6 }
    });
    this.data.departures.forEach((item, index) => markers.push({
      id: 10 + index, latitude: item.lat, longitude: item.lng, width: 28, height: 28,
      label: { content: item.label, color: COLORS[index % COLORS.length], fontSize: 11, anchorY: -40, borderRadius: 6, bgColor: '#FFFFFF', padding: 6 }
    }));
    (places || []).forEach((place, index) => markers.push({
      id: 100 + index,
      latitude: place.lat,
      longitude: place.lng,
      width: selected && selected.id === place.id ? 34 : 26,
      height: selected && selected.id === place.id ? 34 : 26,
      label: selected && selected.id === place.id ? { content: place.name, color: '#FA5151', fontSize: 10, anchorY: -38, borderRadius: 6, bgColor: '#FFFFFF', padding: 5 } : undefined
    }));
    return markers;
  },

  samplePoints(points, max) {
    if (!Array.isArray(points) || points.length <= max) return points || [];
    const step = (points.length - 1) / (max - 1);
    return Array.from({ length: max }, (item, index) => points[Math.round(index * step)]);
  },

  async onSelectPlace(e) {
    const id = e.currentTarget.dataset.id;
    const place = this.data.places.find(item => item.id === id);
    if (!place) return;
    const serial = ++this.routeSerial;
    this.setData({
      selectedPlaceId: id,
      selectedPlaceName: place.name,
      routeLoading: true,
      routeError: '',
      polylines: [],
      routeLegend: [],
      markers: this.buildMarkers(this.data.midpoint, this.data.places, place),
      arrivalList: place.participantMetrics || []
    });
    try {
      const data = await api.getRoutes({
        placeId: id,
        departures: this.data.departures,
        strategy: this.data.showStrategy ? this.data.strategy : null
      });
      if (this.destroyed || serial !== this.routeSerial) return;
      const routes = data.routes || [];
      this.setData({
        routeLoading: false,
        polylines: routes.map((route, index) => ({
          points: this.samplePoints(route.points, 300).map(point => ({ latitude: point.lat, longitude: point.lng })),
          color: route.color || COLORS[index % COLORS.length],
          width: 4,
          arrowLine: true,
          borderWidth: 1,
          borderColor: '#FFFFFF'
        })),
        routeLegend: routes.map((route, index) => ({
          name: route.label,
          color: route.color || COLORS[index % COLORS.length],
          durationMinutes: route.durationMinutes
        }))
      });
    } catch (err) {
      if (this.destroyed || serial !== this.routeSerial) return;
      this.setData({ routeLoading: false, routeError: err.message || '路线加载失败' });
    }
  },

  retryRoute() {
    if (!this.data.selectedPlaceId) return;
    this.onSelectPlace({ currentTarget: { dataset: { id: this.data.selectedPlaceId } } });
  },
  retryRecommendations() { this.loadRecommendations(false); },

  onSwitchStrategy(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.strategy || this.data.loading) return;
    this.setData({ strategy: key, pinnedIds: [] });
    this.loadRecommendations(true);
  },

  onTogglePin(e) {
    const id = e.currentTarget.dataset.id;
    const pinnedIds = this.data.pinnedIds.slice();
    const index = pinnedIds.indexOf(id);
    if (index >= 0) pinnedIds.splice(index, 1); else pinnedIds.push(id);
    this.setData({ pinnedIds, places: this.decorate(this.data.places, pinnedIds, this.data.favoritedIds) });
    this.saveHistorySnapshot();
  },

  async onToggleFav(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.favoriteBusyId) return;
    const place = this.data.places.find(item => item.id === id);
    if (!place) return;
    this.setData({ favoriteBusyId: id });
    try {
      const result = await api.toggleFavorite({ placeId: id, action: place.isFavorite ? 'remove' : 'add' });
      if (this.destroyed) return;
      this.applyFavoriteState(id, result.isFavorite);
      this.saveHistorySnapshot();
    } catch (err) {
      wx.showToast({ title: err.message, icon: 'none' });
    } finally {
      if (!this.destroyed) this.setData({ favoriteBusyId: '' });
    }
  },

  applyFavoriteState(id, isFavorite) {
    const favoritedIds = this.data.favoritedIds.filter(item => item !== id);
    if (isFavorite) favoritedIds.push(id);
    const updated = this.data.places.map(item => item.id === id
      ? Object.assign({}, item, { isFavorite: !!isFavorite })
      : item);
    this.setData({
      favoritedIds,
      places: this.decorate(updated, this.data.pinnedIds, favoritedIds)
    });
  },

  saveHistorySnapshot() {
    if (!this.currentResult || this.context.fromHistory) return;
    const rawPlaces = this.currentResult.places || [];
    api.saveHistory({
      partySize: this.data.departures.length,
      departures: this.data.departures,
      preferences: this.data.preferences,
      strategy: this.data.strategy,
      midpointMode: 'auto',
      midpoint: this.data.midpoint,
      searchedAt: this.searchedAt,
      searchRadiusMeters: this.data.searchRadiusMeters,
      distanceExpanded: this.data.distanceExpanded,
      resultSnapshot: { placeIds: rawPlaces.map(item => item.id), places: rawPlaces },
      pinnedIds: this.data.pinnedIds,
      favoritedIds: this.data.favoritedIds
    }).catch(err => console.error('[result] 保存历史失败', { code: err.code, requestId: err.requestId }));
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    // 详情页的 participantMetrics / distanceToMidpointMeters 依赖本次搜索上下文（契约 5.1 可选参数），
    // 通过全局上下文透传；不应只传 placeId，否则真实模式下详情页没有距离与到达时间。
    getApp().globalData.detailContext = {
      placeId: id,
      departures: this.data.departures,
      midpoint: this.data.midpoint
    };
    wx.navigateTo({ url: '/pages/shop-detail/shop-detail?id=' + encodeURIComponent(id) });
  },
  onBackModify() { wx.navigateBack({}); }
});
