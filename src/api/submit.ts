// 资料提交 / 列表 / 下载 / 删除 封装
// 失败时返回结构化错误（code<0 表示网络层不可达），供页面写横幅。
//
// 数据源：只要配置了 Supabase 即走云端（免登录、匿名访问，所有访客共享同一份数据）；
// 未配置 Supabase 时回退到原有的本地后端 / 浏览器本地模式，行为与改造前一致。
import {
  supabase,
  isSupabaseConfigured,
  SUBMISSIONS_BUCKET,
  SIGNED_URL_TTL,
} from '../lib/supabase'

/** 免费层单文件上限（50MB），超出时给出明确提示而非让上传莫名失败 */
const FREE_TIER_FILE_LIMIT = 50 * 1024 * 1024

export interface SubmitResult {
  code: number
  message: string
  data: { id?: string; duplicated?: boolean; size?: number; filename?: string } | null
}

export interface SubmissionRow {
  id: string
  name: string
  type: string
  orig_name: string
  size: number
  mime: string
  tags: string
  class_name: string
  course: string
  student_name: string
  role: string
  uploader: string
  created_at: string
  status: string
  fileMissing?: boolean
  local?: boolean
  source?: 'file' | 'url'
  url?: string
  /** 云端模式下的文件访问链接（Storage 签名链接，用于在线预览与下载） */
  fileUrl?: string
  /** 云端模式下的 Storage 对象路径 */
  storagePath?: string
}

/** 是否走云端数据源：只要配置了 Supabase 即使用云端（免登录、匿名访问共享数据） */
function useCloud(): boolean {
  return isSupabaseConfigured && !!supabase
}

/** 生成资料 ID（与原有服务端 ID 风格一致） */
function newId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** base64 → Blob（兼容 data:...;base64, 前缀与纯 base64） */
function base64ToBlob(content: string, mime: string): Blob {
  const pure = content.includes(',') ? content.slice(content.indexOf(',') + 1) : content
  const bin = atob(pure)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime || 'application/octet-stream' })
}

/**
 * 生成 Storage 对象用的安全文件名。
 * 实测：Supabase Storage 的 object key 只接受 ASCII 安全字符，
 * 含中文的文件名（即便 encodeURIComponent）会返回 Invalid key。
 * 故 key 使用安全名，原始文件名仍保存在 orig_name，用于列表展示与下载命名。
 */
function toSafeStorageName(filename: string): string {
  const raw = (filename || 'file').replace(/[\\/]/g, '_')
  const dot = raw.lastIndexOf('.')
  const base = dot > 0 ? raw.slice(0, dot) : raw
  const ext = dot > 0 ? raw.slice(dot) : ''
  let baseSafe = base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60)
  // 若原名全是非 ASCII（如纯中文标题），替换后会变成一串下划线，可读性差，改为可读前缀
  if (!/[A-Za-z0-9]/.test(baseSafe)) baseSafe = 'file_' + Math.random().toString(36).slice(2, 6)
  const extSafe = ext.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 16)
  return `${baseSafe}_${Math.random().toString(36).slice(2, 8)}${extSafe}`
}

