// 资料提交接收 + 自动归档（POST /api/submit）
// 支持两种来源：
//   1) 本地文件：JSON + base64（content 字段）
//   2) 线上链接：source='url' + url 字段，由后端拉取、校验、去重、归档
// 两种来源共用同一套类型白名单 / 大小上限 / 哈希去重 / 归档逻辑。
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { insertSubmission, findByHash } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
// 上传文件归档目录：可用 TWB_UPLOADS_DIR 环境变量指向持久磁盘（云端部署挂载卷时使用）
const UPLOADS_DIR = path.join(ROOT, process.env.TWB_UPLOADS_DIR || 'uploads')

const router = express.Router()

// 文件类型白名单：单一配置源 config/upload-types.json（扩展名 + MIME 映射 + 展示名）。
const uploadTypesConfig = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'config', 'upload-types.json'), 'utf8'),
)
const STRICT_MIME = uploadTypesConfig.strictMime === true
// 传输上限（MB）：优先 env.MAX_FILE_MB，其次配置 maxFileMB，最后回退 500。业务层不设大小上限。
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB) || Number(uploadTypesConfig.maxFileMB) || 500

const ALLOWED_ROLES = ['teacher', 'leader', 'admin', 'principal']
const TYPE_WHITELIST = ['教案', '课件', '试卷', '视频', '文档', '教研纪要', '听评课记录', '其他']

// 扩展名 -> MIME 列表（仅启用项）；同时构建 MIME -> 扩展名 反查（链接无扩展名时推断类型）
const extToMimes = new Map()
const mimeToExt = new Map()
for (const t of uploadTypesConfig.types || []) {
  if (t && t.enabled !== false && t.ext) {
    const ext = String(t.ext).toLowerCase()
    extToMimes.set(ext, t.mimes || [])
    for (const m of t.mimes || []) {
      if (!mimeToExt.has(m)) mimeToExt.set(m, ext)
    }
  }
}

const MAX_URL_LEN = 2048
const URL_TIMEOUT_MS = Number(process.env.URL_FETCH_TIMEOUT_MS) || 20000
const MAX_REDIRECTS = 5

function sanitizeName(name) {
  return (
    name
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'file'
  )
}
function ym(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}
function resp(res, code, message, data) {
  res.json({ code, message, data: data ?? null })
}

// 链接格式校验（服务端二次校验，与前端同规则：协议 / 域名 / 必填 / 去空格 / 长度）
function validateUrl(raw) {
  const u = String(raw == null ? '' : raw).trim()
  if (!u) throw { code: 'bad_url', error: 'bad_url', detail: 'empty' }
  if (u.length > MAX_URL_LEN) throw { code: 'bad_url', error: 'bad_url', detail: 'too_long' }
  let parsed
  try {
    parsed = new URL(u)
  } catch {
    throw { code: 'bad_url', error: 'bad_url', detail: 'invalid' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw { code: 'bad_url', error: 'bad_url', detail: 'protocol' }
  }
  if (!parsed.hostname) throw { code: 'bad_url', error: 'bad_url', detail: 'no_host' }
  return parsed.toString()
}

// 从 Content-Disposition 或 URL 路径提取文件名
function filenameFromUrl(urlStr, contentDisposition) {
  if (contentDisposition) {
    const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i.exec(contentDisposition)
    if (star?.[1]) {
      try {
        return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
      } catch {
        /* ignore */
      }
    }
    const plain = /filename\s*=\s*"([^"]+)"/i.exec(contentDisposition)
    if (plain?.[1]) return plain[1].trim()
  }
  const u = new URL(urlStr)
  const base = path.basename(decodeURIComponent(u.pathname))
  return base || 'file'
}

// 推断扩展名：优先文件名后缀；无后缀时用 MIME 反查
function extFrom(filename, mime) {
  const f = String(filename || '').toLowerCase()
  const e = f.split('.').pop() || ''
  if (e && e !== f) return e
  return mimeToExt.get((mime || '').split(';')[0].trim().toLowerCase()) || ''
}

