import * as XLSX from 'xlsx'
import type { OtpsRunReport } from '../types/otps'
import { OTPS_SLA_TIERS } from './otps-sla'

function modelSizeLabel(size: OtpsRunReport['plan']['modelSize']): string {
  return size === 'gt10b' ? '>10B' : '≤10B'
}

export function downloadOtpsExcel(report: OtpsRunReport): void {
  const mainRows: unknown[][] = [
    ['第三方模型评测标准'],
    ['3.2 OTPS（按不同并发测试，取请求成功率>99%的 OTPS 数据）'],
    [],
    ['模型', report.model, '接口地址', report.baseUrl],
    ['开始时间', report.startedAt, '结束时间', report.finishedAt],
    ['模型激活参数', modelSizeLabel(report.plan.modelSize), 'max_tokens', report.plan.maxTokens],
    [],
    ['模型激活参数', '档位/Tier', '官方侧 OTPS 要求', '供应商实测结果', '备注'],
  ]

  for (const sla of report.slaResults) {
    const measured =
      sla.measuredOtps != null ? `${sla.measuredOtps.toFixed(1)} tokens/s` : 'N/A'
    const requirement = `≥ ${sla.minOtps} tokens/s`
    const result = sla.indicativeOnly
      ? `N/A。${sla.note}`
      : sla.pass
        ? `通过。${measured}`
        : `不通过。${measured}`
    mainRows.push([
      modelSizeLabel(report.plan.modelSize),
      sla.labelKey,
      requirement,
      result,
      sla.note,
    ])
  }

  if (report.plan.modelSize === 'gt10b') {
    mainRows.push([
      '≤10B',
      '/',
      '≥ 100 tokens/s',
      'N/A',
      `${report.model} 激活参数 >10B`,
    ])
  }

  const levelRows: unknown[][] = [
    ['并发数', '请求数', '成功', '失败', '成功率', 'OTPS P50', 'OTPS P90', 'OTPS 均值', '是否采信'],
  ]

  for (const level of report.levels) {
    const s = level.stats
    levelRows.push([
      level.concurrency,
      s.total,
      s.success,
      s.failed,
      `${(s.successRate * 100).toFixed(1)}%`,
      s.otpsP50 != null ? s.otpsP50.toFixed(1) : '',
      s.otpsP90 != null ? s.otpsP90.toFixed(1) : '',
      s.otpsAvg != null ? s.otpsAvg.toFixed(1) : '',
      s.indicativeOnly ? '仅供参考' : '可采信',
    ])
  }

  const detailRows: unknown[][] = [
    ['#', '并发', '序号', '状态', 'OTPS', '输出 Token', '总耗时(ms)', 'TTFT(ms)', 'HTTP', '错误'],
  ]

  for (const r of report.requests) {
    detailRows.push([
      r.index,
      r.concurrency,
      r.seqInLevel,
      r.status,
      r.otps != null ? r.otps.toFixed(1) : '',
      r.completionTokens ?? '',
      r.totalMs != null ? Math.round(r.totalMs) : '',
      r.ttftMs != null ? Math.round(r.ttftMs) : '',
      r.httpStatus ?? '',
      r.error ?? '',
    ])
  }

  const wb = XLSX.utils.book_new()
  const wsMain = XLSX.utils.aoa_to_sheet(mainRows)
  wsMain['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 22 }, { wch: 28 }, { wch: 40 }]

  const wsLevels = XLSX.utils.aoa_to_sheet(levelRows)
  wsLevels['!cols'] = [
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
  ]

  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows)
  wsDetail['!cols'] = [
    { wch: 6 },
    { wch: 8 },
    { wch: 8 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 8 },
    { wch: 30 },
  ]

  XLSX.utils.book_append_sheet(wb, wsMain, 'OTPS验收')
  XLSX.utils.book_append_sheet(wb, wsLevels, '并发汇总')
  XLSX.utils.book_append_sheet(wb, wsDetail, '请求明细')

  const date = report.finishedAt.slice(0, 10)
  const safeModel = report.model.replace(/[^\w.-]+/g, '_')
  XLSX.writeFile(wb, `OTPS验收-${safeModel}-${date}.xlsx`)
}

export { OTPS_SLA_TIERS }