/** 为云端资料生成签名访问链接（预览/下载），失败返回 null */
async function signFileUrl(path: string): Promise<string | null> {
  if (!supabase || !path) return null
  const { data } = await supabase.storage.from(SUBMISSIONS_BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  return data?.signedUrl || null
}

/** 把云端数据行映射为页面使用的 SubmissionRow（含签名链接） */
async function mapCloudRow(r: Record<string, unknown>): Promise<SubmissionRow> {
  const storagePath = (r.storage_path as string) || ''
  const fileUrl = storagePath ? await signFileUrl(storagePath) : null
  return {
    id: String(r.id),
    name: String(r.name || ''),
    type: String(r.type || ''),
    orig_name: String(r.orig_name || ''),
    size: Number(r.size || 0),
    mime: String(r.mime || ''),
    tags: String(r.tags || ''),
    class_name: String(r.class_name || ''),
    course: String(r.course || ''),
    student_name: String(r.student_name || ''),
    role: '',
    uploader: String(r.uploader || ''),
    created_at: String(r.created_at || ''),
    status: String(r.status || 'done'),
    fileMissing: !fileUrl && !r.url,
    source: (r.source === 'url' ? 'url' : 'file') as 'file' | 'url',
    url: (r.url as string) || '',
    fileUrl: fileUrl || '',
    storagePath,
  }
}

// 带上传进度的提交（供「成果上传」页面使用）
// onProgress(0~100)；成功返回 SubmitResult，失败同样返回 SubmitResult（code<0 网络错误）
export async function uploadWithProgress(
  payload: {
    name: string
    role: string
    type: string
    filename: string
    mime: string
    content: string
    tags?: string
    class_name?: string
    course?: string
    student_name?: string
    uploader?: string
  },
  onProgress?: (percent: number) => void,
): Promise<SubmitResult> {
  // ---- 云端模式：文件存入 Supabase 私有 Storage，元数据写入 submissions 表 ----
  if (useCloud() && supabase) {
    try {
      onProgress?.(5)
      const blob = base64ToBlob(payload.content, payload.mime)
      if (blob.size > FREE_TIER_FILE_LIMIT) {
        return {
          code: -2,
          message: `文件约 ${(blob.size / 1024 / 1024).toFixed(1)}MB，超出 Supabase 免费层单文件 50MB 上限，请压缩后再上传`,
          data: null,
        }
      }
      const id = newId()
      // Storage key 用 ASCII 安全名（中文名会 Invalid key），原始文件名存 orig_name
      const safeName = toSafeStorageName(payload.filename)
      const path = `subs/${id}/${safeName}`
      const { error: upErr } = await supabase.storage
        .from(SUBMISSIONS_BUCKET)
        .upload(path, blob, { contentType: payload.mime || 'application/octet-stream', upsert: false })
      if (upErr) return { code: -2, message: `云端上传失败：${upErr.message}`, data: null }
      onProgress?.(85)
      const { error: dbErr } = await supabase.from('submissions').insert({
        id,
        name: payload.name,
        type: payload.type,
        orig_name: payload.filename || safeName,
        size: blob.size,
        mime: payload.mime || '',
        tags: payload.tags || '',
        class_name: payload.class_name || '',
        course: payload.course || '',
        student_name: payload.student_name || '',
        uploader: payload.uploader || '',
        source: 'file',
        storage_path: path,
        status: 'done',
      })
      if (dbErr) return { code: -2, message: `写入资料记录失败：${dbErr.message}`, data: null }
      onProgress?.(100)
      return { code: 0, message: 'ok', data: { id, filename: payload.filename, size: blob.size } }
    } catch (e) {
      return { code: -2, message: `云端上传异常：${e instanceof Error ? e.message : '未知错误'}`, data: null }
    }
  }

  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/submit')
      xhr.setRequestHeader('Content-Type', 'application/json')
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }
      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText) as SubmitResult
          resolve(json)
        } catch {
          resolve({ code: -1, message: '响应解析失败', data: null })
        }
      }
      xhr.onerror = () =>
        resolve({
          code: -1,
          message: '无法连接到提交服务，请用 npm run dev:all 启动后端后再提交',
          data: null,
        })
      xhr.send(JSON.stringify(payload))
    } catch {
      resolve({ code: -1, message: '提交失败', data: null })
    }
  })
}

// 线上链接提交（后端负责拉取资源；无上传进度，故用 fetch 即可）
export async function submitByUrl(payload: {
  name: string
  role: string
  type: string
  url: string
  tags?: string
  class_name?: string
  course?: string
  student_name?: string
  uploader?: string
}): Promise<SubmitResult> {
  // ---- 云端模式：线上链接型资料只登记元数据 ----
  if (useCloud() && supabase) {
    const id = newId()
    const { error } = await supabase.from('submissions').insert({
      id,
      name: payload.name,
      type: payload.type,
      orig_name: payload.name,
      size: 0,
      mime: '',
      tags: '',
      class_name: payload.class_name || '',
      course: payload.course || '',
      student_name: payload.student_name || '',
      uploader: payload.uploader || '',
      source: 'url',
      url: payload.url,
      status: 'done',
    })
    if (error) return { code: -2, message: `云端写入失败：${error.message}`, data: null }
    return { code: 0, message: 'ok', data: { id } }
  }

  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, source: 'url' }),
    })
    const json = (await res.json().catch(() => null)) as SubmitResult | null
    if (!json) return { code: -1, message: '响应解析失败', data: null }
    return json
  } catch {
    return { code: -1, message: '无法连接到提交服务，请用 npm run dev:all 启动后端后再提交', data: null }
  }
}

// ---- 客户端本地降级（演示模式）----
// 云端为纯静态托管、无后端时，上传接口不可达（返回 HTML 或网络失败）；
// 此时把资料元信息保存在浏览器 localStorage，让上传在 UI 上「成功」并明确标注为演示模式。
export interface LocalSubmission {
  id: string
  name: string
  type: string
  orig_name: string
  size: number
  mime: string
  uploader: string
  course?: string
  class_name?: string
  source: 'file' | 'url'
  url?: string
  created_at: string
}

const LS_KEY = 'twb_local_submissions'