// 拉取线上资源：手动重定向（限制次数）、超时、Content-Length 提前判超限
async function fetchRemote(urlStr) {
  let current = urlStr
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), URL_TIMEOUT_MS)
    let res
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'teacher-workbench/1.0', accept: '*/*' },
      })
    } catch (err) {
      clearTimeout(timer)
      if (err?.name === 'AbortError') throw { code: 'url_timeout', error: 'url_timeout' }
      throw {
        code: 'url_unreachable',
        error: 'url_unreachable',
        detail: String(err?.cause?.code || err?.code || err?.message || 'connection_failed'),
      }
    }
    clearTimeout(timer)

    // 处理重定向
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      await res.arrayBuffer().catch(() => {}) // 释放重定向响应体
      if (!loc) throw { code: 'url_redirect', error: 'url_redirect', detail: 'no_location' }
      let next
      try {
        next = new URL(loc, current).toString()
      } catch {
        throw { code: 'url_redirect', error: 'url_redirect', detail: 'bad_location' }
      }
      if (next.startsWith('http://') || next.startsWith('https://')) {
        current = next
        continue
      }
      throw { code: 'url_redirect', error: 'url_redirect', detail: 'unsupported_scheme' }
    }

    // 状态码判断
    if (!res.ok) {
      await res.arrayBuffer().catch(() => {})
      if (res.status === 404) throw { code: 'url_not_found', error: 'url_not_found' }
      if (res.status === 401 || res.status === 403) {
        throw { code: 'url_forbidden', error: 'url_forbidden', detail: String(res.status) }
      }
      throw { code: 'url_unreachable', error: 'url_unreachable', detail: `HTTP ${res.status}` }
    }

    // Content-Length 提前判超限（不下载大文件）
    const lenHeader = res.headers.get('content-length')
    const maxBytes = MAX_FILE_MB * 1024 * 1024
    if (lenHeader && Number(lenHeader) > maxBytes) {
      await res.arrayBuffer().catch(() => {})
      throw { code: 'too_large', error: 'too_large', size: Number(lenHeader) }
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > maxBytes) throw { code: 'too_large', error: 'too_large', size: buf.length }

    const mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    return {
      buf,
      mime,
      filename: filenameFromUrl(urlStr, res.headers.get('content-disposition')),
      redirected: hop > 0,
    }
  }
  throw { code: 'url_redirect', error: 'url_redirect', detail: 'too_many_redirects' }
}

// 拉取错误 → 可机读响应
function handleFetchError(res, e) {
  switch (e.code) {
    case 'url_not_found':
      return resp(res, 40009, '链接资源不存在（404），请检查链接是否失效', { error: 'url_not_found' })
    case 'url_forbidden':
      return resp(res, 40010, `链接需要鉴权或无权访问（HTTP ${e.detail}）`, {
        error: 'url_forbidden',
        detail: e.detail,
      })
    case 'url_timeout':
      return resp(res, 40012, '链接访问超时，请稍后重试', { error: 'url_timeout' })
    case 'url_redirect':
      return resp(res, 40011, `链接重定向失败（${e.detail}）`, {
        error: 'url_redirect',
        detail: e.detail,
      })
    case 'too_large':
      return resp(res, 40004, `链接指向的文件超过大小限制（单文件 ≤ ${MAX_FILE_MB}MB）`, {
        error: 'too_large',
        size: e.size,
      })
    default:
      return resp(res, 40008, `链接无法访问（${e.detail || '未知错误'}），请确认链接可公开访问`, {
        error: 'url_unreachable',
        detail: e.detail,
      })
  }
}

