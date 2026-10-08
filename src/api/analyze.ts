// 资料分析：结果类型定义、Mock 兜底生成、调用 /api/analyze。
// 分析结果采用「六段式结构化」：概览 / 分维诊断 / 亮点 / 问题 / 可操作建议 / 可视化。

export type AnalysisPayload = {
  title?: string
  subject?: string
  grade?: string
  content?: string
  materials?: string
}

// ---------- 六段式结构化类型 ----------

// 概览：核心结论 + 分析对象 / 数据范围 / 时间口径 + 依据
export type Overview = {
  conclusion: string // 3–5 句话的核心结论
  object: string // 分析对象
  scope: string // 数据范围
  period: string // 时间口径
  basis: string // 依据
}

// 分维诊断：逐维度拆解
export type DimensionDiag = {
  name: string // 维度名（如 知识点、题型、难度、班级/群体、时间趋势）
  status: string // 现状
  difference: string // 差异（组间/目标差距）
  cause: string // 可能成因
  chartRef?: string // 关联可视化图表 id
  insufficient?: boolean // 指标数据不足/缺失时标注
}

// 亮点：突出数据项 + 支撑数据
export type Highlight = {
  item: string // 亮点描述
  evidence: string // 支撑数据
}

// 问题：按严重程度排序
export type Severity = '高' | '中' | '低'
export type Problem = {
  severity: Severity // 严重程度
  description: string // 问题描述
  impact: string // 影响范围
  affected: string // 受影响对象
  basis: string // 判定依据
}

// 可操作建议：每条对应一个问题
export type Suggestion = {
  action: string // 具体动作
  priority: Severity // 优先级
  role: string // 建议执行角色
  expected: string // 预期效果
  problemRef?: number // 对应问题序号（0-based）
}

// 可视化图表规范
export type ChartSeries = { name: string; values: number[] }
export type AxisChart = {
  type: 'bar' | 'line' | 'comparison' // 分布/趋势/对比条形
  id: string
  title: string
  unit: string
  interpretation: string // 一句话解读
  labels: string[]
  series: ChartSeries[]
}
export type HeatmapChart = {
  type: 'heatmap'
  id: string
  title: string
  unit: string
  interpretation: string
  rows: string[]
  cols: string[]
  matrix: number[][]
}
export type ChartSpec = AxisChart | HeatmapChart

export type AnalysisResult = {
  overview?: Overview
  dimensions?: DimensionDiag[]
  highlights?: Highlight[]
  problems?: Problem[]
  suggestions?: Suggestion[]
  charts?: ChartSpec[]
  raw?: string
  mock?: boolean
  source?: 'ai' | 'mock'
  model?: string
  error?: { code: string; message: string }
  // 兼容旧结构（极少数旧缓存）
  metrics?: { label: string; value: string | number }[]
}

// 分析调用失败时的结构化错误：携带 code 便于前端区分「超时 / 网络错误 / 空结果 / 服务异常」。
export class AnalyzeError extends Error {
  code: 'timeout' | 'network' | 'empty' | 'service'
  constructor(code: AnalyzeError['code'], message: string) {
    super(message)
    this.name = 'AnalyzeError'
    this.code = code
  }
}

// 判断后端返回是否为「空结果」（无任何有效板块）。
export function isEmptyResult(r: AnalysisResult): boolean {
  if (!r || typeof r !== 'object') return true
  return (
    !r.overview &&
    !(r.dimensions && r.dimensions.length) &&
    !(r.highlights && r.highlights.length) &&
    !(r.problems && r.problems.length) &&
    !(r.suggestions && r.suggestions.length) &&
    !(r.charts && r.charts.length)
  )
}

// 把旧结构（字符串数组）或残缺结果归一化为六段式，保证前端渲染不崩。
export function normalizeResult(r: any): AnalysisResult {
  if (!r || typeof r !== 'object') return r
  const out: AnalysisResult = { ...r }
  if (Array.isArray(r.problems) && typeof r.problems[0] === 'string') {
    out.problems = (r.problems as string[]).map((d) => ({
      severity: '中' as Severity,
      description: d,
      impact: '—',
      affected: '—',
      basis: '—',
    }))
  }
  if (Array.isArray(r.suggestions) && typeof r.suggestions[0] === 'string') {
    out.suggestions = (r.suggestions as string[]).map((action, i) => ({
      action,
      priority: '中' as Severity,
      role: '教研组长',
      expected: '—',
      problemRef: i,
    }))
  }
  if (Array.isArray(r.highlights) && typeof r.highlights[0] === 'string') {
    out.highlights = (r.highlights as string[]).map((item) => ({ item, evidence: '—' }))
  }
  return out
}

