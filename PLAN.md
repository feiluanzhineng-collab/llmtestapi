# LLM API Test — 项目规划

> 路径：`E:\llmApiTest`  
> 定位：开源、纯前端、无后端的大模型 API 验收测试平台  
> 依据：《第三方模型评测验收标准-0506.xlsx》  
> 压测时长：**单次最长 5 分钟**（文档原 30min~1h 不采纳）

---

## 1. 目标与边界

### 1.1 要做什么

- 对接 **OpenAI 兼容** Chat Completions API
- 按五大模块组织测试，自动判定 Pass / Fail / Skip / Manual
- 实时展示进度与指标，导出 JSON / Markdown 报告
- 配置与历史存 **localStorage**，可静态部署（GitHub Pages 等）

### 1.2 不做什么（v1）

- 不跑精度 benchmark（AIME、SWE-Bench 等）— 仅预留「结果录入」入口
- 不做月度 SLA / RTO 长期监控
- 不托管 API Key，不上传任何数据到服务器
- 不要求 30min~1h 持续压测；容量稳定性以 **≤5min 梯度压测** 代替

### 1.3 纯前端约束与对策

| 约束 | 对策 |
|------|------|
| CORS | dev 用 Vite proxy；生产 README 说明自建代理或供应商开 CORS |
| Key 暴露 | 仅存 localStorage；README 安全提示 |
| 标签页节流 | 压测 ≤5min；Worker 执行；前台运行提示 |
| 无服务端计费等 | 幂等/计费类标为 Manual |

---

## 2. 五大测试模块

与验收文档映射（用户口径 ↔ 文档章节）：

| # | 模块 ID | 名称 | 文档来源 | 自动化程度 | 典型耗时 |
|---|---------|------|----------|------------|----------|
| 1 | `engineering` | 工程性测试 | 一、工程验收（前半） | 中（约 40% 自动） | 2~10 min |
| 2 | `compatibility` | 兼容性测试 | 一、API 兼容性子表 | 高（~22 项） | 3~8 min |
| 3 | `performance` | 性能测试 TTFT | 三.1 | 高 | 3~5 min |
| 4 | `otps` | OTPS 吞吐 | 三.2 | 高 | 3~5 min |
| 5 | `capacity` | 容量与稳定性 | 四（缩短版） | 中 | ≤5 min |

---

## 3. 技术选型

```
Vite 6 + React 19 + TypeScript 5
├── 状态：Zustand（配置 + 运行态）
├── 样式：Tailwind CSS 4 + 少量 shadcn/ui
├── 图表：recharts（TTFT/OTPS 分布）
├── 存储：localStorage + idb-keyval（大报告可选）
├── 测试定义：JSON（suites/*.json）
└── 构建：静态 export，无 SSR
```

**选型理由**：生态成熟、SSE/fetch 一等公民、开源友好、与你现有 Python 脚本字段易于对齐。

---

## 4. 目录结构（规划）

```
E:\llmApiTest\
├── PLAN.md                    # 本文件
├── README.md
├── package.json
├── vite.config.ts             # dev proxy 配置项
├── index.html
├── public/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── types/                 # 全局类型
│   │   ├── config.ts
│   │   ├── testcase.ts
│   │   └── report.ts
│   ├── core/                  # 无 UI 纯逻辑
│   │   ├── api-client.ts      # fetch 封装、鉴权头
│   │   ├── sse-parser.ts      # SSE chunk 解析
│   │   ├── metrics.ts         # TTFT、OTPS、分位数
│   │   ├── runner.ts          # 用例队列、并发控制
│   │   ├── assert.ts          # 断言引擎
│   │   └── report-builder.ts
│   ├── suites/                # 测试套件定义
│   │   ├── engineering.json
│   │   ├── compatibility.json
│   │   ├── performance-ttft.json
│   │   ├── otps.json
│   │   └── capacity.json
│   ├── fixtures/              # 请求体、长文本、图片等
│   │   ├── prompts/
│   │   └── images/
│   ├── stores/
│   │   ├── config-store.ts
│   │   └── run-store.ts
│   ├── components/
│   │   ├── layout/
│   │   ├── config/            # API 配置面板
│   │   ├── runner/            # 运行控制、进度
│   │   ├── results/           # 结果表、详情抽屉
│   │   └── charts/            # TTFT/OTPS 图
│   └── pages/
│       ├── Dashboard.tsx
│       ├── SuiteRun.tsx
│       └── Report.tsx
└── docs/
    ├── cors-proxy.md
    └── testcase-authoring.md
```

