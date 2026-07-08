# 🧪 LLM API Test

[English](README.md) · **中文**

> 开源、纯前端的 OpenAI 兼容大模型 API 验收测试站。  
> 无后端，API Key 只存在你的浏览器里。

[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

---

## ✨ 这个项目是干嘛的？

**LLM API Test** 帮你在浏览器里 **一次性验 API**：兼容性、工程性、性能、精度，不用装 Python 评测框架，也不用 Docker。

可以把它想成 `/v1/chat/completions` 的 **起飞前检查单**：

| 模块 | 干什么 |
|------|--------|
| 🏠 **总览** | 统一配置 Base URL、API Key、模型（全站共用） |
| 🔧 **工程性测试** | 工具调用、流式、重试、EOS 压测等「上线会不会炸」 |
| 🧩 **兼容性测试** | OpenAI Chat Completions：messages、参数边界、SSE、鉴权 |
| ⚡ **TTFT 性能** | 按输入长度分档测首 token 时间，汇总 P50 / P90，对比 SLA |
| 📈 **OTPS 吞吐** | 并发阶梯下的输出 token 速度 |
| 🎯 **精度验收** | 本地跑 AIME2026、GPQA-Diamond，带跑分对比图 |

全部 **纯前端** 执行；题库在 `public/benchmarks/`；部分模块支持按 **验收 Excel 格式** 导出。

这个仓库是我们对外开源的 **验收工具箱** —— 和我们内部上线前跑的检查项同一套思路。

---

## 🛠 技术栈

- ⚛️ React 19 + TypeScript + Vite 7  
- 🎨 Tailwind CSS  
- 🐻 Zustand（配置持久化到 `localStorage`）  
- 🌍 i18next — 界面 **中英文切换**  
- 📊 SheetJS（`xlsx`）导出 Excel  

---

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 开发（默认 http://localhost:5180）
npm run dev

# 构建
npm run build
npm run preview
```

1. 打开站点 → **总览**  
2. 填写 **接口地址**、**API Key**、**模型** → 保存  
3. 点 **测试连通性**  
4. 侧栏选模块，开跑 🎉  

> 💡 **跨域：** 开发环境可勾选「使用开发代理路径」，或让网关放行浏览器来源。

---

## 📁 目录结构（简版）

```
src/
  pages/          # 总览、工程性、兼容性、TTFT、OTPS、精度
  core/           # 请求/SSE、指标统计、Excel 导出
  suites/         # 用例定义
  data/           # Benchmark 元数据与参考跑分
public/benchmarks/  # AIME、GPQA 等本地题库
```

---

## 🔒 隐私说明

- API Key **仅保存在浏览器本地**，不上传到我们任何服务器。  
- 请求从你的浏览器 **直连** 你配置的 API 地址（或本地 dev 代理）。  

---

## 📄 验收依据

用例对齐内部 **第三方模型评测验收标准**（工程性、兼容性、TTFT/OTPS 分档 SLA、精度 benchmark 等）。Excel 导出格式与正式验收表一致。

---

## 🤝 适合谁用？

- **模型 / 网关厂商** — 交付客户前自检  
- **飞鸾客户** — 开通 endpoint 后快速冒烟  
- **开发者** — 排查「curl 能通、业务不通」的兼容性问题  

---

## 🏢 关于飞鸾

**杭州飞鸾数字科技有限公司** 专注 AI 基础设施，面向 **B 端** 客户提供大模型能力。

说人话就是：我们做一个 **AI 中转 / 网关** —— 你把应用的 Base URL 换成我们的地址，我们帮你对接各家模型、扛流量、控限速，让线上调用更稳。

我们擅长：

- 🚀 **大体量 TPM / RPM**，适合真实业务流量，不是 demo 级玩票。**上亿级 TPM 可以谈** —— 我们和上游直聊机房资源，已对接 **DeepSeek、GLM、Kimi、Seedance** 等线路  
- 📜 需要时可签 **SLA**，延迟和可用性有据可查  
- 🔌 **OpenAI 兼容** 接口，多数 SDK 改个地址就能用  
- 🤝 **企业级接入**，容量、计费、售后按 B 端节奏来  

### 📬 联系方式与产品

| | |
|---|---|
| 📞 **电话** | +86 172 7543 8931 |
| ✉️ **邮箱** | [feiluanzhineng@gmail.com](mailto:feiluanzhineng@gmail.com) |
| 🇨🇳 **API 中转（国内）** | [ai.feiluanai.com](https://ai.feiluanai.com) |
| 🌍 **API 中转（海外）** | [bigbangtoken.com](https://bigbangtoken.com) |
| 🖼️ **生图站点** | [feiluanai.com](https://feiluanai.com) |

B 端接入、容量评估或 SLA 方案，欢迎直接电话 / 邮件联系。

---

<p align="center">
  <sub>用 ☕ 和数不清的 SSE chunk 砌成 · 飞鸾 AI</sub>
</p>
