# 语音源码整合记录

日期：2026-10-14。来源：同工作区的 `asr-prototype/cloudfunctions/`。

## 整合范围与边界

- `cloudfunctions/asrRecognize/`：入口、处理器、依赖清单、原有 pnpm 锁文件、14 项单元测试。
- `cloudfunctions/parseIntent/`：入口、契约校验、处理器、TokenHub 适配器、依赖清单、12 项单元测试。
- 原有源码原样迁入；原型工程未移动、删除或覆盖。
- 新增正式 API 层与真实处理器的本地契约测试，使用假的云下载、ASR 和模型适配器，不产生真实服务调用。
- 不迁入原型页面、私有配置、真实环境 ID、密钥、依赖目录或 GPT 对话交接文件。
- 本次仅源码备份，不部署云函数、不创建凭证、不恢复 TokenHub 云端工作，也不切换默认 Mock 模式。

## 状态

历史交接记录确认 ASR 曾部署并通过真机验收；本次没有重新检查云端实时状态。`parseIntent` 本地实现完成，TokenHub + Hy3 云端配置、部署和联调仍暂停。

## 契约

- ASR 请求：`{ fileID, format: 'mp3' }`，音频在 `voice-temp/` 下。
- ASR 成功：`{ ok: true, text, audioDurationMs, requestId }`。
- 意图请求：`{ text }`，不得传录音、fileID 或 Base64。
- 意图成功：`{ ok: true, intent, requestId }`；intent 包含 `partySize`、`origins`、`transportModes`、`placePreferences`、`missingFields`、`confidence`。
- 错误：`{ ok: false, code, message, retryable, requestId }`。
- 正式 `utils/api.js` 解包以上响应，页面继续接收业务数据或标准异常。

## 运行测试

```sh
npm run test:voice
npm run test:all
```

本地测试运行器需要 Node.js 18 或更高版本；单元测试不需要安装云端 SDK，也不验证实际部署依赖或云端服务可用性。

本次实际执行结果：Mock/API 20/20、页面级 39/39、Smoke 29/29、语音专项 27/27，均通过。12 个迁入文件与原型内容比对一致（仅统一末尾换行）。

## 真实联调前待核对

1. 正式首页目前录音上限 60 秒，而原型验收记录为 45 秒；应确定正式产品限制并核对 ASR 支持范围。
2. 服务端已在 finally 删除有效临时音频；正式 API 层还没有原型的客户端删除兜底，云函数未成功到达时的清理需补齐验证。
3. 直接传 fileID 调用 ASR 时必须同时提供 `format: 'mp3'`；本地契约测试验证的是正式页面使用的 tempFilePath 上传路径。
4. 私有环境配置仍需本地维护，禁止将环境或服务凭证写入公开源码。ASR 使用运行角色临时凭证，TokenHub Key 仅保存在服务端环境变量。
5. 在用户明确恢复 TokenHub 工作前，不开通、部署或调用真实模型。

团队资料库建议将本文件放入 `03-接口与算法`；源码以 GitHub 为准。
