// 教研组工作台 —— AI 转发服务（Express）
// 负责把前端 /api/analyze 的请求构造为 prompt，调用大模型，返回结构化 JSON。
// 模型配置（模型名 / API 地址 / API Key 等）集中在 server/aiConfig.js，从环境变量读取，不硬编码。
//   AI_API_KEY      必填，模型 API Key
//   AI_API_BASE     选填，API 基址（默认 https://open.bigmodel.cn/api/paas/v4）
//   AI_MODEL        选填，模型名（默认 glm-4.7-flash）
//   AI_TEMPERATURE  选填，采样温度，默认 0.3
//   AI_TIMEOUT_MS   选填，单次请求超时毫秒（默认 60000）
//   AI_MAX_RETRIES  选填，失败重试次数（默认 2）
//   PORT            选填，默认 3001
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import submitRouter from './server/submit.js'
import listRouter from './server/list.js'
import { AI_CONFIG, isAIConfigured } from './server/aiConfig.js'
import { callAIModel } from './server/aiModel.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 上传文件归档目录。云端部署时可设 TWB_UPLOADS_DIR 指向持久化磁盘挂载点，
// 未设置时回退到项目内 uploads/（本地行为不变）。
const UPLOADS_DIR = process.env.TWB_UPLOADS_DIR || path.join(__dirname, 'uploads')
fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const app = express()
// 资料提交：文件以 base64 传，需更高 body 上限；放在全局 1mb 解析之前以生效。
// 上限与 config/upload-types.json 的 maxFileMB 对齐：base64 膨胀约 4/3，取 1.4 倍留余量。
let MAX_FILE_MB = 500
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'upload-types.json'), 'utf8'))
  if (cfg.maxFileMB) MAX_FILE_MB = Number(cfg.maxFileMB)
} catch {
  // 配置缺失时回退默认 500MB
}
const SUBMIT_BODY_LIMIT = `${Math.ceil(MAX_FILE_MB * 1.4)}mb`
app.use('/api/submit', express.json({ limit: SUBMIT_BODY_LIMIT }), submitRouter)
app.use(express.json({ limit: '1mb' }))
// 归档文件可访问（按需，便于检索后下载）
app.use('/uploads', express.static(UPLOADS_DIR))

const PORT = process.env.PORT || 3001

// 启动前校验必需环境变量：缺少 AI_API_KEY 时输出明确错误并以非零状态码退出。
// 本地从 .env 读取，云端从平台环境变量读取；密钥绝不硬编码、绝不提交到代码库。
if (!isAIConfigured()) {
  console.error('')
  console.error('[teacher-workbench] 启动失败：缺少必需环境变量 AI_API_KEY。')
  console.error('[teacher-workbench] 请通过以下任一方式配置后再启动：')
  console.error('  · 本地：复制 .env.example 为 .env，填入 AI_API_KEY=你的密钥，再运行 npm run server')
  console.error('  · 云端（Render）：Render Dashboard → 你的 Web Service → Environment → 新增变量 AI_API_KEY')
  console.error('[teacher-workbench] 详见 README.md 的「部署」章节。')
  console.error('')
  process.exit(1)
}

