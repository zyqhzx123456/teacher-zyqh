import { useState, useEffect } from 'react'
import ChartBlock from '../components/ChartBlock'
import {
  runAnalysis,
  normalizeResult,
  type AnalysisResult,
  type Overview,
  type DimensionDiag,
  type Highlight,
  type Problem,
  type Suggestion,
  type ChartSpec,
} from '../api/analyze'
import {
  analysisMaterials,
  groupOfMember,
  type AnalysisMaterial,
  type MaterialStatus,
} from '../data/mock'
import { loadJSON, saveJSON, LS_KEYS } from '../lib/storage'
import { listSubmissions, type SubmissionRow } from '../api/submit'
import { useRole, LEADER_GROUP } from '../lib/role'

const statusMeta: Record<MaterialStatus, { text: string; cls: string }> = {
  pending: { text: '待分析', cls: 'bg-slate-100 text-slate-500' },
  analyzing: { text: '分析中…', cls: 'bg-brand-50 text-brand-700' },
  done: { text: '已完成', cls: 'bg-emerald-50 text-emerald-600' },
}

function StatusTag({ status }: { status: MaterialStatus }) {
  const s = statusMeta[status]
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${s.cls}`}>
      {status === 'analyzing' && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-500 mr-1 align-middle animate-pulse" />
      )}
      {s.text}
    </span>
  )
}

// 严重程度 / 优先级配色（高/中/低）
function sevClass(s: string): string {
  if (s === '高') return 'bg-rose-50 text-rose-600 border border-rose-200'
  if (s === '中') return 'bg-amber-50 text-amber-600 border border-amber-200'
  return 'bg-sky-50 text-sky-600 border border-sky-200'
}

// ---------- 导出相关（HTML / TXT / 分享） ----------

interface ReportModel {
  title: string
  subject: string
  grade: string
  overview?: Overview
  dimensions?: DimensionDiag[]
  highlights?: Highlight[]
  problems?: Problem[]
  suggestions?: Suggestion[]
  charts?: ChartSpec[]
  checked: Record<string, boolean>
  raw?: string
}

// 文件名做安全处理：去掉非法字符、限长、兜底
function safeFileName(input: string): string {
  const cleaned = input
    .replace(/[\\/:*?"<>|\n\r\t]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 60)
    .replace(/_+$/g, '')
  return cleaned || '教研分析报告'
}

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function pushList(lines: string[], title: string, items: string[]) {
  if (!items.length) return
  lines.push('─'.repeat(40))
  lines.push(title)
  lines.push('─'.repeat(40))
  items.forEach((t) => lines.push(`• ${t}`))
  lines.push('')
}

function progressBar(done: number, total: number): string {
  const width = 20
  const filled = total ? Math.round((done / total) * width) : 0
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled)
  const pct = total ? Math.round((done / total) * 100) : 0
  return `[${bar}] ${done}/${total} (${pct}%)`
}

function chartToText(c: ChartSpec): string {
  const head = `图表：${c.title}（${c.unit}）｜解读：${c.interpretation}`
  if (c.type === 'heatmap') {
    const body = c.rows
      .map((r, ri) => `  ${r}: ${c.matrix[ri].join(' / ')}`)
      .join('\n')
    return `${head}\n  行：${c.rows.join('、')}　列：${c.cols.join('、')}\n${body}`
  }
  const labels = `  类目：${c.labels.join('、')}`
  const series = c.series.map((s) => `  ${s.name}：${s.values.join('、')}`).join('\n')
  return `${head}\n${labels}\n${series}`
}

// 纯文本报告：分隔线 + 进度条，勾选改进措施带标记
export function buildTextReport(m: ReportModel): string {
  const lines: string[] = []
  lines.push('═'.repeat(40))
  lines.push('教研组 AI 分析报告')
  lines.push('═'.repeat(40))
  lines.push(`资料：${m.title}`)
  lines.push(`学科 / 年级：${m.subject} · ${m.grade}`)
  lines.push(`生成时间：${new Date().toLocaleString('zh-CN')}`)
  lines.push('')

  if (m.overview) {
    pushList(lines, '一、概览', [
      m.overview.conclusion,
      `分析对象：${m.overview.object}`,
      `数据范围：${m.overview.scope}`,
      `时间口径：${m.overview.period}`,
      `依据：${m.overview.basis}`,
    ])
  }
  if (m.dimensions?.length) {
    lines.push('─'.repeat(40))
    lines.push('二、分维诊断')
    lines.push('─'.repeat(40))
    m.dimensions.forEach((d) => {
      lines.push(`▶ ${d.name}${d.insufficient ? '（数据不足）' : ''}`)
      lines.push(`  现状：${d.status}`)
      lines.push(`  差异：${d.difference}`)
      lines.push(`  可能成因：${d.cause}`)
      lines.push('')
    })
  }
  pushList(
    lines,
    '三、亮点',
    (m.highlights || []).map((h) => `${h.item}（依据：${h.evidence}）`),
  )
  if (m.problems?.length) {
    lines.push('─'.repeat(40))
    lines.push('四、问题（按严重程度）')
    lines.push('─'.repeat(40))
    m.problems.forEach((p) => {
      lines.push(`[${p.severity}] ${p.description}`)
      lines.push(`  影响范围：${p.impact}　受影响对象：${p.affected}`)
      lines.push(`  判定依据：${p.basis}`)
      lines.push('')
    })
  }
  if (m.suggestions?.length) {
    const total = m.suggestions.length
    const done = m.suggestions.filter((s) => m.checked[s.action]).length
    lines.push('─'.repeat(40))
    lines.push(`五、可操作建议（落实进度 ${done}/${total}）`)
    lines.push('─'.repeat(40))
    lines.push(progressBar(done, total))
    lines.push('')
    m.suggestions.forEach((s) => {
      const ref = s.problemRef != null ? `（对应问题 ${s.problemRef + 1}）` : ''
      lines.push(`[${s.priority}] ${m.checked[s.action] ? '✓' : '○'} ${s.action} ${ref}`)
      lines.push(`  执行角色：${s.role}　预期效果：${s.expected}`)
      lines.push('')
    })
  }
  if (m.charts?.length) {
    lines.push('─'.repeat(40))
    lines.push('六、可视化数据')
    lines.push('─'.repeat(40))
    m.charts.forEach((c) => lines.push(chartToText(c), ''))
  }
  if (m.raw) {
    lines.push('─'.repeat(40))
    lines.push('原始返回')
    lines.push('─'.repeat(40))
    lines.push(m.raw)
  }
  return lines.join('\n')
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function chartToHTML(c: ChartSpec): string {
  if (c.type === 'heatmap') {
    const rows = c.rows
      .map(
        (r, ri) =>
          `<tr><td class="k">${esc(r)}</td>${c.matrix[ri]
            .map((v) => `<td>${Math.round(v * 10) / 10}</td>`)
            .join('')}</tr>`,
      )
      .join('')
    const thead = `<tr><th></th>${c.cols.map((x) => `<th>${esc(x)}</th>`).join('')}</tr>`
    return `<div class="chart"><h3>${esc(c.title)} <span class="u">${esc(c.unit)}</span></h3>${c.type === 'heatmap' ? `<table class="mt">${thead}${rows}</table>` : ''}<p class="int">解读：${esc(c.interpretation)}</p></div>`
  }
  const labels = `<tr><th>类目</th>${c.labels.map((x) => `<th>${esc(x)}</th>`).join('')}</tr>`
  const series = c.series
    .map((s) => `<tr><td class="k">${esc(s.name)}</td>${s.values.map((v) => `<td>${Math.round(v * 10) / 10}</td>`).join('')}</tr>`)
    .join('')
  return `<div class="chart"><h3>${esc(c.title)} <span class="u">${esc(c.unit)}</span></h3><table class="mt">${labels}${series}</table><p class="int">解读：${esc(c.interpretation)}</p></div>`
}

// HTML 报告：淡紫色样式、可打印
export function buildHTMLReport(m: ReportModel): string {
  const sect = (title: string, html: string) => `<h2>${title}</h2>${html || '<p class="empty">（无）</p>'}`
  const ov = m.overview
    ? `<div class="callout">${esc(m.overview.conclusion)}</div>
       <div class="meta-grid">
         <div><span>分析对象</span>${esc(m.overview.object)}</div>
         <div><span>数据范围</span>${esc(m.overview.scope)}</div>
         <div><span>时间口径</span>${esc(m.overview.period)}</div>
       </div>
       <p class="basis">依据：${esc(m.overview.basis)}</p>`
    : ''
  const dims = (m.dimensions || [])
    .map(
      (d) =>
        `<div class="dim"><div class="dim-h">${esc(d.name)}${d.insufficient ? '<span class="tag">数据不足</span>' : ''}</div>
         <p><b>现状：</b>${esc(d.status)}</p><p><b>差异：</b>${esc(d.difference)}</p><p><b>可能成因：</b>${esc(d.cause)}</p></div>`,
    )
    .join('')
  const hi = (m.highlights || [])
    .map((h) => `<li>${esc(h.item)}<span class="ev">（依据：${esc(h.evidence)}）</span></li>`)
    .join('')
  const probs = (m.problems || [])
    .map(
      (p) =>
        `<div class="prob sev-${p.severity}"><div class="prob-h"><span class="badge">${esc(
          p.severity,
        )}</span>${esc(p.description)}</div>
         <p><b>影响范围：</b>${esc(p.impact)}　<b>受影响对象：</b>${esc(p.affected)}</p>
         <p class="basis"><b>判定依据：</b>${esc(p.basis)}</p></div>`,
    )
    .join('')
  const sug = (m.suggestions || [])
    .map((s) => {
      const ref = s.problemRef != null ? `（对应问题 ${s.problemRef + 1}）` : ''
      const done = m.checked[s.action]
      return `<div class="sug"><label><input type="checkbox" ${
        done ? 'checked' : ''
      } disabled /> <span class="${done ? 'done' : ''}"><span class="badge">${esc(
        s.priority,
      )}</span> ${esc(s.action)} ${esc(ref)}</span></label>
       <p class="basis"><b>执行角色：</b>${esc(s.role)}　<b>预期效果：</b>${esc(s.expected)}</p></div>`
    })
    .join('')
  const charts = (m.charts || []).map(chartToHTML).join('')
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>教研组 AI 分析报告 · ${esc(m.title)}</title>
<style>
  :root { --brand: #8B5CF6; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2937; background: #f5f3ff; margin: 0; padding: 24px; }
  .wrap { max-width: 860px; margin: 0 auto; background: #fff; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); padding: 28px; }
  h1 { color: var(--brand); font-size: 22px; margin: 0 0 4px; }
  .meta { color: #6b7280; font-size: 13px; margin-bottom: 18px; }
  h2 { color: var(--brand); font-size: 16px; border-left: 4px solid var(--brand); padding-left: 8px; margin: 22px 0 10px; }
  .callout { background: #f5f3ff; border: 1px solid #ede9fe; border-radius: 12px; padding: 14px; line-height: 1.7; }
  .meta-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin: 12px 0; }
  .meta-grid div { background: #faf9ff; border: 1px solid #f1eefe; border-radius: 10px; padding: 10px; font-size: 13px; }
  .meta-grid span { display: block; color: #6b7280; font-size: 11px; margin-bottom: 2px; }
  .basis { color: #6b7280; font-size: 12px; }
  .dim { border: 1px solid #eef2f7; border-radius: 12px; padding: 12px; margin: 8px 0; }
  .dim-h { font-weight: 700; color: #334155; margin-bottom: 4px; }
  .dim p, .prob p, .sug p { margin: 4px 0; line-height: 1.6; }
  .tag { font-size: 11px; color: #b45309; background: #fef3c7; border-radius: 6px; padding: 1px 6px; margin-left: 6px; }
  ul { margin: 0; padding-left: 20px; } li { margin: 4px 0; } .ev { color: #6b7280; font-size: 12px; }
  .prob { border: 1px solid #eef2f7; border-radius: 12px; padding: 12px; margin: 8px 0; } .prob-h { font-weight: 600; }
  .sev-高 { border-left: 4px solid #f43f5e; } .sev-中 { border-left: 4px solid #f59e0b; } .sev-低 { border-left: 4px solid #0ea5e9; }
  .badge { display: inline-block; font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--brand); color: #fff; margin-right: 4px; }
  .sug { border: 1px solid #eef2f7; border-radius: 12px; padding: 12px; margin: 8px 0; } .sug .done { text-decoration: line-through; color: #9ca3af; }
  .chart { border: 1px solid #eef2f7; border-radius: 12px; padding: 12px; margin: 10px 0; }
  .chart h3 { font-size: 14px; margin: 0 0 8px; } .chart .u { font-size: 11px; color: #94a3b8; font-weight: 400; }
  .chart .int { font-size: 12px; color: #475569; margin: 8px 0 0; }
  table.mt { border-collapse: collapse; width: 100%; font-size: 12px; margin: 6px 0; }
  table.mt th, table.mt td { border: 1px solid #eef2f7; padding: 4px 8px; text-align: center; }
  table.mt th { background: #faf9ff; } table.mt td.k, table.mt th:first-child { text-align: left; color: #64748b; }
  .empty { color: #9ca3af; font-size: 13px; }
  pre { background: #f8fafc; border-radius: 10px; padding: 12px; font-size: 12px; white-space: pre-wrap; }
  @media print { body { background: #fff; padding: 0; } .wrap { box-shadow: none; } }
</style>
</head>
<body>
  <div class="wrap">
    <h1>教研组 AI 分析报告</h1>
    <div class="meta">资料：${esc(m.title)} ｜ 学科 / 年级：${esc(m.subject)} · ${esc(
      m.grade,
    )} ｜ 生成时间：${new Date().toLocaleString('zh-CN')}</div>
    ${sect('一、概览', ov)}
    ${sect('二、分维诊断', dims)}
    ${sect('三、亮点', hi ? `<ul>${hi}</ul>` : '')}
    ${sect('四、问题（按严重程度）', probs)}
    ${sect('五、可操作建议', sug)}
    ${sect('六、可视化数据', charts)}
    ${m.raw ? `<h2>原始返回</h2><pre>${esc(m.raw)}</pre>` : ''}
  </div>
</body>
</html>`
}