export function loadLocalSubmissions(): LocalSubmission[] {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function saveLocalSubmission(rec: Omit<LocalSubmission, 'id' | 'created_at'>): void {
  const record: LocalSubmission = {
    ...rec,
    id: `l_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
  }
  const arr = loadLocalSubmissions()
  arr.unshift(record)
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(arr))
  } catch {
    /* localStorage 满/不可用：忽略，不影响界面 */
  }
}

// 探测后端是否可用（云端静态托管会失败/超时）
export async function probeBackend(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 3000)
    const res = await fetch('/api/health', { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return false
    const j = await res.json().catch(() => null)
    return Boolean(j && j.ok === true)
  } catch {
    return false
  }
}

// 资料列表检索
export async function listSubmissions(params: {
  type?: string
  class_name?: string
  course?: string
  q?: string
  uploader?: string
} = {}): Promise<{ code: number; list: SubmissionRow[]; total: number }> {
  // ---- 云端模式：免登录、匿名访问，所有访客共享同一份数据 ----
  if (useCloud() && supabase) {
    try {
      let q = supabase
        .from('submissions')
        .select('*')
        .order('created_at', { ascending: false })
      if (params.type) q = q.eq('type', params.type)
      if (params.class_name) q = q.ilike('class_name', `%${params.class_name.trim()}%`)
      if (params.course) q = q.ilike('course', `%${params.course.trim()}%`)
      if (params.uploader) q = q.ilike('uploader', `%${params.uploader.trim()}%`)
      const kw = (params.q || '').replace(/[,%()]/g, ' ').trim()
      if (kw) {
        q = q.or(`name.ilike.%${kw}%,orig_name.ilike.%${kw}%,uploader.ilike.%${kw}%,course.ilike.%${kw}%`)
      }
      const { data, error } = await q
      if (error) return { code: -2, list: [], total: 0 }
      const list = await Promise.all((data || []).map((r) => mapCloudRow(r as Record<string, unknown>)))
      return { code: 0, list, total: list.length }
    } catch {
      return { code: -2, list: [], total: 0 }
    }
  }

  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v) qs.set(k, v)
  })
  try {
    const res = await fetch(`/api/submissions?${qs.toString()}`)
    const json = await res.json()
    if (json?.code === 0) return { code: 0, list: json.data.list || [], total: json.data.total || 0 }
    return { code: json?.code || -1, list: [], total: 0 }
  } catch {
    return { code: -1, list: [], total: 0 }
  }
}

// 删除资料（需角色）
export async function deleteSubmission(id: string, role: string): Promise<SubmitResult> {
  // ---- 云端模式：删除记录并清理 Storage 对象 ----
  if (useCloud() && supabase) {
    const { data: row } = await supabase
      .from('submissions')
      .select('storage_path')
      .eq('id', id)
      .maybeSingle()
    const { error } = await supabase.from('submissions').delete().eq('id', id)
    if (error) return { code: -2, message: `云端删除失败：${error.message}`, data: null }
    const p = (row as { storage_path?: string } | null)?.storage_path
    if (p) await supabase.storage.from(SUBMISSIONS_BUCKET).remove([p])
    return { code: 0, message: 'ok', data: { id } }
  }

  try {
    const res = await fetch(`/api/submissions/${id}?role=${encodeURIComponent(role)}`, {
      method: 'DELETE',
    })
    const json = (await res.json().catch(() => null)) as SubmitResult | null
    if (!json) return { code: -1, message: '响应解析失败', data: null }
    return json
  } catch {
    return { code: -1, message: '无法连接到提交服务', data: null }
  }
}

// 下载链接（带角色参数，后端做权限校验）
export function downloadUrl(id: string, role: string): string {
  return `/api/submissions/${id}/file?role=${encodeURIComponent(role)}`
}

// 在线预览链接（inline=1：后端以 inline 方式返回，浏览器内联显示而非强制下载）
export function previewUrl(id: string, role: string): string {
  return `/api/submissions/${id}/file?role=${encodeURIComponent(role)}&inline=1`
}

// 资料库检索（含演示模式本地降级）
// 后端不可达（纯静态部署 / 本机后端未启动）时，回退读取浏览器 localStorage 中已保存的提交记录，
// 并在前端按相同条件做本地过滤，保证「资料库」在无后端时仍可浏览已在本机上传的资料。
export interface LibraryParams {
  q?: string
  uploader?: string
  course?: string
  class_name?: string
  type?: string
}

export async function fetchLibrary(
  params: LibraryParams = {},
): Promise<{ code: number; list: SubmissionRow[]; total: number; local: boolean }> {
  const r = await listSubmissions(params)
  if (r.code === 0) return { code: 0, list: r.list, total: r.total, local: false }
  // 云端读写出错（-2）：明确上抛，让页面显示失败与重试，不静默降级为本地数据
  if (r.code === -2) return { code: -2, list: [], total: 0, local: false }

  // 后端不可达 → 本地降级：读取 localStorage 并按相同条件客户端过滤
  const arr = loadLocalSubmissions()
  const q = (params.q || '').trim().toLowerCase()
  const list = arr
    .filter((l) => {
      if (params.uploader && !l.uploader.includes(params.uploader.trim())) return false
      if (params.course && !(l.course || '').includes(params.course.trim())) return false
      if (params.class_name && !(l.class_name || '').includes(params.class_name.trim())) return false
      if (params.type && l.type !== params.type) return false
      if (q) {
        const hay = `${l.name} ${l.orig_name} ${l.uploader} ${l.course || ''} ${l.class_name || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    .map<SubmissionRow>((l) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      orig_name: l.orig_name,
      size: l.size,
      mime: l.mime,
      tags: '',
      class_name: l.class_name || '',
      course: l.course || '',
      student_name: '',
      role: '',
      uploader: l.uploader,
      created_at: l.created_at,
      status: 'done',
      fileMissing: true,
      // 本地记录缺少真实文件内容，预览/下载不可用，由前端提示
      local: true,
      source: l.source,
      url: l.url,
    }))
  return { code: 0, list, total: list.length, local: true }
}
