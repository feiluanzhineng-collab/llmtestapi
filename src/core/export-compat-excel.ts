import * as XLSX from 'xlsx'
import type { CompatCaseDef, CompatCaseResult, CompatRunReport } from '../types/compat'

function formatMeasuredResult(c: CompatCaseResult): { result: string; notes: string } {
  if (c.status === 'skip') {
    const skipMsg = c.steps.find((s) => s.status === 'skip')?.message ?? ''
    return { result: `N/A。${skipMsg}`, notes: '' }
  }

  if (c.status === 'fail' || c.status === 'error') {
    const failed = c.steps.filter((s) => s.status === 'fail' || s.status === 'error')
    const detail = failed.map((s) => `${s.label}: ${s.message}`).join('；')
    return { result: '不通过', notes: detail }
  }

  const passed = c.steps.filter((s) => s.status === 'pass')
  const detail = passed
    .map((s) => {
      const http = s.httpStatus ? `HTTP ${s.httpStatus}` : ''
      const ms = s.durationMs ? `${s.durationMs}ms` : ''
      return [s.label, http, ms].filter(Boolean).join(' ')
    })
    .join('；')

  return { result: detail ? `通过。${detail}` : '通过', notes: '' }
}

function statusLabelZh(status: CompatCaseResult['status']): string {
  switch (status) {
    case 'pass':
      return '通过'
    case 'fail':
      return '不通过'
    case 'skip':
      return 'N/A'
    default:
      return status
  }
}

export function downloadCompatibilityExcel(
  report: CompatRunReport,
  caseDefs: CompatCaseDef[],
): void {
  const mainRows: unknown[][] = [
    ['第三方模型评测标准'],
    ['API兼容性（OpenAI格式）'],
    [],
    ['模型', report.model, '接口地址', report.baseUrl],
    ['开始时间', report.startedAt, '结束时间', report.finishedAt],
    [
      '汇总',
      `共 ${report.summary.total} 项`,
      `通过 ${report.summary.pass}`,
      `未通过 ${report.summary.fail}`,
      `跳过 ${report.summary.skip}`,
    ],
    [],
    ['', '测试主题', '测试要点', '失败风险影响', '供应商实测结果', '备注'],
  ]

  for (const c of report.cases) {
    const def = caseDefs.find((d) => d.id === c.caseId)
    const { result, notes } = formatMeasuredResult(c)
    mainRows.push([
      '',
      c.subject,
      def?.testPoints ?? '',
      def?.risk ?? '',
      result,
      notes,
    ])
  }

  const detailRows: unknown[][] = [
    ['测试主题', '步骤', '状态', 'HTTP', '耗时(ms)', '说明', '响应摘要'],
  ]

  for (const c of report.cases) {
    for (const step of c.steps) {
      detailRows.push([
        c.subject,
        step.label,
        statusLabelZh(step.status as CompatCaseResult['status']),
        step.httpStatus || '',
        step.durationMs || '',
        step.message,
        step.responsePreview,
      ])
    }
  }

  const wb = XLSX.utils.book_new()

  const wsMain = XLSX.utils.aoa_to_sheet(mainRows)
  wsMain['!cols'] = [
    { wch: 6 },
    { wch: 20 },
    { wch: 48 },
    { wch: 24 },
    { wch: 58 },
    { wch: 36 },
  ]

  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows)
  wsDetail['!cols'] = [
    { wch: 18 },
    { wch: 22 },
    { wch: 10 },
    { wch: 8 },
    { wch: 10 },
    { wch: 40 },
    { wch: 50 },
  ]

  XLSX.utils.book_append_sheet(wb, wsMain, '兼容性验收')
  XLSX.utils.book_append_sheet(wb, wsDetail, '步骤明细')

  const date = report.finishedAt.slice(0, 10)
  const safeModel = report.model.replace(/[^\w.-]+/g, '_')
  XLSX.writeFile(wb, `兼容性验收-${safeModel}-${date}.xlsx`)
}
