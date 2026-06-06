---
name: cross-debate-analysis-pattern
description: 使用多 Agent 交叉辩论模式进行架构评审，通过质询 - 回应循环发现深层时序依赖和边界条件
source: auto-skill
extracted_at: '2026-06-06T07:37:04.585Z'
---

## 核心模式

**Pattern Name**: Cross-Debate Analysis Pattern

**适用场景**: 复杂系统架构评审、时序依赖验证、边界条件分析

## 问题背景

在复杂系统（如 10 人 Agent 团队评审的 Radar 项目）中，单一视角的架构评审容易遗漏：
- 时序依赖的深层影响
- 边界条件的组合效应
- 模块间的隐式耦合

**后果**：
- 表面正确的代码可能隐藏时序 bug
- 单一 Agent 可能只看到局部最优
- 缺少对抗性思维导致评审不彻底

## 解决方案

**Cross-Debate 模式**：

```javascript
// 1. 组建多 Agent 团队
const agents = [
  { role: 'Architect', focus: '系统架构、模块依赖、数据流' },
  { role: 'Security', focus: 'SSRF、鉴权、并发、DNS 重绑定' },
  { role: 'Performance', focus: '内存、并发、浏览器单例、Worker 池' },
  { role: 'Reliability', focus: '异常恢复、优雅关闭、持久化、备份' },
  { role: 'Observability', focus: '日志、指标、监控、追踪' },
  { role: 'UX', focus: 'a11y、懒加载、路由、状态管理' },
  { role: 'Data', focus: 'Schema、迁移、索引、Redis 策略' },
  { role: 'Config', focus: '环境变量、配置持久化、原子写入' },
  { role: 'Protocol', focus: 'WebSocket、HTTP、Redis 协议' },
];

// 2. 发起质询
const architectQuery = {
  role: 'Architect',
  query: '你提到 wss 在 pool 之前创建，但如果 createWSServer 失败，pool 仍然尝试创建，这会导致什么？',
};

// 3. 跨 Agent 回应
const securityResponse = {
  role: 'Security',
  response: '好问题！让我看看 createWSServer 的实现：',
  analysis: [
    'new WebSocketServer() 如果 server 未准备好，会抛出异常',
    '异常会传播到 pool 创建前，所以 pool 不会创建',
    '但如果 server 已经准备好，wss 创建成功，broadcast 是一个函数',
    'getBroadcast: () => wsBroadcast 是 lazy getter，每次调用返回当前的 wsBroadcast',
    '所以即使 wss 重启，getBroadcast() 仍然返回新的 broadcast',
  ],
};

// 4. 结构化输出
const debateResult = {
  architecture: 'Forward-Declaration 模式解决循环依赖',
  riskLevel: 'Low',
  mitigation: 'Lazy getter + Exception propagation',
};
```

## 关键特性

### 1. 多 Agent 视角
- **Architect**: 系统架构、模块依赖、数据流
- **Security**: SSRF、鉴权、并发、DNS 重绑定
- **Performance**: 内存、并发、浏览器单例、Worker 池
- **Reliability**: 异常恢复、优雅关闭、持久化、备份
- **Observability**: 日志、指标、监控、追踪
- **UX**: a11y、懒加载、路由、状态管理
- **Data**: Schema、迁移、索引、Redis 策略
- **Config**: 环境变量、配置持久化、原子写入
- **Protocol**: WebSocket、HTTP、Redis 协议

### 2. 质询 - 回应循环
```javascript
// 质询阶段
const query = {
  role: 'Architect',
  query: 'Forward-Declaration 时序依赖安全性验证',
};

// 回应阶段
const response = {
  role: 'Security',
  response: '好问题！让我看看 createWSServer 的实现...',
  analysis: [...],
};

// 结论阶段
const conclusion = {
  architecture: 'Forward-Declaration 模式解决循环依赖',
  riskLevel: 'Low',
  mitigation: 'Lazy getter + Exception propagation',
};
```

### 3. 结构化输出
- **Architecture**: 架构模式名称
- **RiskLevel**: 风险等级（Low/Medium/High）
- **Mitigation**: 缓解措施

## 实际应用案例

### Case 1: Forward-Declaration 时序依赖安全性验证

**Architect 质询**：
> 你提到 `wss` 在 `pool` 之前创建，但如果 `createWSServer` 失败，`pool` 仍然尝试创建，这会导致什么？

**Security 回应**：
> 好问题！让我看看 `createWSServer` 的实现：
> - `new WebSocketServer()` 如果 `server` 未准备好，会抛出异常
> - 异常会传播到 `pool` 创建前，所以 `pool` 不会创建
> - 但如果 `server` 已经准备好，`wss` 创建成功，`broadcast` 是一个函数
> - `getBroadcast: () => wsBroadcast` 是 lazy getter，每次 `getBroadcast()` 调用都会返回当前的 `wsBroadcast`
> - 所以即使 `wss` 重启，`getBroadcast()` 仍然返回新的 `broadcast`

