# 工程记忆与避坑指南 (Knowledge Runtime)

> **准入五问**：下次还会遇到吗？有代码证据吗？能独立成立吗？已存在吗？是反直觉结论吗？（任一为否绝不沉淀）

## 沉淀规则索引

### [ID: LLM-SSE-KeepAlive]
- **角色**: Constraint
- **生效范围**: `main.js`, `src/App.tsx`
- **核心结论**: 工业级桌面端调用大模型必须默认开启全链路 SSE 流式传输 (`stream: true`) 并配合滑动心跳保活机制。
- **成立证据**: 非流式单包请求在服务端深度思考超过 90s 时，TCP 管道无数据，会被第三方中转站反向代理（Nginx / Cloudflare）按 `proxy_read_timeout 90s` 强行掐断并向 Node.js 抛出 `socket hang up` 致命错误。
- **失效条件**: 架构完全脱离第三方反向代理或服务网关取消空闲断开限制后废止。