---

## 5. 核心数据模型

### 5.1 全局配置 `AppConfig`

```ts
interface AppConfig {
  baseUrl: string;           // e.g. https://api.example.com/v1
  apiKey: string;
  model: string;
  proxyUrl?: string;         // 可选 CORS 代理前缀
  defaultHeaders?: Record<string, string>;
  timeoutMs: number;         // 默认 120_000
  maxConcurrency: number;    // 压测上限，默认 32
  stressDurationSec: number; // 默认 300（5min）
  successRateThreshold: number; // 默认 0.99
}
```

### 5.2 测试用例 `TestCase`

```ts
interface TestCase {
  id: string;
  suite: 'engineering' | 'compatibility' | 'performance' | 'otps' | 'capacity';
  name: string;
  description: string;
  tags: string[];
  mode: 'auto' | 'manual' | 'semi';
  // 请求模板
  request: {
    endpoint?: string;       // 默认 chat/completions
    method?: 'POST';
    body: object | 'fixture:xxx';
    stream?: boolean;
  };
  // 断言
  assertions: Assertion[];
  // SLA（性能类）
  sla?: Record<string, number | string>;
  timeoutMs?: number;
  retries?: number;
}
```

### 5.3 断言 `Assertion`

```ts
type Assertion =
  | { type: 'status'; eq: number }
  | { type: 'statusIn'; in: number[] }
  | { type: 'jsonPath'; path: string; op: 'eq'|'neq'|'gt'|'lt'|'exists'|'matches'; value?: unknown }
  | { type: 'header'; name: string; op: string; value?: string }
  | { type: 'sse'; rule: 'hasUsageInLastChunk' | 'validFormat' }
  | { type: 'metric'; name: 'ttft_p50'|'ttft_p90'|'otps'|'success_rate'; op: 'lt'|'gt'; value: number }
  | { type: 'custom'; fn: string };  // 注册表内建函数名
```

### 5.4 运行结果 `CaseResult` / `RunReport`

```ts
interface CaseResult {
  caseId: string;
  status: 'pass' | 'fail' | 'skip' | 'error' | 'manual';
  durationMs: number;
  httpStatus?: number;
  metrics?: {
    ttftMs?: number;
    otps?: number;
    promptTokens?: number;
    completionTokens?: number;
    successRate?: number;
  };
  assertionResults: { id: string; pass: boolean; message: string }[];
  rawPreview?: string;       // 截断响应，便于调试
  error?: string;
}

interface RunReport {
  id: string;
  startedAt: string;
  finishedAt: string;
  config: Omit<AppConfig, 'apiKey'> & { apiKeyMasked: string };
  suites: string[];
  summary: { total: number; pass: number; fail: number; skip: number };
  cases: CaseResult[];
}
```

---

## 6. 执行引擎设计

### 6.1 流程

```
用户选择套件 → Runner 加载 cases
    → 按 suite 分组排队
    → 普通用例：低并发串/并行（max 4）
    → 压测用例：Worker 内循环，直到 duration 或 successRate 跌破阈值
    → 每项写 CaseResult → 更新 UI
    → 结束生成 RunReport → 存 localStorage / 导出
```

### 6.2 并发策略

| 类型 | 并发 | 说明 |
|------|------|------|
| 兼容性 | 1~4 | 避免 429 干扰断言 |
| 工程性 | 1 | 部分用例需顺序 |
| TTFT | 1,2,4,8…阶梯 | 每档采 successRate≥99% |
| OTPS | 固定并发阶梯 | 同上 |
| 容量 | 梯度升并发 | 5min 内升到有意义的峰值 |

### 6.3 指标计算

- **TTFT**：`firstContentChunkTime - requestStart`（支持 `content` / `reasoning_content`）
- **OTPS**：`completion_tokens / (lastTokenTime - firstTokenTime)`
- **分位数**：在线收集后算 P50/P90/avg
- **成功率**：`2xx 且有效 body / 总请求`（429 单独统计）

### 6.4 与 Python 脚本对齐

`E:\test-newapiscript` 中现有逻辑可迁移为 `core/metrics.ts` 与 `suites/*.json`：

- `test_compare_connectivity.py` → 连通性 + 流式 TTFT 样例
- `test_glm51_ttft_tiers.py` → performance-ttft.json 分档
- `test_tpm_*` → capacity.json 梯度思路（时长改为 5min）