// 服务端内置 Mock 兜底：当模型上游异常 / 超时 / 限流时返回确定性演示数据，
// 并打上 mock:true / source:'mock' 标记，前端据此显示「离线演示数据」提示。
function buildServerMock(payload) {
  const subject = payload?.subject || '学科'
  const grade = payload?.grade || '各年级'
  const title = payload?.title || '未命名资料'
  let seed = 0
  const base = `${title}|${subject}|${grade}`
  for (let i = 0; i < base.length; i++) seed = (seed * 31 + base.charCodeAt(i)) | 0
  seed = Math.abs(seed)
  const r1 = (n) => Math.round(n * 10) / 10
  const partRate = r1(78 + (seed % 16))
  return {
    overview: {
      conclusion: `本次围绕《${title}》的教研分析显示，${subject}学科整体教研质量处于中上水平，综合得分约 ${r1(
        80 + (seed % 14),
      )} 分。最值得关注的是高阶思维活动占比偏低。`,
      object: `${subject}学科 · ${grade} · 《${title}》及相关资料`,
      scope: '数据来源于本次提交的教学设计、课件与听评课记录，样本量较小。',
      period: '时间口径为本次教研活动周期，未含跨学期纵向数据。',
      basis: '依据提交资料文本特征与常见教研指标经验值推算，仅供示范性参考。',
    },
    dimensions: [
      {
        name: '知识点掌握',
        status: `概念理解与运算求解得分率较高（约 ${r1(82 + (seed % 6))}%），实际应用与综合探究偏弱（约 ${r1(
          61 + (seed % 9),
        )}%）。`,
        difference: '高阶知识点与基础知识点差距约 20 个百分点。',
        cause: '课堂较多采用讲练结合，缺少真实情境任务与开放性探究环节。',
        chartRef: 'knowledge',
      },
      {
        name: '班级 / 群体差异',
        status: `不同班级之间${subject}表现存在差异，差异主要出现在综合探究维度。`,
        difference: '领先班级与应用率较高班级相差约 8–12 个百分点。',
        cause: '学情分层教学尚未常态化，资源投放不够均衡。',
        chartRef: 'class_cmp',
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
        basis: '知识点得分率显示应用/探究维度明显落后于基础维度。',
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
    charts: [
      {
        type: 'comparison',
        id: 'knowledge',
        title: '各知识点得分率对比',
        unit: '得分率 / %',
        interpretation: '实际应用与综合探究两项明显低于概念与运算，是后续突破重点。',
        labels: ['概念理解', '运算求解', '实际应用', '综合探究'],
        series: [
          { name: '本次', values: [r1(86 + (seed % 6)), r1(81 + (seed % 7)), r1(68 + (seed % 8)), r1(61 + (seed % 9))] },
          { name: '年级均值', values: [84, 80, 72, 66] },
        ],
      },
      {
        type: 'comparison',
        id: 'class_cmp',
        title: '各班综合探究得分对比',
        unit: '得分率 / %',
        interpretation: '班级间存在差异，领先班级与滞后班级约相差 10 个百分点。',
        labels: ['一班', '二班', '三班', '四班'],
        series: [{ name: '综合探究', values: [r1(68 + (seed % 6)), r1(62 + (seed % 8)), r1(58 + (seed % 7)), r1(55 + (seed % 6))] }],
      },
      {
        type: 'line',
        id: 'trend',
        title: '近五次教研参与率趋势',
        unit: '参与率 / %',
        interpretation: '本学期教研参与率整体上行，第 4 次因期中略降，第 5 次回升。',
        labels: ['第1次', '第2次', '第3次', '第4次', '第5次'],
        series: [{ name: '参与率', values: [r1(78 + (seed % 4)), 82.5, 85.0, r1(82 + (seed % 4)), r1(87 + (seed % 5))] }],
      },
    ],
    mock: true,
    source: 'mock',
  }
}

app.post('/api/analyze', async (req, res) => {
  const payload = req.body || {}

  // 未配置密钥：返回 Mock 演示数据（而非报错），并标记来源，保证安全回退。
  if (!isAIConfigured()) {
    console.warn('[teacher-workbench] 未配置 AI_API_KEY，降级至 Mock 演示数据')
    return res.json(buildServerMock(payload))
  }

  try {
    console.log(`[teacher-workbench] 调用模型 ${AI_CONFIG.model} ...`)
    const result = await callAIModel(payload)
    console.log(`[teacher-workbench] 模型 ${AI_CONFIG.model} 返回成功`)
    return res.json(result)
  } catch (err) {
    const code = err?.code || 'unknown'
    const msg = err?.message || String(err)
    // 鉴权失败 / 限流 / 参数错误 / 返回为空等可识别错误：返回明确错误信息（仍走 JSON，前端可展示）
    if (code === 'auth_failed' || code === 'rate_limited' || code === 'bad_request' || code === 'empty_response') {
      console.error(`[teacher-workbench] 模型调用失败（${code}）：`, msg)
      return res.status(200).json({ ...buildServerMock(payload), error: { code, message: msg } })
    }
    // 超时 / 网络 / 5xx：降级至 Mock，并附带错误标记
    console.error(`[teacher-workbench] 模型调用异常（${code}），降级至 Mock：`, msg)
    return res.json({ ...buildServerMock(payload), error: { code, message: msg } })
  }
})

function healthHandler(_req, res) {
  res.json({
    ok: true,
    model: AI_CONFIG.model,
    modelBase: AI_CONFIG.apiBase,
    configured: isAIConfigured(),
  })
}
app.get('/health', healthHandler)
// 兼容旧路径（早期版本使用 /api/health）
app.get('/api/health', healthHandler)

// 资料检索路由
app.use('/api/submissions', listRouter)

// 生产环境：托管已构建的前端（npm run build 后）
const distDir = path.join(__dirname, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

// 统一错误处理：body 超限 / JSON 解析失败时返回可机读的 JSON 错误，避免前端「静默失败」（HTML/500）
app.use((err, _req, res, next) => {
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({
      code: 41301,
      message: '请求体超过服务端限制（单文件过大）。请调大网关/服务端 body 上限，或改用分片上传。',
      data: { error: 'payload_too_large' },
    })
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 40007, message: '请求体格式错误（JSON 解析失败）', data: { error: 'bad_json' } })
  }
  return next(err)
})

const server = app.listen(PORT, () => {
  console.log(`[teacher-workbench] AI server listening on http://localhost:${PORT}`)
  console.log(`[teacher-workbench] model=${AI_CONFIG.model} base=${AI_CONFIG.apiBase} timeout=${AI_CONFIG.timeoutMs}ms retries=${AI_CONFIG.maxRetries} key=${AI_CONFIG.apiKey ? '已配置' : '未配置'}`)
})
// 大文件上传：放宽「接收完整请求」的超时（Node 默认 5 分钟），避免长传输被服务端中断
server.requestTimeout = 0
