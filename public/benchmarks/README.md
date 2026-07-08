# 本地 Benchmark 数据

验收文档「精度验收」相关数据集。开发时通过 `/benchmarks/<file>` 访问。

| 文件 | 题量 | 本地能否自动评测 |
|------|------|------------------|
| `aime2026.jsonl` | 30 | ✅ 是 |
| `gpqa_diamond.json` | 198 | ✅ 是 |
| `swe_bench_pro_slim.json` | 731 | ❌ 仅题干预览 |

## 来源

- AIME: https://huggingface.co/datasets/math-ai/aime26
- GPQA: 公开 JSON 镜像（198 题 Diamond）
- SWE-Bench Pro: https://huggingface.co/datasets/ScaleAI/SWE-bench_Pro（slim 导出）

SWE-Bench 完整评测需 Docker: https://github.com/scaleapi/SWE-bench_Pro-os
