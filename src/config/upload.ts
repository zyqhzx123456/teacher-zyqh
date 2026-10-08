// 上传类型白名单（单一配置源）：读取 config/upload-types.json，供前端做即时拦截与动态 accept。
// 增删 / 禁用格式只需修改 config/upload-types.json，业务代码不硬编码扩展名 / MIME 判断。
import raw from '../../config/upload-types.json'

export interface UploadTypeDef {
  ext: string
  label: string
  group: string
  mimes: string[]
  enabled: boolean
}

interface UploadTypesConfig {
  strictMime: boolean
  maxFileMB: number
  types: UploadTypeDef[]
}

const cfg = raw as unknown as UploadTypesConfig

export const strictMime = cfg.strictMime === true
// 传输上限（MB）：业务层不设大小上限，此值仅用于前端即时提示 + 服务端 body 限制对齐
export const maxFileMB = Number(cfg.maxFileMB) || 500

// 启用中的类型列表
export const uploadTypes: UploadTypeDef[] = (cfg.types || []).filter((t) => t && t.enabled !== false)

const byExt = new Map<string, UploadTypeDef>()
for (const t of uploadTypes) byExt.set(t.ext.toLowerCase(), t)

export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function typeDefOf(ext: string): UploadTypeDef | undefined {
  return byExt.get(ext.toLowerCase())
}

export function isEnabledExt(ext: string): boolean {
  return byExt.has(ext.toLowerCase())
}

// 生成 <input accept> 属性（如 ".pdf,.doc,.docx,..."）
export function acceptAttr(): string {
  return uploadTypes.map((t) => `.${t.ext}`).join(',')
}

// 生成「支持 XXX、XXX」提示（按展示名去重）
export function supportedLabels(): string {
  const labels: string[] = []
  for (const t of uploadTypes) if (!labels.includes(t.label)) labels.push(t.label)
  return labels.join('、')
}

export function labelOf(ext: string): string {
  return typeDefOf(ext)?.label || ext.toUpperCase()
}

export function formatSize(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n >= 100 ? Math.round(n) : n.toFixed(1)} ${units[i]}`
}

// 链接上传的格式校验（协议 / 域名 / 必填 / 去空格 / 长度）
export const MAX_URL_LEN = 2048

export type ValidateUrlResult =
  | { ok: true; url: string }
  | { ok: false; code: 'URL_REQUIRED' | 'URL_INVALID' | 'URL_PROTOCOL' | 'URL_TOO_LONG'; msg: string }

export function validateUrl(raw: string): ValidateUrlResult {
  const u = (raw || '').trim()
  if (!u) return { ok: false, code: 'URL_REQUIRED', msg: '请输入资源链接' }
  if (u.length > MAX_URL_LEN) return { ok: false, code: 'URL_TOO_LONG', msg: `链接过长（超过 ${MAX_URL_LEN} 字符）` }
  let parsed: URL
  try {
    parsed = new URL(u)
  } catch {
    return { ok: false, code: 'URL_INVALID', msg: '链接格式不合法' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, code: 'URL_PROTOCOL', msg: '仅支持 http / https 链接' }
  }
  if (!parsed.hostname) return { ok: false, code: 'URL_INVALID', msg: '链接缺少有效域名' }
  return { ok: true, url: u }
}

// 从链接提取文件名（仅用于入队时的临时显示；真实文件名以后端解析为准）
export function basenameOfUrl(url: string): string {
  try {
    const u = new URL(url)
    const base = u.pathname.split('/').filter(Boolean).pop() || ''
    return decodeURIComponent(base) || '未命名资源'
  } catch {
    return '未命名资源'
  }
}

export type ValidateResult =
  | { ok: true }
  | { ok: false; code: 'EXT_NOT_ALLOWED' | 'FILE_TOO_LARGE' | 'EMPTY_FILE'; msg: string }

// 选择 / 拖拽阶段的即时校验（与服务端规则同源）
export function validateFile(file: File): ValidateResult {
  const ext = extOf(file.name)
  if (!ext || !isEnabledExt(ext)) {
    return {
      ok: false,
      code: 'EXT_NOT_ALLOWED',
      msg: `不支持的文件类型（支持 ${supportedLabels()}）`,
    }
  }
  if (!file.size) {
    return { ok: false, code: 'EMPTY_FILE', msg: '文件为空' }
  }
  if (file.size > maxFileMB * 1024 * 1024) {
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      msg: `文件超过传输上限 ${maxFileMB}MB（实际 ${formatSize(file.size)}）`,
    }
  }
  return { ok: true }
}
