# 哪见后端 · 部署与联调说明（本地文档，不上传 GitHub）

## 一、云函数清单（高：高-1、高-4、高-5、高-6）

| 云函数 | 任务编号 | 契约章节 | 用途 |
|---|---|---|---|
| searchPOI | 高-4 | 3.1 | POI 关键词联想与校验（成都市域，GCJ-02） |
| getRecommendations | 高-4、高-5 | 4.1 | 多人折中推荐（1~6 人） |
| getRoutes | 高-1 | 4.2 | 每人路线（每人自己的 transportMode，返回 routes） |
| getPlaceDetail | 高-5 | 5.1 | 地点详情（V1.1 新增） |
| toggleFavorite | 高-6 | 6.1 | 收藏切换（openid + placeId 幂等） |
| getFavorites | 高-6 | 6.2 | 收藏列表（pinned 优先 + favoritedAt 倒序） |
| saveHistory | 高-6 | 7.1 | 保存搜索历史（快照 + pinnedIds / favoritedIds，最多 50 条） |
| getHistory | 高-6 | 7.2 | 历史列表与结果恢复 |
| clearHistory | 高-6 | 7.3 | 清空历史（V1.1 新增，不影响收藏） |

asrRecognize / parseIntent / reportEvent 由梁负责。

## 二、部署步骤

1. 将 cloudfunctions/ 目录整体放入小程序项目的 cloudfunctions 根目录。
2. 在微信开发者工具中，对每个云函数右键 →「上传并部署：云端安装依赖」。
3. 创建数据库集合（见 database/collections.md）：places、favorites、history。
4. 地图 Key 配置：把 cloudfunctions/config.example.json 复制为各函数目录下的 config.json，
   填入 TENCENT_MAP_KEY（searchPOI、getRecommendations、getRoutes 需要）。
   config.json 已被 .gitignore 排除，不会提交。也可在云开发控制台手动添加环境变量。
5. 前端 service 层按契约 2.2 适配层调用 wx.cloud.callFunction，页面不判断 ok / code。

## 三、无 Key 降级（保证闭环联调）

未配置 TENCENT_MAP_KEY 时自动降级为内置种子数据（成都地标 POI + 市中心候选场所），返回结构仍与契约完全一致，满足契约 9.2「允许占位结果，但结构必须正确」。配置 Key 后自动切换为腾讯位置服务（suggestion / 周边搜索 / 逆地理编码 / 路径规划），无需改代码。

## 四、与契约的对齐要点（V1.1）

- 双返回结构：业务接口统一 { code, msg, data, requestId }；失败时 data: null。
- 6 人上限：departures 超过 6 返回 code 400、「最多支持 6 人同行」。
- participantMetrics：每人 distanceMeters / durationMinutes / transportMode；averageDistanceMeters 为均值。
- 搜索半径：先 1000m，无结果自动扩 5000m 并 distanceExpanded: true；仍无结果 places: []（正常空态）。
- strategy：仅全员 subway 时生效，否则响应返回 null。
- 收藏幂等：重复 add / remove 均返回 code 0 与最终状态；isFavorite 统一由 getRecommendations / getPlaceDetail 返回。
- 历史：saveHistory 按 openid + searchedAt + departures 去重；最多 50 条；clearHistory 只删 history 集合并返回 deletedCount。
- 空值形态：空列表 []、空对象 null；距离 *Meters、耗时 *Minutes；出行方式 walking/driving/subway/bus。
- placeId 来源：getRecommendations 将候选场所快照写入 places 集合；getRoutes / getPlaceDetail / toggleFavorite 依据快照校验，无效返回 404。

## 五、实现说明与联调注意事项

1. getPlaceDetail 可选参数：契约 5.1 请求示例只带 placeId，但 participantMetrics / distanceToMidpointMeters 依赖本次搜索上下文。本实现支持可选 departures / midpoint（前端从结果页透传）；未传时 participantMetrics: []、距离字段为 null。需与田确认透传方式后定稿。
2. 距离/耗时估算口径（未接路径规划前）：直线距离 × 绕行系数（步行 1.25 / 驾车 1.45 / 地铁·公交 1.5）÷ 速度（步行 75 / 驾车 400 / 地铁 460 / 公交 280 米/分钟），公交地铁另加 5 分钟。getRoutes 配置 Key 后走真实路径规划；getRecommendations 的 participantMetrics 为占位口径。
3. 429 限流基于单实例内存态，多实例下不保证严格生效，前端仍需按契约做按钮禁用。
4. favorites.pinned：契约 6.2 有该字段但未定义设置接口（置顶仅本次搜索生效），当前写入固定 false；若需收藏页置顶持久化须补接口。
5. 契约 9.3 异常测试参数已全部支持：preferences: ["美术馆"] → places: [] + distanceExpanded: true（种子刻意不含美术馆）；departures.length > 6 → 400；无效 poiId → 404/400；clearHistory 无历史 → code 0、deletedCount: 0。

## 六、本地测试

    # 种子模式（无 Key）
    node test/smoke.js

    # 真实 Key 模式
    $env:TENCENT_MAP_KEY='你的Key'; node test/smoke.js
    node test/real_check.js      # getRoutes 深度验证（polyline/换乘/站点数）
    python test/check_quota.py   # 检查各服务当日配额

## 七、腾讯位置服务实测格式备忘（getRoutes 已按此实现）

1. direction v1 的 duration 单位是分钟（非秒）。
2. polyline 是扁平数组 [lat0,lng0,dLat,dLng,...]：首点绝对度，后续差值为整数微度（1e-6 度），解码需自适应。
3. transit 分段在 result.routes[0].steps：mode=WALKING 有 polyline；mode=TRANSIT 的 lines[] 含 vehicle=SUBWAY/BUS 与 station_count，地铁段无 polyline 需插值补线；换乘数 = TRANSIT 步骤数 - 1。