---

## 7. 各模块用例清单（v1 范围）

### 7.1 兼容性 `compatibility`（22 项，全自动）

| ID | 主题 | 关键断言 |
|----|------|----------|
| compat-messages | messages | 缺 role→400；正常 200 |
| compat-messages-array | messages-元素 | 空数组→400；非法→422 |
| compat-top-p | top_p | 0/1 OK；超范围→400 |
| compat-temperature | temperature | [0,2] 边界 |
| compat-max-tokens | max_tokens | 0/负/极大值 |
| compat-stream | stream | SSE 格式；末 chunk usage |
| compat-stop | stop | 多 stop 词 |
| compat-json-object | json_object | 100 次合法 JSON 率 |
| compat-auth | 鉴权 | 无效 Key→401 |
| compat-encoding | 编码 | 中日文 emoji \n \t |
| compat-system-prompt | system | 优先级、长 system |
| compat-multimodal | 多模态 | URL/base64；大图→413 |
| compat-input-limit | 输入长度 | 超长→413/400 |
| compat-idempotency | 幂等 | seed 一致（semi，5 次） |
| compat-web-search | 联网 | 开关（Skip 若模型不支持） |
| compat-freq-penalty | frequency_penalty | 边界 |
| compat-presence-penalty | presence_penalty | 边界 |
| compat-long-output | 超长输出 | finish_reason=length |
| compat-non-stream-long | 非流式长输入 | 完整性 |
| compat-badcase | 线上 badcase | 预留 5 条 fixture |
| compat-deepseek-v3 | 模型特有 | 按 model tag Skip |

### 7.2 工程性 `engineering`（自动 + Manual 混合）

**自动（v1）**

| ID | 项 | 验证方式 |
|----|-----|----------|
| eng-thinking-toggle | Thinking 开关 | body 加 thinking enabled/disabled |
| eng-stream-usage | 流式累计 usage | 末 chunk 含 input+output tokens |
| eng-json-schema | 结构化输出 | json_object + json_schema 各 1 次 |
| eng-tool-call | Function Calling | tools 定义 + 并行调用 |
| eng-multi-turn | 多轮对话 | 3 轮 history |
| eng-stream-sse | SSE 流式 | chunk 连续无断 |
| eng-eos-suppress | EOS 抑制 | 100 次（可配置）统计空 content 比例 |
| eng-cache | Prompt Cache | 相同前缀二次请求延迟对比（semi） |

**Manual（清单勾选）**

- 参数默认值不可改、免审核白名单、TPM 保障包、频控策略、版本管理策略等

### 7.3 性能 TTFT `performance`

输入分档（增量 tokens，不含 cache）：

| 档位 | 腾讯 SLA（默认阈值） | 并发扫描 |
|------|---------------------|----------|
| <6K | P90<5s P50<2s avg<2s | 1,2,4,8,12 |
| 6~16K | P90<5s P50<2.5s avg<4s | 1,2,4,8,10 |
| 16~32K | P90<8s P50<4s avg<6s | 1,2,4,8 |
| 32~64K | P90<15s P50<8s avg<8s | 1,2,4,6 |
| 64~128K | P90<35s P50<15s avg<15s | 1,2,4 |
| 128~256K | P90<70s P50<30s avg<30s | 1,2,3 |

规则：仅当 `successRate ≥ 99%` 时记录该并发档 TTFT；否则标记「超并发，仅供参考」。

每档用固定 prompt fixture 控制输入 token 量级（v1 用字符估算 + usage 回读校准）。

### 7.4 OTPS `otps`

| 条件 | Tier | 阈值 |
|------|------|------|
| 激活参数 >10B | L1 | ≥30 tokens/s |
| 激活参数 >10B | L2 | ≥10 tokens/s |
| 激活参数 ≤10B | / | ≥100 tokens/s |

实现：固定输入 + `max_tokens` 足够大，并发阶梯 1→N，取 successRate≥99% 下 OTPS 中位数。  
`modelTier` 在配置里由用户选择（L1/L2/小模型）。

### 7.5 容量与稳定性 `capacity`（5min 版）

替代文档四的三阶段长压：

```
阶段 A：预热 30s，并发=2
阶段 B：梯度升并发（每 30s 升一档），最长 4min
阶段 C：维持峰值 30s
停止条件：successRate < 99% 或满 5min
```

采集指标：