// 内置 Mock 分析器：在「双击单文件版（file://）」无后端时兜底，保证演示闭环完整。
// 数据根据资料字段做确定性伪随机，结果稳定、可复现；并给出六段式结构（含图表）。
export function buildMockResult(payload: AnalysisPayload): AnalysisResult {
  const title = payload.title || '未命名资料'
  const subject = payload.subject || '学科'
  const grade = payload.grade || '各年级'
  let seed = 0
  const base = `${title}|${subject}|${grade}`
  for (let i = 0; i < base.length; i++) seed = (seed * 31 + base.charCodeAt(i)) | 0
  seed = Math.abs(seed)
  const r = (n: number) => Math.round(n * 10) / 10 // 保留一位小数
  const partRate = r(78 + (seed % 16)) // 78–93.x
  const inquiryRate = r(52 + (seed % 22)) // 52–73.x

  // 两个维度图表：知识点得分率（对比条形）+ 教研参与度趋势（折线）
  const charts: ChartSpec[] = [
    {
      type: 'comparison',
      id: 'knowledge',
      title: '各知识点得分率对比',
      unit: '得分率 / %',
      interpretation: '实际应用与综合探究两项明显低于概念与运算，是后续突破重点。',
      labels: ['概念理解', '运算求解', '实际应用', '综合探究'],
      series: [
        { name: '本次', values: [r(86 + (seed % 6)), r(81 + (seed % 7)), r(68 + (seed % 8)), r(61 + (seed % 9))] },
        { name: '年级均值', values: [84, 80, 72, 66] },
      ],
    },
    {
      type: 'line',
      id: 'trend',
      title: '近五次教研参与率趋势',
      unit: '参与率 / %',
      interpretation: '本学期教研参与率整体上行，第 4 次因期中略降，第 5 次回升。',
      labels: ['第1次', '第2次', '第3次', '第4次', '第5次'],
      series: [{ name: '参与率', values: [r(78 + (seed % 4)), 82.5, 85.0, r(82 + (seed % 4)), r(87 + (seed % 5))] }],
    },
  ]

  return {
    overview: {
      conclusion: `本次围绕《${title}》的教研分析显示，${subject}学科整体教研质量处于中上水平，综合得分约 ${r(
        80 + (seed % 14),
      )} 分。`,
      object: `${subject}学科 · ${grade} · 《${title}》及相关 ${1 + (seed % 3)} 份资料`,
      scope: '数据来源于本次提交的教学设计、课件与听评课记录，样本量较小。',
      period: '时间口径为本次教研活动周期（约一个教学单元），未含跨学期纵向数据。',
      basis: '依据提交资料文本特征与常见教研指标经验值推算，仅供示范性参考。',
    },
    dimensions: [
      {
        name: '知识点掌握',
        status: `四个知识点中，概念理解与运算求解得分率较高（约 ${r(
          82 + (seed % 6),
        )}%），实际应用与综合探究偏弱（约 ${r(61 + (seed % 9))}%）。`,
        difference: '高阶知识点（应用、探究）与基础知识点差距约 20 个百分点。',
        cause: '课堂较多采用讲练结合，缺少真实情境任务与开放性探究环节。',
        chartRef: 'knowledge',
      },
      {
        name: '题型与活动',
        status: `常规练习完成度好，探究性、合作类活动占比约 ${inquiryRate}%。`,
        difference: '学生被动接受多于主动建构，课堂互动集中在少数学生。',
        cause: '任务设计偏封闭，缺少分层与小组协作机制。',
      },
      {
        name: '班级 / 群体差异',
        status: `不同班级之间${subject}表现存在差异，差异主要出现在综合探究维度。`,
        difference: '实验班与应用率较高的班级领先约 8–12 个百分点。',
        cause: '学情分层教学尚未常态化，资源投放不够均衡。',
      },
      {
        name: '时间趋势',
        status: `教研参与率本学期整体呈上升趋势，当前约 ${partRate}%。`,
        difference: '第 4 次因期中事务小幅回落，第 5 次回升。',
        cause: '管理机制与激励机制见效，但持续性仍需巩固。',
        chartRef: 'trend',
      },
    ],
    highlights: [
      { item: `${subject}组教研氛围活跃，集体备课流程规范、记录完整。`, evidence: `参与率约 ${partRate}%，近五次上升趋势明显。` },
      { item: '形成了以课例为载体的研讨机制，听评课反馈及时。', evidence: '听评课记录完整度较高，改进闭环初步形成。' },
      { item: '数字化资源积累初具规模，校本资源使用率稳步提升。', evidence: '资源库新增条目持续增长，复用率提高。' },
    ],
    problems: [
      {
        severity: '高',
        description: '高阶思维活动（应用、探究）占比偏低，学生深度学习不足。',
        impact: '影响核心素养落地与学业质量提升。',
        affected: `全体${subject}学生，尤其是中后段学生。`,
        basis: '知识点得分率显示应用/探究维度明显落后于基础维度（差距约 20 个百分点）。',
      },
      {
        severity: '中',
        description: '改进措施落地跟踪不够闭环，缺少阶段性成效证据。',
        impact: '教研成果难以沉淀与复制。',
        affected: '教研组整体。',
        basis: '缺少措施台账与验收记录，前序问题反复出现。',
      },
      {
        severity: '低',
        description: '跨班级教学数据尚未打通，难以做纵向对比。',
        impact: '分层教学决策依据不足。',
        affected: '各班教师。',
        basis: '数据分散在个体，未形成统一视图。',
      },
    ],
    suggestions: [
      {
        action: `围绕《${title}》设计 2–3 个真实情境探究任务，提升应用与综合探究占比。`,
        priority: '高',
        role: '任课教师 + 教研组长',
        expected: '应用/探究维度得分率提升 8–10 个百分点。',
        problemRef: 0,
      },
      {
        action: '建立改进措施台账：明确责任人、截止时间与验收方式，每月复盘。',
        priority: '中',
        role: '教研组长',
        expected: '措施闭环率提升至 90% 以上。',
        problemRef: 1,
      },
      {
        action: '搭建班级数据看板，按月汇总并做纵向对比，支撑分层教学。',
        priority: '低',
        role: '教研组长 + 信息员',
        expected: '形成可复用的数据视图，决策更精准。',
        problemRef: 2,
      },
    ],
    charts,
    mock: true,
    source: 'mock',
  }
}