router.post('/', async (req, res) => {
  const b = req.body || {}
  const { name, type, tags, role, class_name, course, student_name, uploader, source } = b

  // 0. 角色权限校验
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return resp(res, 40301, '无上传权限：仅老师 / 教研组长 / 管理员 / 教研校长可提交资料', { error: 'forbidden' })
  }

  // 1. 必填校验
  if (!name || !type) {
    return resp(res, 40001, '缺少必填字段（name/type）', { error: 'missing_required' })
  }
  // 2. 资料类型白名单
  if (!TYPE_WHITELIST.includes(type)) {
    return resp(res, 40003, `资料类型不被允许（可选：${TYPE_WHITELIST.join('、')}）`, {
      error: 'bad_type',
    })
  }

  // 3. 取文件内容（buf）+ 文件名 + MIME（按来源分支）
  let buf
  let filename
  let mime
  if (source === 'url') {
    let url
    try {
      url = validateUrl(b.url)
    } catch (e) {
      return resp(res, 40005, `链接格式不合法（${e.detail}）`, { error: 'bad_url', detail: e.detail })
    }
    try {
      const r = await fetchRemote(url)
      buf = r.buf
      mime = r.mime
      filename = r.filename
    } catch (e) {
      return handleFetchError(res, e)
    }
  } else {
    filename = b.filename
    mime = b.mime
    if (!filename || !mime || !b.content) {
      return resp(res, 40001, '缺少必填字段（filename/mime/content）', { error: 'missing_required' })
    }
    try {
      const raw = String(b.content).includes(',') ? String(b.content).split(',')[1] : String(b.content)
      buf = Buffer.from(raw, 'base64')
      if (!buf.length) throw new Error('empty')
    } catch {
      return resp(res, 40003, '文件内容不是合法 base64', { error: 'bad_base64' })
    }
  }

  // 4. 大小限制
  const MAX = MAX_FILE_MB * 1024 * 1024
  if (buf.length > MAX) {
    return resp(res, 40004, `文件超过大小限制（单文件 ≤ ${MAX_FILE_MB}MB）`, {
      error: 'too_large',
      size: buf.length,
    })
  }

  // 5. 扩展名白名单（扩展名为主门；MIME 仅 strictMime 时校验）
  const ext = extFrom(filename, mime)
  const allowedMimes = extToMimes.get(ext)
  if (!allowedMimes) {
    if (source === 'url' && !ext) {
      return resp(res, 40003, '无法从链接识别文件类型（请确认链接直接指向具体文件，而非网页）', {
        error: 'bad_file_type',
        ext: '',
      })
    }
    return resp(res, 40003, '文件类型不被允许（扩展名不在白名单或已禁用）', {
      error: 'bad_file_type',
      ext,
    })
  }
  if (STRICT_MIME && !allowedMimes.includes(mime)) {
    return resp(res, 40006, '文件 MIME 与扩展名不匹配', { error: 'bad_mime', ext, mime })
  }

  // 6. 哈希 + 幂等去重
  const hash = crypto.createHash('sha256').update(buf).digest('hex')
  const existed = findByHash(type, hash, uploader || '')
  if (existed) {
    return resp(res, 0, '该资料已提交过，已为你定位原记录', {
      id: existed.id,
      duplicated: true,
    })
  }

  // 7. 归档落盘
  try {
    const safe = sanitizeName(filename)
    const dir = path.join(UPLOADS_DIR, type, ym(new Date()))
    fs.mkdirSync(dir, { recursive: true })
    const storedName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safe}`
    const storedPath = path.join(dir, storedName)
    fs.writeFileSync(storedPath, buf)

    const id = `s_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
    insertSubmission({
      id,
      name,
      type,
      orig_name: filename,
      stored_path: path.relative(ROOT, storedPath).split(path.sep).join('/'),
      hash,
      size: buf.length,
      mime,
      ip: req.ip || req.headers['x-forwarded-for'] || '',
      ua: req.headers['user-agent'] || '',
      tags: tags || '',
      class_name: class_name || '',
      course: course || '',
      student_name: student_name || '',
      role: role || '',
      uploader: uploader || '',
      created_at: new Date().toISOString(),
      status: 'received',
    })
    return resp(res, 0, '提交成功', { id, duplicated: false, size: buf.length, filename })
  } catch (err) {
    console.error('[teacher-workbench] 资料归档失败：', String(err))
    return resp(res, 500, '服务器归档失败，请稍后重试', { error: 'archive_failed' })
  }
})

export default router
