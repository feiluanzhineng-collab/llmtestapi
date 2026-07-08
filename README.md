# 🧪 LLM API Test

**English** · [中文](README.zh-CN.md)

> Open-source, browser-only acceptance test bench for OpenAI-compatible LLM APIs.  
> No backend. Your API key stays in the browser.

[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

---

## ✨ What is this project?

**LLM API Test** is a single-page app that helps you **verify a model API end-to-end** — compatibility, engineering behavior, latency, throughput, and benchmark accuracy — without installing Python harnesses or Docker.

Think of it as a **flight checklist** for your `/v1/chat/completions` endpoint:

| Module | What it checks |
|--------|----------------|
| 🏠 **Overview** | One place to save Base URL, API Key, and model (shared by all tests) |
| 🔧 **Engineering** | Tool calls, streaming, retries, EOS pressure, and other “will it break in prod?” cases |
| 🧩 **Compatibility** | OpenAI Chat Completions shape: messages, params, SSE, auth errors |
| ⚡ **TTFT** | Time-to-first-token by input size tier — P50 / P90 vs SLA |
| 📈 **OTPS** | Output tokens per second under concurrency steps |
| 🎯 **Accuracy** | Local AIME2026 & GPQA-Diamond runs + score charts |

Everything runs **in your browser**. Benchmark files ship under `public/benchmarks/`. Results can be exported to **Excel** (acceptance doc format) or JSON where supported.

This repo is our **open-source acceptance toolkit** — the same idea as the checks we run internally before calling an integration production-ready.

---

## 🛠 Tech stack

- ⚛️ React 19 + TypeScript + Vite 7  
- 🎨 Tailwind CSS  
- 🐻 Zustand (config + persistence in `localStorage`)  
- 🌍 i18next — **English / 中文** in the UI  
- 📊 SheetJS (`xlsx`) for Excel export  

---

## 🚀 Quick start

```bash
# install
npm install

# dev server (default http://localhost:5180)
npm run dev

# production build
npm run build
npm run preview
```

1. Open the app → **Overview**  
2. Paste your **Base URL**, **API Key**, and **model** → Save  
3. Hit **Test connection**  
4. Pick a module from the sidebar and run 🎉  

> 💡 **CORS:** In dev, enable “Use dev proxy path” or configure your gateway to allow browser origins.

---

## 📁 Project layout (short)

```
src/
  pages/          # Dashboard, Engineering, Compatibility, TTFT, OTPS, Accuracy
  core/           # Runners, SSE client, metrics, Excel export
  suites/         # Test case definitions
  data/           # Benchmark metadata & leaderboard reference scores
public/benchmarks/  # AIME, GPQA, SWE-Bench slim (local fetch)
```

---

## 🔒 Privacy

- API keys are stored **only in your browser** (`localStorage`).  
- We do **not** operate a backend that receives your credentials.  
- Requests go **directly** from your browser to **your** API base URL (or the dev proxy).

---

## 📄 Acceptance reference

Tests are aligned with internal **third-party model acceptance** criteria (engineering, compatibility, TTFT/OTPS SLA tiers, accuracy benchmarks). Excel exports match the spreadsheet layout used in formal reviews.

---

## 🤝 Who is this for?

- **Model vendors & gateways** — self-check before customer handoff  
- **Feiluan customers** — sanity-check after we provision your endpoint  
- **Developers** — debug “works in curl, fails in app” OpenAI-compat issues  

---

## 🏢 About Feiluan

**Hangzhou Feiluan Digital Technology Co., Ltd.** (杭州飞鸾数字科技有限公司) builds AI infrastructure for **B2B** customers.

In plain terms: we run an **LLM gateway / relay** — swap your app’s Base URL to ours, and we connect you to frontier models, absorb traffic spikes, and enforce rate limits so production stays stable.

What we’re good at:

- 🚀 **Massive TPM / RPM** for real workloads — not demo-tier limits. **100M+ TPM** is on the table; we negotiate upstream capacity directly with datacenters. Models we route include **DeepSeek, GLM, Kimi, Seedance**, and more.
- 📜 **SLA** when you need latency and uptime in writing  
- 🔌 **OpenAI-compatible** APIs — most SDKs only need a URL change  
- 🤝 **Enterprise onboarding** — capacity, billing, and support at B2B pace  

### 📬 Contact & products

| | |
|---|---|
| 📞 **Phone** | +86 172 7543 8931 |
| ✉️ **Email** | [feiluanzhineng@gmail.com](mailto:feiluanzhineng@gmail.com) |
| 🇨🇳 **API gateway (China)** | [ai.feiluanai.com](https://ai.feiluanai.com) |
| 🌍 **API gateway (international)** | [bigbangtoken.com](https://bigbangtoken.com) |
| 🖼️ **Image generation** | [feiluanai.com](https://feiluanai.com) |

For B2B access, capacity planning, or SLA — call or email us directly.

---

<p align="center">
  <sub>Built with ☕ and an unreasonable number of SSE chunks · Feiluan AI</sub>
</p>
