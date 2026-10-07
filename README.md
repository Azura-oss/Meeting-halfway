# 哪见 · 多人聚会碰面点推荐小程序

- 仓库地址：`git@github.com:<你的用户名>/哪见.git`（推送后请替换为真实地址）
- 当前接口版本：**PRD V2.1 / 接口约定 V1.1**（两者冲突时以 PRD 为准）

## 目录结构

```
NajianApp/
├── app.js / app.json / app.wxss
├── pages/            index（首页）· preference（选择偏好）· result（推荐结果）
│                     shop-detail（店铺详情）· favorites（收藏）· history（历史）
├── components/       custom-tabbar（自定义底部导航）· custom-dialog · voice-input
├── utils/            config.js（全局配置）· api.js（统一接口层）· mockData.js（本地假数据）
│                     config.local.js（★本地私有，不提交）
└── docs/             PRD 与原型图
```

## 接口层使用说明

- 所有接口统一返回 `{ code, msg, data }`，`code === 0` 表示成功。
- 数据源由 `utils/config.js` 的 `useMock` 控制：
  - `useMock: true`（默认）：走 `utils/mockData.js` 本地假数据，不请求云函数；
  - `useMock: false`：自动切换 `wx.cloud.callFunction` 调用真实云函数。
- 也可在运行时切换：`api.setUseMock(false)`。
- 云函数调用前会自动执行 `wx.cloud.init({ env: config.cloudEnv })`，并在调用时显式传入
  `config: { env: config.cloudEnv }`，保证多环境下不串号。

## 云开发环境 ID 规范（重要）

- 环境 ID 字段为 `utils/config.js` 中的 `cloudEnv`，由**后端（高）提供**，公开仓库中必须是占位符
  `'your-cloud-env-id'`。
- 真实环境 ID 只放在本地私有文件 `utils/config.local.js`（已在 `.gitignore` 中忽略）：

  ```javascript
  // utils/config.local.js（不提交）
  module.exports = {
    cloudEnv: '真实环境 ID'
  };
  ```

- `utils/api.js` 启动时优先 `require('./config.local')`，读取失败才回落 `config.js` 的占位符，
  因此拉取公开仓库的默认代码即可直接跑 mock，无需任何本地配置。
- 也可把真实值放在 `project.private.config.json`（同样被忽略），二者任选其一即可。
- **不得提交**：云环境 ID、腾讯位置服务 Key、TokenHub Key、`.env`、`project.private.config.json`。
- 页面代码中禁止硬编码环境 ID。
- 若历史上误提交过敏感信息：`git rm --cached <file>` 移除后重写历史（如 `git filter-repo`），
  并立即在云开发控制台重置对应 Key。

## 枚举与常量口径

| 项 | 取值 |
|---|---|
| 人数 | 2 ~ 6 人（PRD A2） |
| 出行方式 | `walking` 步行 / `driving` 开车 / `subway` 地铁 / `bus` 公交（每人单选，PRD A9） |
| 地铁策略 | `least_transfer` 最少换乘 / `least_stops` 最少站点（PRD B3，仅全员地铁时下发） |
| 搜索半径 | 初始 `1000m`，无结果扩展到 `5000m`（PRD B5） |
| 历史记录 | 最多 50 条，超出清理最旧（PRD 第 8 章） |
| 埋点事件 | `app_launch` / `search` / `result_expose` / `voice_use` / `place_detail` / `favorite` / `pin` / `history_click` / `route_view` |
| 本地缓存 key | 收藏 `myFavorites`、历史 `myHistory`（与页面缓存互通） |

## 云函数清单

`searchPOI`、`asrRecognize`、`parseIntent`、`getRecommendations`、`getRoutes`、
`getPlaceDetail`、`toggleFavorite`、`getFavorites`、`saveHistory`、`getHistory`、
`clearHistory`、`reportEvent`

其中 `asrRecognize`、`parseIntent` 为 AI 类函数，接口层会兼容 `{ text, intent }`
与直接返回字段两种结构。
