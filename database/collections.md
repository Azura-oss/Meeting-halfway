# 数据库集合与权限规则（高提供，供前端切换到真实环境）

云开发控制台 → 数据库，创建以下 3 个集合。所有读写均由云函数（服务端身份）完成，
因此三个集合的权限均可设为「所有用户不可读写」（最严格），云函数服务端调用不受该权限限制。

## 1. places（场所快照）

getRecommendations 每次搜索会把候选场所快照 upsert 到该集合；
getRoutes / getPlaceDetail / toggleFavorite 依据它校验 placeId 是否有效（无效 → 404）。

| 字段 | 类型 | 说明 |
|---|---|---|
| _id | string | 文档 ID（系统） |
| id | string | 场所 ID（即契约中的 placeId，腾讯 POI id 或种子 id） |
| name / type | string | 名称与分类 |
| lat / lng | number | GCJ-02 坐标 |
| address | string | 完整地址 |
| openHours | string \| null | 营业时间 |
| imageUrl | string \| null | 封面图 |
| phone | string \| null | 电话（预留） |
| photos | string[] | 相册（预留，默认 []） |
| rating | number \| null | 评分（预留） |
| updatedAt | number | 快照更新时间戳（毫秒） |

索引建议：`id` 升序唯一索引（防重复快照）。

## 2. favorites（收藏）

| 字段 | 类型 | 说明 |
|---|---|---|
| _id | string | 文档 ID（系统） |
| openid | string | 收藏者（服务端从云函数上下文取得，前端不传） |
| placeId | string | 场所 ID |
| name / type | string | 名称与分类（列表展示快照） |
| lat / lng | number | 坐标 |
| address | string | 地址 |
| imageUrl | string \| null | 封面图 |
| pinned | boolean | 收藏页置顶标记（当前固定 false） |
| favoritedAt | string | 收藏时间 ISO 8601 |
| createdAt | number | 创建时间戳（毫秒） |

索引建议：`openid + placeId` 组合唯一索引（契约要求的唯一约束；代码层已做查询前置
的幂等写入，索引是双保险）；`openid + favoritedAt` 组合索引（列表倒序查询）。

## 3. history（搜索历史）

| 字段 | 类型 | 说明 |
|---|---|---|
| _id | string | 历史记录 ID（即契约中的 historyId） |
| openid | string | 归属用户 |
| partySize | number | 参与人数 |
| departures | object[] | 每人 participantId/label/poiId/name/lat/lng/transportMode |
| departureNames | string[] | 出发地名称（列表摘要） |
| transportModes | string[] | 去重后的出行方式 |
| preferences | string[] | 本次偏好 |
| strategy | string \| null | 生效策略 |
| midpoint | object \| null | 完整折中对象（name/lat/lng/address/source） |
| searchedAt | string | 搜索时间 ISO 8601 |
| searchRadiusMeters | number | 本次实际搜索半径 |
| distanceExpanded | boolean | 是否触发自动扩大 |
| resultSnapshot | object \| null | 结果快照（placeIds + places，最多 20 条） |
| pinnedIds | string[] | 本次结果中被置顶的场所 ID |
| favoritedIds | string[] | 本次结果中已收藏的场所 ID |
| favoriteCount | number | 收藏数量 |
| createdAt | number | 创建时间戳（毫秒） |

索引建议：`openid + searchedAt` 组合索引（倒序 + 去重查询）；每用户最多 50 条由
saveHistory 写入后自动淘汰，无需定时任务。

## 权限规则汇总

| 集合 | 权限 | 理由 |
|---|---|---|
| places | 所有用户不可读写 | 仅云函数服务端读写 |
| favorites | 所有用户不可读写 | 含 openid，绝不允许客户端直读直写 |
| history | 所有用户不可读写 | 同上；清空仅限云函数按 openid 删除 |

注意：openid、腾讯位置服务 Key 等敏感信息一律不出现在客户端（契约 1.1 / 2.5 / 2.3）。
