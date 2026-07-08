import * as XLSX from 'xlsx'
import type { EngCaseDef, EngCaseResult, EngManualOverride, EngRunReport } from '../types/engineering'

function formatMeasuredResult(
  c: EngCaseResult,
  def: EngCaseDef | undefined,
  manual?: EngManualOverride,
): { result: string; notes: string } {
  if (c.status === 'manual' || def?.mode === 'manual') {
    const st = manual?.status ?? 'na'
    const notes = manual?.notes ?? ''
    if (st === 'pass') return { result: `通过。${notes}`, notes: '' }
    if (st === 'fail') return { result: '不通过', notes: notes || '人工确认未通过' }
    return { result: `N/A。${notes || '待人工确认'}`, notes: '' }
  }

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
  const detail = passed.map((s) => `${s.label}: ${s.message}`).join('；')
  const prefix = def?.mode === 'semi' ? '通过（建议人工复核）。' : '通过。'
  return { result: detail ? `${prefix}${detail}` : '通过', notes: manual?.notes ?? '' }
}

export function downloadEngineeringExcel(
  report: EngRunReport,
  caseDefs: EngCaseDef[],
  manualOverrides?: Record<string, EngManualOverride>,
): void {
  const overrides = manualOverrides ?? report.manualOverrides

  const mainRows: unknown[][] = [
    ['第三方模型评测标准'],
    ['一、工程验收 / Interface Results'],
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
    ['Requirements', '', '', '', '供应商实测结果', '备注'],
  ]

  for (const c of report.cases) {
    const def = caseDefs.find((d) => d.id === c.caseId)
    const { result, notes } = formatMeasuredResult(c, def, overrides[c.caseId])
    mainRows.push([def?.requirement ?? c.subject, '', '', '', result, notes])
  }

  const detailRows: unknown[][] = [
    ['测试主题', '步骤', '状态', 'HTTP', '耗时(ms)', '说明'],
  ]

  for (const c of report.cases) {
    for (const step of c.steps) {
      detailRows.push([
        c.subject,
        step.label,
        step.status,
        step.httpStatus || '',
        step.durationMs || '',
        step.message,
      ])
    }
  }

  const wb = XLSX.utils.book_new()
  const wsMain = XLSX.utils.aoa_to_sheet(mainRows)
  wsMain['!cols'] = [{ wch: 72 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 52 }, { wch: 36 }]

  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows)
  wsDetail['!cols'] = [
    { wch: 22 },
    { wch: 24 },
    { wch: 10 },
    { wch: 8 },
    { wch: 10 },
    { wch: 48 },
  ]

  XLSX.utils.book_append_sheet(wb, wsMain, '工程验收')
  XLSX.utils.book_append_sheet(wb, wsDetail, '步骤明细')

  const date = report.finishedAt.slice(0, 10)
  const safeModel = report.model.replace(/[^\w.-]+/g, '_')
  XLSX.writeFile(wb, `工程验收-${safeModel}-${date}.xlsx`)
}