// 分享给组长：优先 navigator.share，否则复制到剪贴板
async function shareToLeader(text: string, title: string) {
  if (navigator.share) {
    try {
      await navigator.share({ title: `教研组分析报告 · ${title}`, text })
      return
    } catch {
      /* 用户取消，降级到复制 */
    }
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    alert('已复制到剪贴板，可粘贴发给组长')
  } else {
    alert('当前环境不支持分享或复制，请手动导出文件后发送。')
  }
}

// 把底层错误转成用户友好的提示（按 AnalyzeError 的 code 区分超时 / 网络错误 / 空结果 / 服务异常）
function toFriendlyError(err: Error): string {
  // AnalyzeError 自带已本地化、可直接展示的中文文案
  if (err.name === 'AnalyzeError') return err.message
  const msg = err.message
  const isConn =
    err.name === 'TypeError' ||
    /Failed to fetch|NetworkError|ERR_|ECONNREFUSED|connect/i.test(msg) ||
    /^分析请求失败[（(]/.test(msg)
  if (isConn) {
    return '无法连接到 AI 分析服务（网络错误）。请确认本地服务已启动：在终端运行 `npm run dev:all`，并配置 AI_API_KEY，再点击「重试」。'
  }
  return msg
}

export default function Analyze() {
  const { group, isGroupScoped } = useRole()
  // 初始数据从 LocalStorage 读取（无则用内置 mock），刷新不丢
  const [items, setItems] = useState<AnalysisMaterial[]>(() =>
    loadJSON<AnalysisMaterial[]>(LS_KEYS.analyzeMaterials, analysisMaterials.map((m) => ({ ...m }))),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, AnalysisResult>>(() => {
    const r = loadJSON<Record<string, AnalysisResult>>(LS_KEYS.analyzeResults, {})
    return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, normalizeResult(v)]))
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  // 各资料下改进措施的勾选状态：{ [materialId]: { [measureText]: boolean } }
  const [checkedByMaterial, setCheckedByMaterial] = useState<Record<string, Record<string, boolean>>>(() =>
    loadJSON<Record<string, Record<string, boolean>>>(LS_KEYS.analyzeChecked, {}),
  )

  // 选择资料弹窗（从资料库选取，作为分析对象）
  const [picking, setPicking] = useState(false)
  const [subs, setSubs] = useState<SubmissionRow[] | null>(null)
  const [pickErr, setPickErr] = useState('')

  // 变更写回 LocalStorage（自动持久化，刷新/重开仍在）
  useEffect(() => {
    saveJSON(LS_KEYS.analyzeMaterials, items)
  }, [items])
  useEffect(() => {
    saveJSON(LS_KEYS.analyzeResults, results)
  }, [results])
  useEffect(() => {
    saveJSON(LS_KEYS.analyzeChecked, checkedByMaterial)
  }, [checkedByMaterial])

  // 打开"从资料库选择资料"弹窗：拉取已上传资料
  const openPicker = async () => {
    setPicking(true)
    setPickErr('')
    setSubs(null)
    const r = await listSubmissions({})
    if (r.code !== 0) {
      setSubs([])
      // 接口不可达（纯静态部署无 /api 后端，或本机后端未启动）
      setPickErr('暂时无法读取资料库')
      return
    }
    let list = r.list
    // 教研组长：仅可选本教研组教师提交的资料
    if (isGroupScoped) list = list.filter((s) => groupOfMember(s.uploader) === LEADER_GROUP)
    setSubs(list)
  }

  // 从资料库中选择一份资料，添加为分析对象
  const addFromResource = (s: SubmissionRow) => {
    const id = `r_${s.id}`
    if (items.some((i) => i.id === id)) {
      setPicking(false)
      setSelectedId(id)
      return
    }
    const nm: AnalysisMaterial = {
      id,
      title: s.name,
      subject: s.course || '通用',
      grade: s.class_name || '—',
      content: '',
      materials: s.orig_name,
      status: 'pending',
      uploader: s.uploader,
      group: groupOfMember(s.uploader) || '',
    }
    setItems((prev) => [nm, ...prev])
    setPicking(false)
    setSelectedId(id)
  }

  const deleteMaterial = (id: string) => {
    if (!confirm('确定移除这份分析资料？（仅移除分析条目，不影响资料库原文件）')) return
    setItems((prev) => prev.filter((i) => i.id !== id))
    setResults((prev) => {
      const n = { ...prev }
      delete n[id]
      return n
    })
    setCheckedByMaterial((prev) => {
      const n = { ...prev }
      delete n[id]
      return n
    })
    if (selectedId === id) setSelectedId(null)
  }

  const runOne = async (item: AnalysisMaterial) => {
    setSelectedId(item.id)
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'analyzing' } : i)))
    setErrors((prev) => {
      const n = { ...prev }
      delete n[item.id]
      return n
    })
    try {
      const r = await runAnalysis({
        title: item.title,
        subject: item.subject,
        grade: item.grade,
        content: item.content,
        materials: item.materials,
      })
      setResults((prev) => ({ ...prev, [item.id]: r }))
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'done' } : i)))
    } catch (e) {
      // 失败：恢复 pending 状态，记录错误（转成用户友好提示）
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'pending' } : i)))
      setErrors((prev) => ({ ...prev, [item.id]: toFriendlyError(e as Error) }))
    }
  }

  // 教研组长：仅展示本教研组资料（group 为空时回退到绑定组）
  const scoped = isGroupScoped ? group || LEADER_GROUP : null
  const visibleItems = scoped ? items.filter((i) => (i.group || '') === scoped) : items
  const selected = visibleItems.find((i) => i.id === selectedId) || null
  const result = selectedId ? results[selectedId] : undefined
  const error = selectedId ? errors[selectedId] : undefined

  // 组装当前报告数据（含勾选状态），供三种导出复用
  const buildModel = (): ReportModel | null => {
    if (!selected || !result) return null
    return {
      title: selected.title,
      subject: selected.subject,
      grade: selected.grade,
      overview: result.overview,
      dimensions: result.dimensions,
      highlights: result.highlights,
      problems: result.problems,
      suggestions: result.suggestions,
      charts: result.charts,
      checked: checkedByMaterial[selected.id] || {},
      raw: result.raw,
    }
  }

  const toggleMeasure = (text: string) => {
    if (!selectedId) return
    setCheckedByMaterial((prev) => ({
      ...prev,
      [selectedId]: { ...(prev[selectedId] || {}), [text]: !(prev[selectedId]?.[text]) },
    }))
  }

  const onExportHTML = () => {
    const m = buildModel()
    if (!m) return
    triggerDownload(`${safeFileName(m.title)}_分析报告.html`, buildHTMLReport(m), 'text/html')
  }
  const onExportText = () => {
    const m = buildModel()
    if (!m) return
    triggerDownload(`${safeFileName(m.title)}_分析报告.txt`, buildTextReport(m), 'text/plain')
  }
  const onShare = async () => {
    const m = buildModel()
    if (!m) return
    await shareToLeader(buildTextReport(m), m.title)
  }

  const suggestionsTotal = (result?.suggestions || []).length
  const suggestionsDone = selectedId
    ? Object.values(checkedByMaterial[selectedId] || {}).filter(Boolean).length
    : 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">资料分析</h1>
        <p className="text-sm text-slate-400 mt-1">
          从资料库选择资料后运行 AI 分析，生成「概览 / 分维诊断 / 亮点 / 问题 / 建议 / 可视化」六段式结论。
        </p>
        {/* 教研组长范围提示：仅展示本组资料，不展示其他教研组 */}
        {isGroupScoped && (
          <div className="text-xs text-brand-700 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2 leading-relaxed">
            您是 <strong>{LEADER_GROUP}教研组</strong> 组长，仅展示本组资料分析与 AI 结果（共 {visibleItems.length} 份），不展示其他教研组数据。
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧列表 */}
        <div className="lg:col-span-1 space-y-3">
          {/* 仅允许从资料库选择资料后添加（已移除手动新增入口） */}
          <button
            onClick={openPicker}
            className="w-full rounded-2xl bg-brand-50 text-brand-700 text-sm py-2.5 border border-dashed border-brand-200 hover:bg-brand-100 transition"
          >
            ＋ 从资料库选择资料
          </button>

          {visibleItems.length === 0 ? (
            <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-6 text-center text-sm text-slate-400 leading-relaxed">
              暂无分析资料。点击上方「＋ 从资料库选择资料」添加。
            </div>
          ) : (
            visibleItems.map((m) => (
              <div
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className={`rounded-2xl bg-white shadow-sm border p-4 cursor-pointer transition ${
                  selectedId === m.id ? 'border-brand-300 ring-1 ring-brand-200' : 'border-slate-100'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-slate-700 text-sm">{m.title}</div>
                  <StatusTag status={m.status} />
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {m.subject} · {m.grade}
                  {m.uploader && <span className="ml-1 text-brand-400">· {m.uploader}</span>}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    disabled={m.status === 'analyzing'}
                    onClick={(e) => {
                      e.stopPropagation()
                      runOne(m)
                    }}
                    className="flex-1 rounded-xl text-sm py-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed bg-brand-500 text-white hover:bg-brand-600"
                  >
                    {m.status === 'done' ? '重新分析' : '运行分析'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteMaterial(m.id)
                    }}
                    className="rounded-xl text-sm px-2.5 py-1.5 border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-rose-500"
                    title="移除分析资料"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 右侧结果 */}
        <div className="lg:col-span-2">
          {!selected && (
            <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-8 text-center text-slate-400">
              从左侧选择一份资料，点击「运行分析」查看 AI 结论。
            </div>
          )}

          {selected && selected.status === 'analyzing' && (
            <div className="rounded-2xl bg-white shadow-sm border border-brand-100 p-8 flex flex-col items-center gap-3 text-slate-500">
              <span className="w-7 h-7 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
              <div className="text-sm font-medium text-slate-600">正在分析，请稍候…</div>
              <div className="text-xs text-slate-400 text-center leading-relaxed">
                正在调用 AI 模型生成六段式报告，通常需要 10–60 秒，复杂资料可能更久。
                <br />
                若长时间无响应，请稍后点击「重试」。
              </div>
            </div>
          )}

          {selected && error && (
            <div className="rounded-2xl bg-white shadow-sm border border-rose-200 p-6">
              <div className="text-rose-600 font-medium text-sm">分析失败：{error}</div>
              <div className="text-xs text-slate-400 mt-1">状态已恢复为「待分析」，可重试。</div>
              <button
                onClick={() => runOne(selected)}
                className="mt-3 rounded-xl text-sm px-4 py-1.5 bg-brand-500 text-white hover:bg-brand-600"
              >
                重试
              </button>
            </div>
          )}

          {selected && result && !error && (
            <div className="space-y-5">
              {result.mock ? (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-relaxed">
                  当前为<strong>离线演示数据</strong>（Mock 分析器）。原因：未检测到可用的 AI 后端，或未配置 <code className="px-1">AI_API_KEY</code>。如需真实 AI 分析，请用 <code className="px-1">npm run dev:all</code> 启动后端并配置密钥。
                </div>
              ) : (
                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 leading-relaxed">
                  当前为<strong>真实 AI 分析</strong>结果（模型：{result.model || 'AI'}）。
                </div>
              )}
              {result.error && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 leading-relaxed">
                  模型调用异常（{result.error.code}）：{result.error.message}
                </div>
              )}

              {/* 一、概览 */}
              {result.overview && (
                <section className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5">
                  <h3 className="text-base font-semibold text-slate-800 mb-2">一、概览</h3>
                  <p className="text-sm text-slate-600 leading-relaxed bg-brand-50/60 border border-brand-100 rounded-xl p-3">
                    {result.overview.conclusion}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs text-slate-400">分析对象</div>
                      <div className="text-sm text-slate-700 mt-0.5">{result.overview.object}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs text-slate-400">数据范围</div>
                      <div className="text-sm text-slate-700 mt-0.5">{result.overview.scope}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs text-slate-400">时间口径</div>
                      <div className="text-sm text-slate-700 mt-0.5">{result.overview.period}</div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">依据：{result.overview.basis}</p>
                </section>
              )}

              {/* 二、分维诊断 */}
              {result.dimensions?.length ? (
                <section className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5">
                  <h3 className="text-base font-semibold text-slate-800 mb-3">二、分维诊断</h3>
                  <div className="space-y-3">
                    {result.dimensions.map((d, i) => (
                      <div key={i} className="rounded-xl border border-slate-100 p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-slate-700">{d.name}</span>
                          {d.insufficient && (
                            <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5">
                              数据不足
                            </span>
                          )}
                          {d.chartRef && (
                            <span className="text-[11px] text-brand-600 bg-brand-50 rounded-md px-1.5 py-0.5">
                              📊 见可视化
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600"><b className="text-slate-500">现状：</b>{d.status}</p>
                        <p className="text-sm text-slate-600"><b className="text-slate-500">差异：</b>{d.difference}</p>
                        <p className="text-sm text-slate-600"><b className="text-slate-500">可能成因：</b>{d.cause}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* 三、亮点 */}
              {result.highlights?.length ? (
                <section className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5">
                  <h3 className="text-base font-semibold text-slate-800 mb-3">三、亮点</h3>
                  <ul className="space-y-2">
                    {result.highlights.map((h, i) => (
                      <li key={i} className="text-sm text-slate-600 flex gap-2">
                        <span className="text-emerald-500 mt-0.5">★</span>
                        <span>
                          {h.item}
                          <span className="text-xs text-slate-400">（依据：{h.evidence}）</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* 四、问题 */}
              {result.problems?.length ? (
                <section className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5">
                  <h3 className="text-base font-semibold text-slate-800 mb-3">四、问题（按严重程度）</h3>
                  <div className="space-y-3">
                    {result.problems.map((p, i) => (
                      <div key={i} className="rounded-xl border border-slate-100 p-3">
                        <div className="flex items-start gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${sevClass(p.severity)}`}>
                            {p.severity}危
                          </span>
                          <span className="text-sm text-slate-700 font-medium">{p.description}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-2"><b>影响范围：</b>{p.impact}</p>
                        <p className="text-xs text-slate-500"><b>受影响对象：</b>{p.affected}</p>
                        <p className="text-xs text-slate-500"><b>判定依据：</b>{p.basis}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* 五、可操作建议 */}
              {result.suggestions?.length ? (
                <section className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-slate-800">五、可操作建议（落实进度）</h3>
                    <span className="text-xs text-slate-400">{suggestionsDone}/{suggestionsTotal} 已落实</span>
                  </div>
                  <div className="space-y-2">
                    {result.suggestions.map((s, i) => {
                      const done = selectedId ? checkedByMaterial[selectedId]?.[s.action] || false : false
                      const ref = s.problemRef != null ? `（对应问题 ${s.problemRef + 1}）` : ''
                      return (
                        <label
                          key={i}
                          className="flex items-start gap-2 text-sm text-slate-600 cursor-pointer select-none rounded-xl border border-slate-100 p-3"
                        >
                          <input
                            type="checkbox"
                            checked={done}
                            onChange={() => toggleMeasure(s.action)}
                            className="mt-0.5 accent-brand-500"
                          />
                          <span className={done ? 'line-through text-slate-400' : ''}>
                            <span className={`text-xs px-2 py-0.5 rounded-full mr-1 ${sevClass(s.priority)}`}>
                              {s.priority}先
                            </span>
                            {s.action} <span className="text-xs text-brand-500">{ref}</span>
                            <span className="block text-xs text-slate-400 mt-0.5">
                              执行角色：{s.role} ｜ 预期效果：{s.expected}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </section>
              ) : null}

              {/* 六、可视化 */}
              {result.charts?.length ? (
                <section className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5">
                  <h3 className="text-base font-semibold text-slate-800 mb-3">六、可视化</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {result.charts.map((c, i) => (
                      <ChartBlock key={i} chart={c} />
                    ))}
                  </div>
                </section>
              ) : null}

              {result.raw && (
                <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5">
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">原始返回</h4>
                  <pre className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3 whitespace-pre-wrap">
                    {result.raw}
                  </pre>
                </div>
              )}

              {/* 导出 / 分享 */}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={onExportHTML}
                  className="rounded-xl text-sm px-4 py-1.5 bg-brand-500 text-white hover:bg-brand-600"
                >
                  导出 HTML
                </button>
                <button
                  onClick={onExportText}
                  className="rounded-xl text-sm px-4 py-1.5 border border-brand-300 text-brand-600 hover:bg-brand-50"
                >
                  导出 TXT
                </button>
                <button
                  onClick={onShare}
                  className="rounded-xl text-sm px-4 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  分享给组长
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 从资料库选择资料弹窗 */}
      {picking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setPicking(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white shadow-xl p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">从资料库选择资料</h3>
              <button
                onClick={() => setPicking(false)}
                className="text-slate-400 hover:text-slate-600 text-sm px-2 py-1"
              >
                ✕
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-2">
              {subs === null ? (
                <div className="text-sm text-slate-400 text-center py-6">加载中…</div>
              ) : subs.length === 0 ? (
                <div className="text-center py-6 space-y-3">
                  <div className="text-sm text-slate-400">
                    {pickErr || '资料库暂无资料，请先上传。'}
                  </div>
                  {pickErr && (
                    <>
                      <div className="text-xs text-slate-400 leading-relaxed px-2">
                        原因：当前环境没有可访问的后端服务，<code className="px-1">/api/submissions</code> 接口不可用
                        （纯静态部署不含后端）。
                        <br />
                        解决：在本机执行 <code className="px-1">npm run dev:all</code> 同时启动前端与后端，
                        再访问 <code className="px-1">http://localhost:5173</code>；
                        若需线上使用，须将 Node 后端一并部署。
                      </div>
                      <button
                        onClick={openPicker}
                        className="rounded-xl text-sm px-4 py-1.5 bg-brand-500 text-white hover:bg-brand-600"
                      >
                        重试
                      </button>
                    </>
                  )}
                </div>
              ) : (
                subs.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => addFromResource(s)}
                    className="w-full text-left rounded-xl border border-slate-200 px-3 py-2.5 hover:border-brand-300 hover:bg-brand-50 transition"
                  >
                    <div className="text-sm text-slate-700 font-medium truncate">{s.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {s.course || '—'} · {s.class_name || '—'} · 提交人 {s.uploader || '—'}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