// 调用 /api/analyze：自带 AbortController 超时（默认 200s，覆盖后端最坏 60s×3 的重试耗时），
// 按场景区分抛出 AnalyzeError（超时 / 网络错误 / 空结果 / 服务异常），由调用方捕获后
// 把列表项状态恢复为 pending 并展示差异化提示。
// 若以 file:// 直接双击打开（单文件版，无后端），则使用内置 Mock 分析器兜底。
export async function runAnalysis(
  payload: AnalysisPayload,
  timeoutMs = 200_000,
): Promise<AnalysisResult> {
  // 单文件版（file:// 双击打开）无后端，直接走 Mock 分析器
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    await new Promise((r) => setTimeout(r, 600))
    return buildMockResult(payload)
  }

  // 本地开发（localhost）后端不可达 → 明确报「网络错误」；远程静态部署无后端 → 离线演示兜底。
  const isLocalhost =
    typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok) {
      let detail = ''
      try {
        const j = await res.json()
        detail = j?.error?.message || ''
      } catch {
        /* 响应体非 JSON，忽略 */
      }
      throw new AnalyzeError(
        'service',
        `分析服务返回错误（${res.status}）${detail ? '：' + detail : ''}，请稍后点击「重试」。`,
      )
    }
    let data: AnalysisResult
    try {
      data = (await res.json()) as AnalysisResult
    } catch {
      throw new AnalyzeError('service', '分析服务返回的数据无法解析，请稍后点击「重试」。')
    }
    if (isEmptyResult(data)) {
      throw new AnalyzeError(
        'empty',
        '分析结果为空：模型未返回有效内容。请检查所选资料内容是否完整，或稍后点击「重试」。',
      )
    }
    if (data.error) {
      throw new AnalyzeError('service', `模型调用异常（${data.error.code}）：${data.error.message}`)
    }
    if (data.source !== 'ai') {
      console.warn(`[analyze] 接口返回非真实分析（来源：${data.source || 'unknown'}）`)
    } else {
      console.log(`[analyze] 真实模型返回（来源：ai${data.model ? ' / ' + data.model : ''}）`)
    }
    return normalizeResult(data)
  } catch (err) {
    if (err instanceof AnalyzeError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AnalyzeError(
        'timeout',
        '分析请求超时（服务端处理较慢）。请稍后点击「重试」再次尝试，或检查网络与后端状态。',
      )
    }
    // 网络层失败：本地开发后端未启动 → 明确报网络错误；远程静态部署 → 离线演示兜底。
    if (isLocalhost) {
      throw new AnalyzeError(
        'network',
        '无法连接到 AI 分析服务（网络错误）。请确认本地后端已启动：运行 npm run dev:all，再点击「重试」。',
      )
    }
    console.warn('[analyze] 远程静态部署无后端，回退演示数据：', err)
    await new Promise((r) => setTimeout(r, 400))
    return { ...buildMockResult(payload), source: 'mock', mock: true }
  } finally {
    clearTimeout(timer)
  }
}