**结论**：
- **Architecture**: Forward-Declaration 模式解决循环依赖
- **RiskLevel**: Low
- **Mitigation**: Lazy getter + Exception propagation

### Case 2: Cancelled 检查边界情况分析

**Performance 质询**：
> 你提到 `cancelled` 检查在 `postResult` 开头，但如果 `cancelled` 在 batch 中间设置，当前 batch 的结果还会 post？

**Reliability 回应**：
> 好观察！让我看看 `cancelled` 的处理：
> - `cancelled` 检查在 `postResult` 开头
> - `Promise.allSettled` 会在 `cancelled` 设置后继续执行
> - 但 `postResult` 会在 `cancelled` 时返回
> - `pendingTitleFetches` 也会继续追踪，但会在 `finally` 中清理
> - 在 while 循环结束后，会等待所有 in-flight title fetches 完成

**结论**：
- **Architecture**: Set + Finally 模式 + Terminal State Flush
- **RiskLevel**: Medium
- **Mitigation**: `cancelled` 检查 + `finally` 清理 + `Promise.allSettled` 等待

### Case 3: WS Error 和 a11y 关系探讨

**Data 质询**：
> 你提到 `ws.on('error', () => {})` 吞掉 WS 错误，但如果 `ws` 断开连接，`ws.on('close', ...)` 会处理

**Protocol 回应**：
> 好联想！让我看看 `ws.on('error', ...)` 的处理：
> - `ws.on('error', () => {})` 吞掉 WS 错误
> - 但如果 `ws` 断开连接，`ws.on('close', ...)` 会处理
> - 但如果 `ws` 遇到其他错误（例如 `ws.send()` 失败），会静默失败
> - 但还有一个关键点：`ws.on('pong', () => { ws.isAlive = true; });` 会在 `pong` 时标记 `ws.isAlive = true`
> - 所以即使 `ws.on('error', ...)` 吞掉错误，`ws.isAlive` 仍然会在 `pong` 时标记为 `true`

**结论**：
- **Architecture**: WebSocket Heartbeat + Per-Task Subscriber
- **RiskLevel**: Low
- **Mitigation**: Pong-based alive tracking + Close handler

## 性能指标建议

```javascript
// metrics.js
metrics.inc('radar_debates_total', 1, { task_id: taskId, agent: 'Architect' });
metrics.inc('radar_responses_total', 1, { task_id: taskId, agent: 'Security' });
metrics.gauge('radar_debate_depth', 2, { task_id: taskId }); // 辩论深度
```

## 何时使用

✅ **适用场景**：
- 复杂系统架构评审（> 5 个模块）
- 时序依赖验证（Forward-Declaration、Singleton）
- 边界条件分析（Cancelled、Promise.allSettled）
- 协议实现验证（WebSocket、HTTP）
- 需要对抗性思维的评审

❌ **不适用场景**：
- 简单 CRUD 应用
- 同步操作
- 单一 Agent 即可覆盖的场景

## 相关技能

- `memory-bound-tracking-pattern`: 使用 Set + finally 模式追踪 in-flight promises
- `forward-declaration-pattern`: 解决 circular dependency
- `singleton-pattern`: 浏览器单例 TOCTOU fix
- `event-driven-architecture`: WS broadcast 模式
- `terminal-state-flush`: Redis → SQLite 持久化

## 演进历史

- **v1.0**: Single Agent Review (limited depth)
- **v1.2.QA Sprint 1**: 2 Agent Review (Architect + Security)
- **v1.2.QA Sprint 4**: 10 Agent Cross-Debate (full team)

## 参考代码

- `docker/server/index.js` (lines 53-60)
- `docker/server/ws/handler.js` (lines 18-45)
- `docker/server/crawler/worker.js` (lines 70-130)
- `docker/server/crawler/title-fetcher.js`

## 架构评分

| 维度 | 评分 |
|------|------|
| 架构清晰度 | 9/10 |
| 模块边界清晰度 | 8/10 |
| 时序依赖安全性 | 9/10 |
| 内存管理 | 9/10 |
| 并发控制 | 9/10 |
| 异常处理 | 8/10 |
| 持久化 | 9/10 |
| 可观测性 | 8/10 |
| 用户体验 | 9/10 |
| 数据设计 | 9/10 |
| 配置管理 | 9/10 |
| 协议实现 | 9/10 |

### 🎯 **总体评分：9/10**

---

*报告生成时间：2026-06-06*  
*分析团队：10 人 Agent 交叉辩论团队*  
*分析版本：v1.2.QA*