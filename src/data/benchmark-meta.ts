export type BenchmarkRunMode = 'auto' | 'preview' | 'manual'

export interface BenchmarkMeta {
  id: string
  nameKey: string
  /** 验收文档里的数据集名 */
  docName: string
  questionCount: number
  localFile?: string
  fileSizeHint?: string
  runMode: BenchmarkRunMode
  abilityKey: string
  descriptionKey: string
  whyKey: string
  sourceUrl: string
  officialBaselinePct?: number
  tolerancePct: number
}

export const BENCHMARK_CATALOG: BenchmarkMeta[] = [
  {
    id: 'aime2026',
    nameKey: 'aime2026',
    docName: 'AIME2026',
    questionCount: 30,
    localFile: '/benchmarks/aime2026.jsonl',
    fileSizeHint: '~13 KB',
    runMode: 'auto',
    abilityKey: 'reasoning',
    descriptionKey: 'aime2026',
    whyKey: 'aime2026',
    sourceUrl: 'https://huggingface.co/datasets/math-ai/aime26',
    officialBaselinePct: 95.3,
    tolerancePct: 2,
  },
  {
    id: 'gpqa-diamond',
    nameKey: 'gpqaDiamond',
    docName: 'GPQA-Diamond',
    questionCount: 198,
    localFile: '/benchmarks/gpqa_diamond.json',
    fileSizeHint: '~324 KB',
    runMode: 'auto',
    abilityKey: 'reasoning',
    descriptionKey: 'gpqaDiamond',
    whyKey: 'gpqaDiamond',
    sourceUrl: 'https://huggingface.co/datasets/Idavidrein/gpqa',
    officialBaselinePct: 86.2,
    tolerancePct: 2,
  },
  {
    id: 'swe-bench-pro',
    nameKey: 'sweBenchPro',
    docName: 'SWE-Bench Pro',
    questionCount: 731,
    localFile: '/benchmarks/swe_bench_pro_slim.json',
    fileSizeHint: '~1 MB（仅题干）',
    runMode: 'preview',
    abilityKey: 'coding',
    descriptionKey: 'sweBenchPro',
    whyKey: 'sweBenchPro',
    sourceUrl: 'https://huggingface.co/datasets/ScaleAI/SWE-bench_Pro',
    officialBaselinePct: 58.4,
    tolerancePct: 2,
  },
  {
    id: 'hle',
    nameKey: 'hle',
    docName: 'HLE',
    questionCount: 2500,
    runMode: 'manual',
    abilityKey: 'reasoning',
    descriptionKey: 'hle',
    whyKey: 'hle',
    sourceUrl: 'https://huggingface.co/datasets/cais/hle',
    officialBaselinePct: 52.3,
    tolerancePct: 2,
  },
  {
    id: 'tau-bench',
    nameKey: 'tauBench',
    docName: 'TAU Bench',
    questionCount: 0,
    runMode: 'manual',
    abilityKey: 'agent',
    descriptionKey: 'tauBench',
    whyKey: 'tauBench',
    sourceUrl: 'https://github.com/sierra-research/tau2-bench',
    officialBaselinePct: 70.6,
    tolerancePct: 2,
  },
]

export function getBenchmarkMeta(id: string): BenchmarkMeta | undefined {
  return BENCHMARK_CATALOG.find((b) => b.id === id)
}
