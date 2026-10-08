import { useEffect, useRef, useState } from 'react'
import { useRole } from '../lib/role'
import { uploadWithProgress, submitByUrl, probeBackend, saveLocalSubmission } from '../api/submit'
import {
  acceptAttr,
  extOf,
  formatSize,
  labelOf,
  maxFileMB,
  supportedLabels,
  validateFile,
  validateUrl,
  basenameOfUrl,
} from '../config/upload'

const TYPES: string[] = ['课件', '试卷', '视频', '文档', '教案', '教研纪要', '听评课记录', '其他']

interface UploadItem {
  id: string
  source: 'file' | 'url'
  file?: File
  url?: string
  name: string
  ext: string
  label: string
  size: string
  progress: number
  status: 'wait' | 'uploading' | 'done' | 'error'
  errorCode?: string
  errorMsg?: string
}

interface Rejected {
  name: string
  reason: string
}

// 成果上传（原「教学资源库」）：本地文件 + 线上链接 两种上传方式，共用同一队列与校验规则。
// 上传的资料会自动写入 submissions 表，并同步展示在「资料库」页面。
// 格式白名单与传输上限集中在 config/upload-types.json（前后端同源）。
export default function Resources() {
  const { role, configured } = useRole()
  // 云端模式：已配置 Supabase 即走云端（免登录、匿名访问，跨设备可见），不属于演示模式
  const cloudMode = configured
  const idRef = useRef(0)
  const nextId = () => `f_${Date.now().toString(36)}_${(idRef.current++).toString(36)}`
  const dragDepth = useRef(0)

  const [mode, setMode] = useState<'file' | 'url'>('file')
  const [urlInput, setUrlInput] = useState('')
  const [urlErr, setUrlErr] = useState('')

  const [form, setForm] = useState({
    name: '',
    type: '教案',
    course: '',
    className: '',
    uploader: '',
  })
  const [items, setItems] = useState<UploadItem[]>([])
  const [rejects, setRejects] = useState<Rejected[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // 探测后端是否可用：云端纯静态托管 → 无后端 → 演示模式（上传降级为本地保存）
  useEffect(() => {
    let alive = true
    probeBackend().then((ok) => {
      if (alive) setDemoMode(!ok)
    })
    return () => {
      alive = false
    }
  }, [])

  // ---- 本地文件：选择 / 拖拽，逐文件校验 ----
  const addFiles = (files: FileList | File[] | null) => {
    if (!files || !files.length) return
    const list = Array.from(files)
    const accepted: UploadItem[] = []
    const bad: Rejected[] = []
    for (const f of list) {
      const ext = extOf(f.name)
      const v = validateFile(f)
      if (!v.ok) {
        bad.push({ name: f.name, reason: v.msg })
      } else {
        accepted.push({
          id: nextId(),
          source: 'file',
          file: f,
          name: f.name,
          ext,
          label: labelOf(ext),
          size: formatSize(f.size),
          progress: 0,
          status: 'wait',
        })
      }
    }
    if (accepted.length) {
      setItems((prev) => [...prev, ...accepted])
      setMsg(null)
    }
    if (bad.length) setRejects((prev) => [...prev, ...bad])
  }

  // ---- 线上链接：格式校验通过后入队 ----
  const addUrl = () => {
    const v = validateUrl(urlInput)
    if (!v.ok) {
      setUrlErr(v.msg)
      return
    }
    setUrlErr('')
    const name = basenameOfUrl(v.url)
    const ext = extOf(name)
    const item: UploadItem = {
      id: nextId(),
      source: 'url',
      url: v.url,
      name,
      ext,
      label: ext ? labelOf(ext) : '待识别',
      size: '未知',
      progress: 0,
      status: 'wait',
    }
    setItems((prev) => [...prev, item])
    setUrlInput('')
    setMsg(null)
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id))
  }

  // ---- 后端不可达时的本地降级（演示模式） ----
  const localFallback = (item: UploadItem) => {
    saveLocalSubmission({
      name: form.name.trim(),
      type: form.type,
      orig_name: item.source === 'url' ? item.name : item.file?.name || item.name,
      size: item.file?.size || 0,
      mime: item.file?.type || '',
      uploader: form.uploader.trim(),
      course: form.course.trim(),
      class_name: form.className.trim(),
      source: item.source,
      url: item.url,
    })
    setDemoMode(true)
    setItems((prev) =>
      prev.map((x) =>
        x.id === item.id
          ? { ...x, status: 'done', progress: 100, errorMsg: '已保存到本地浏览器（演示模式）' }
          : x,
      ),
    )
    return { ok: true, dup: false, local: true }
  }

  // ---- 上传单个条目（本地 base64 / 链接由后端拉取） ----
  const uploadOne = async (
    item: UploadItem,
  ): Promise<{ ok: boolean; dup?: boolean; local?: boolean }> => {
    setItems((prev) =>
      prev.map((x) => (x.id === item.id ? { ...x, status: 'uploading', progress: 0, errorMsg: undefined } : x)),
    )

    // 线上链接：交给后端拉取，成功后回填真实文件名与大小
    if (item.source === 'url') {
      const r = await submitByUrl({
        name: form.name.trim(),
        role,
        type: form.type,
        url: item.url!,
        tags: [form.course, form.className].filter(Boolean).join(','),
        class_name: form.className.trim(),
        course: form.course.trim(),
        uploader: form.uploader.trim(),
      })
      if (r.code === -1) return localFallback(item)
      if (r.code === 0) {
        const dup = Boolean(r.data?.duplicated)
        setItems((prev) =>
          prev.map((x) =>
            x.id === item.id
              ? {
                  ...x,
                  status: 'done',
                  progress: 100,
                  name: r.data?.filename || x.name,
                  size: r.data?.size ? formatSize(r.data.size) : x.size,
                  errorMsg: dup ? '已存在，已定位原记录' : undefined,
                }
              : x,
          ),
        )
        return { ok: true, dup }
      }
      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id
            ? { ...x, status: 'error', errorCode: String(r.code), errorMsg: r.message }
            : x,
        ),
      )
      return { ok: false }
    }

    // 本地文件：读取 base64 后上传
    let base64: string
    try {
      base64 = await readAsBase64(item.file!)
    } catch {
      setItems((prev) =>
        prev.map((x) => (x.id === item.id ? { ...x, status: 'error', errorMsg: '文件读取失败' } : x)),
      )
      return { ok: false }
    }
    const r = await uploadWithProgress(
      {
        name: form.name.trim(),
        role,
        type: form.type,
        filename: item.file!.name,
        mime: item.file!.type || 'application/octet-stream',
        content: base64,
        tags: [form.course, form.className].filter(Boolean).join(','),
        class_name: form.className.trim(),
        course: form.course.trim(),
        uploader: form.uploader.trim(),
      },
      (p) => setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, progress: p } : x))),
    )
    if (r.code === -1) return localFallback(item)
    if (r.code === 0) {
      const dup = Boolean(r.data?.duplicated)
      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id
            ? { ...x, status: 'done', progress: 100, errorMsg: dup ? '已存在，已定位原记录' : undefined }
            : x,
        ),
      )
      return { ok: true, dup }
    }
    setItems((prev) =>
      prev.map((x) =>
        x.id === item.id
          ? { ...x, status: 'error', errorCode: String(r.code), errorMsg: r.message }
          : x,
      ),
    )
    return { ok: false }
  }

  // ---- 批量提交（串行队列，仅处理未完成条目） ----
  const doUpload = async () => {
    if (!form.name.trim()) {
      setMsg({ ok: false, text: '请填写资料名称' })
      return
    }
    if (!form.uploader.trim()) {
      setMsg({ ok: false, text: '请填写提交人姓名（用于同步至对应教研组统计）' })
      return
    }
    if (!items.length) {
      setMsg({ ok: false, text: '请先添加本地文件或资源链接' })
      return
    }
    setUploading(true)
    setMsg(null)
    const pending = items.filter((x) => x.status !== 'done')
    let ok = 0
    let dup = 0
    let local = 0
    let fail = 0
    for (const it of pending) {
      const r = await uploadOne(it)
      if (r.ok) {
        ok++
        if (r.dup) dup++
        if (r.local) local++
      } else {
        fail++
      }
    }
    setUploading(false)
    if (fail === 0 && ok > 0) {
      setMsg({
        ok: true,
        text:
          local > 0
            ? `已保存 ${ok} 个资源到本地浏览器（演示模式：云端无后端，文件不会上传到服务器）`
            : dup > 0
              ? `已处理 ${ok} 个资源，其中 ${dup} 个为重复提交（已定位原记录），并同步至对应教研组统计`
              : `已成功上传 ${ok} 个资源并归档，已同步至「${form.uploader.trim()}」对应教研组统计`,
      })
      setForm({ name: '', type: '教案', course: '', className: '', uploader: '' })
      setItems([])
      setRejects([])
    } else if (ok > 0) {
      setMsg({ ok: false, text: `${ok} 个成功、${fail} 个失败，失败项可单独重试或移除。` })
    } else {
      setMsg({ ok: false, text: '提交失败，请查看各资源错误原因后重试。' })
    }
  }

  const retryOne = async (id: string) => {
    const it = items.find((x) => x.id === id)
    if (!it || uploading) return
    await uploadOne(it)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">成果上传</h1>
        <p className="text-sm text-slate-400 mt-1">
          老师提交教研资料，系统按提交人姓名自动汇总至对应教研组统计。支持本地文件与线上链接两种方式。
        </p>
      </div>

      {/* 云端模式：提示数据存于云端且跨设备同步（含 AI 分析需后端的说明） */}
      {cloudMode && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700 leading-relaxed">
          已连接云端：上传的资料保存在你的账号下，手机、电脑与不同浏览器登录同一账号即可看到同一份数据。
          （AI 分析依赖本地后端，如需使用请运行 <code className="px-1 rounded bg-emerald-100">npm run dev:all</code> 访问 http://localhost:5173）
        </div>
      )}

      {/* 仅在「未接入云端且本地后端不可达」时才算演示模式 */}
      {demoMode && !cloudMode && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 leading-relaxed">
          当前为演示模式（云端未部署后端）：资料将仅保存在本机浏览器，不会真正上传到服务器，其他设备也无法看到。
          完整上传请本地运行 <code className="px-1 rounded bg-amber-100">npm run dev:all</code> 后访问 http://localhost:5173。
        </div>
      )}

      {msg && (
        <div
          className={`text-xs rounded-xl px-3 py-2 leading-relaxed border ${
            msg.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5 space-y-3">
        <div className="font-medium text-sm text-slate-700">上传教研资料</div>

        {/* 资料元信息 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="资料名称"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 bg-white"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input
            value={form.course}
            onChange={(e) => setForm((f) => ({ ...f, course: e.target.value }))}
            placeholder="学科 / 课程"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <input
            value={form.className}
            onChange={(e) => setForm((f) => ({ ...f, className: e.target.value }))}
            placeholder="年级（如 九年级）"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <input
            value={form.uploader}
            onChange={(e) => setForm((f) => ({ ...f, uploader: e.target.value }))}
            placeholder="提交人姓名（用于教研组统计）"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 sm:col-span-2"
          />
        </div>

        {/* 上传方式切换 */}
        <div className="flex rounded-xl border border-slate-200 overflow-hidden text-sm">
          <button
            onClick={() => setMode('file')}
            className={`flex-1 py-2 transition ${mode === 'file' ? 'bg-brand-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
          >
            本地文件
          </button>
          <button
            onClick={() => setMode('url')}
            className={`flex-1 py-2 transition ${mode === 'url' ? 'bg-brand-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
          >
            链接上传
          </button>
        </div>

        {/* 本地文件：拖拽 + 多选 */}
        {mode === 'file' && (
          <div
            onDragEnter={(e) => {
              e.preventDefault()
              dragDepth.current++
              setDragOver(true)
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => {
              e.preventDefault()
              dragDepth.current--
              if (dragDepth.current <= 0) {
                dragDepth.current = 0
                setDragOver(false)
              }
            }}
            onDrop={(e) => {
              e.preventDefault()
              dragDepth.current = 0
              setDragOver(false)
              addFiles(e.dataTransfer.files)
            }}
            className={`rounded-2xl border-2 border-dashed p-4 transition ${
              dragOver ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <input
              type="file"
              multiple
              accept={acceptAttr()}
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
              className="w-full text-sm text-slate-500 file:mr-3 file:rounded-xl file:border-0 file:bg-brand-50 file:text-brand-700 file:px-3 file:py-1.5 file:cursor-pointer"
            />
            <div className="text-[11px] text-slate-400 mt-1">
              支持 {supportedLabels()}；可多选或拖拽，单文件传输上限 {maxFileMB}MB
            </div>
          </div>
        )}

        {/* 线上链接输入 */}
        {mode === 'url' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value)
                  setUrlErr('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addUrl()
                  }
                }}
                placeholder="粘贴资源在线链接（http / https）"
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
              <button
                onClick={addUrl}
                className="rounded-xl px-4 text-sm bg-brand-50 text-brand-700 border border-brand-100 hover:bg-brand-100"
              >
                添加
              </button>
            </div>
            {urlErr && <div className="text-[11px] text-rose-500">{urlErr}</div>}
            <div className="text-[11px] text-slate-400">
              支持 {supportedLabels()}；链接需可公开访问，单文件传输上限 {maxFileMB}MB
            </div>
          </div>
        )}

        {/* 被拒绝的文件（本地选择阶段即时拦截） */}
        {rejects.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 space-y-1.5">
            <div className="font-medium">以下文件已被拒绝：</div>
            {rejects.map((r, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.name}</div>
                  <div className="text-amber-600">{r.reason}</div>
                </div>
                <button
                  onClick={() => setRejects((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-amber-500 hover:text-amber-700 whitespace-nowrap"
                >
                  忽略
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 统一队列：本地 + 链接混合展示 */}
        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="rounded-xl border border-slate-100 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span
                        className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] ${
                          it.source === 'url' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {it.source === 'url' ? '链接' : '本地'}
                      </span>
                      <span className="truncate font-medium">{it.name}</span>
                      <span className="whitespace-nowrap text-slate-400">
                        {it.label} · {it.size}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    {it.status === 'error' && (
                      <button
                        onClick={() => retryOne(it.id)}
                        disabled={uploading}
                        className="text-xs text-brand-600 hover:underline disabled:opacity-50"
                      >
                        重试
                      </button>
                    )}
                    {it.status !== 'uploading' && (
                      <button
                        onClick={() => removeItem(it.id)}
                        disabled={uploading}
                        className="text-xs text-slate-400 hover:text-rose-500 disabled:opacity-50"
                      >
                        移除
                      </button>
                    )}
                    <span className="text-xs text-slate-500">
                      {it.status === 'done'
                        ? '✓ 成功'
                        : it.status === 'error'
                          ? '✗ 失败'
                          : it.status === 'uploading'
                            ? it.source === 'url'
                              ? '拉取中…'
                              : `${it.progress}%`
                            : '待上传'}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      it.status === 'error' ? 'bg-rose-400' : it.status === 'uploading' && it.source === 'url' ? 'bg-blue-400 animate-pulse' : 'bg-brand-500'
                    }`}
                    style={{ width: `${it.status === 'done' ? 100 : it.source === 'url' ? (it.status === 'uploading' ? 40 : it.progress) : it.progress}%` }}
                  />
                </div>
                {it.errorMsg && (
                  <div className="text-[11px] text-rose-500 mt-1">
                    {it.errorMsg}
                    {it.errorCode ? `（${it.errorCode}）` : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={doUpload}
            disabled={uploading}
            className="flex-1 rounded-xl text-sm py-1.5 bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? '提交中…' : '提交上传'}
          </button>
          <button
            onClick={() => {
              setForm({ name: '', type: '教案', course: '', className: '', uploader: '' })
              setItems([])
              setRejects([])
              setUrlInput('')
              setUrlErr('')
              setMsg(null)
            }}
            className="rounded-xl text-sm px-3 py-1.5 border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            重置
          </button>
        </div>
      </div>
    </div>
  )
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}