| 指标 | 验证 |
|------|------|
| RPM | 超限返回 429，响应 <200ms（采样） |
| TPM | 记录峰值 tokens/min，与承诺值对比（Manual 填承诺） |
| max_context | 发送大上下文请求是否 200 |
| 稳定性 | 全程 successRate 曲线 |

---

## 8. UI 信息架构

```
┌─────────────────────────────────────────────────────────┐
│  Header: LLM API Test    [配置] [历史报告] [GitHub]      │
├──────────────┬──────────────────────────────────────────┤
│  Sidebar     │  Main                                    │
│  · 总览      │  · 配置卡片：URL / Key / Model / 代理    │
│  · 工程性    │  · 套件选择 + 全选/子选                  │
│  · 兼容性    │  · [开始测试] [停止]                     │
│  · TTFT      │  · 进度条 + 实时日志                     │
│  · OTPS      │  · 结果表：Pass/Fail/指标/详情           │
│  · 容量      │  · 图表：TTFT 分档、OTPS、成功率曲线     │
│  · 报告导出  │                                          │
└──────────────┴──────────────────────────────────────────┘
```

**页面**

1. **Dashboard** — 上次结果摘要、快捷入口  
2. **SuiteRun** — 单套件执行  
3. **Report** — 历史列表、对比两次运行、导出  

---

## 9. 配置与 CORS

### 9.1 Vite dev proxy（`vite.config.ts`）

```ts
proxy: {
  '/api': {
    target: process.env.VITE_PROXY_TARGET,
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/api/, ''),
  },
}
```

前端请求统一走 `/api/v1/chat/completions`，开发无 CORS 问题。

### 9.2 生产模式

- `baseUrl` 设为同源代理地址，或供应商已开 CORS 的直连 URL  
- `docs/cors-proxy.md` 提供 nginx / Caddy 最小配置示例  

---

## 10. 开源与仓库

- **License**：MIT  
- **README**：功能、截图、CORS、Key 安全、与验收文档对照表  
- **CI**：`pnpm lint` + `pnpm build` + `pnpm test`（core 单测）  
- **.gitignore**：`.env`、`dist`、本地报告  

---

## 11. 实施阶段

### Phase 0 — 脚手架（0.5d）

- [ ] `pnpm create vite` 初始化  
- [ ] Tailwind + 路由 + 布局壳  
- [ ] `AppConfig` 表单 + localStorage 持久化  

### Phase 1 — 核心引擎（1.5d）

- [ ] `api-client` + `sse-parser`  
- [ ] `assert` + `runner` + `metrics`  
- [ ] 跑通 1 条 compat-messages  

### Phase 2 — 兼容性全套（2d）

- [ ] `compatibility.json` 22 项  
- [ ] fixtures（长文本、图片、非法 body）  
- [ ] 结果表 + 导出 JSON/MD  

### Phase 3 — 性能 OTPS（1.5d）

- [ ] TTFT 分档 + 并发扫描  
- [ ] OTPS Tier  
- [ ] recharts 图表  

### Phase 4 — 工程 + 容量（1.5d）

- [ ] engineering 自动项  
- [ ] Manual 清单 UI  
- [ ] capacity 5min 梯度压测  

### Phase 5 — 打磨开源（1d）

- [ ] README、截图、CORS 文档  
- [ ] 与 test-newapiscript 报告格式互导（可选）  
- [ ] GitHub Actions  

**合计约 7~8 人天 → MVP 可演示约 4 人天（Phase 0~2 + 部分 3）**

---

## 12. 风险登记

| 风险 | 影响 | 缓解 |
|------|------|------|
| 供应商 CORS 未开 | 无法直连 | 代理文档 + dev proxy |
| 模型不支持某参数 | 误报 Fail | `tags` + 可 Skip + 预期模型能力配置 |
| Token 计数与分档不准 | TTFT 分档偏移 | 首轮校准 fixture；用 usage 反馈 |
| 429 频发 | 压测失真 | 降并发、指数退避、区分 429 与失败 |
| 浏览器内存 | 长输出 OOM | `max_tokens` 上限、rawPreview 截断 |

---

## 13. 待你确认（实现前）

1. **UI 框架**：默认 React + Tailwind，是否同意？  
2. **默认语言**：中文 UI + 英文代码注释？  
3. **精度模块**：v1 完全不做，还是 Dashboard 留「手工录入」卡片？  
4. **报告互导**：是否需要兼容 `test-newapiscript` 的 `*_results.json` 格式？  

---

*文档版本：v0.1 | 2026-07-08*
