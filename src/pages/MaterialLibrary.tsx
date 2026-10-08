import { useEffect, useState } from 'react'
import { useRole } from '../lib/role'
import {
  fetchLibrary,
  previewUrl,
  downloadUrl,
  type SubmissionRow,
  type LibraryParams,
} from '../api/submit'

// 「资料库」：展示「成果上传」提交的教研资料，对所有角色开放（不做角色权限限制）。
// 支持按 上传人姓名 / 学科·课程 / 年级 / 类型 筛选，以及跨字段关键字搜索；
// 支持在线预览（inline）与文件下载；后端不可达时回退浏览本机已上传资料（演示模式）。
const TYPES = ['课件', '试卷', '视频', '文档', '教案', '教研纪要', '听评课记录', '其他']

function fmtTime(s?: string) {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function MaterialLibrary() {
  const { role } = useRole()
  // 筛选条件（与后端 /api/submissions 过滤参数一一对应）
  const [filters, setFilters] = useState<LibraryParams>({
    q: '',
    uploader: '',
    course: '',
    class_name: '',
    type: '',
  })
  const [rows, setRows] = useState<SubmissionRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [localMode, setLocalMode] = useState(false)
  const [preview, setPreview] = useState<SubmissionRow | null>(null)
  // 云端读取失败提示与重试（retryTick 变化即重新拉取）
  const [err, setErr] = useState('')
  const [retryTick, setRetryTick] = useState(0)

  // 筛选变化（含关键字输入）后防抖拉取；导航进入本页即挂载拉取，保证「上传后即时可见、无需手动刷新」
  useEffect(() => {
    let active = true
    const t = setTimeout(async () => {
      setLoading(true)
      setErr('')
      const r = await fetchLibrary(filters)
      if (!active) return
      if (r.code !== 0) {
        setRows([])
        setTotal(0)
        setErr('读取云端资料失败，请检查网络连接后重试')
        setLoading(false)
        return
      }
      setLocalMode(r.local)
      setRows(r.list)
      setTotal(r.total)
      setLoading(false)
    }, 250)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [filters, retryTick])

  const setF = (patch: Partial<LibraryParams>) => setFilters((f) => ({ ...f, ...patch }))
  const resetFilters = () => setFilters({ q: '', uploader: '', course: '', class_name: '', type: '' })

  // 云端资料凭签名链接访问；本地演示模式下、且为「本地文件」来源的记录无真实文件内容，无法预览/下载
  const fileAvailable = (r: SubmissionRow) => Boolean(r.fileUrl) || !(r.local && r.source === 'file')
  /** 文件访问链接：云端用签名链接，本地后端用后端路径 */
  const fileLink = (r: SubmissionRow, inline: boolean) =>
    r.fileUrl || (inline ? previewUrl(r.id, role) : downloadUrl(r.id, role))

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">资料库</h1>
        <p className="text-sm text-slate-400 mt-1">
          集中展示「成果上传」提交的教研资料，支持按姓名 / 学科 / 课程 / 年级筛选与关键字搜索，可在线预览与下载。
        </p>
      </div>

      {localMode && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 leading-relaxed">
          当前为演示模式（云端未部署后端）：仅展示本机浏览器中已保存的上传记录，文件未真正上传到服务器，本地文件类资料无法在线预览/下载；完整能力请本地运行{' '}
          <code className="px-1 rounded bg-amber-100">npm run dev:all</code> 后访问 http://localhost:5173。
        </div>
      )}

      {/* 云端读取失败：给出明确提示与重试入口 */}
      {err && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 flex items-center justify-between gap-3">
          <span>{err}</span>
          <button
            onClick={() => setRetryTick((t) => t + 1)}
            className="shrink-0 rounded-lg border border-rose-300 px-2 py-1 hover:bg-rose-100 transition"
          >
            重试
          </button>
        </div>
      )}

      {/* 筛选与搜索 */}
      <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <input
            value={filters.q}
            onChange={(e) => setF({ q: e.target.value })}
            placeholder="关键字搜索（资料名 / 文件名 / 姓名…）"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <input
            value={filters.uploader}
            onChange={(e) => setF({ uploader: e.target.value })}
            placeholder="上传人姓名"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <input
            value={filters.course}
            onChange={(e) => setF({ course: e.target.value })}
            placeholder="学科 / 课程"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <input
            value={filters.class_name}
            onChange={(e) => setF({ class_name: e.target.value })}
            placeholder="年级（如 九年级）"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <select
            value={filters.type}
            onChange={(e) => setF({ type: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 bg-white"
          >
            <option value="">全部类型</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            onClick={resetFilters}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
          >
            重置筛选
          </button>
        </div>
        <div className="text-xs text-slate-400">
          共 {total} 份资料{loading ? ' · 加载中…' : ''}
        </div>
      </div>

      {/* 列表 */}
      <div className="rounded-2xl bg-white shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-left">
                <th className="px-4 py-3 font-medium">上传人姓名</th>
                <th className="px-4 py-3 font-medium">资料名称</th>
                <th className="px-4 py-3 font-medium">学科 / 课程</th>
                <th className="px-4 py-3 font-medium">年级</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">上传时间</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    {loading ? '加载中…' : '暂无资料。请先在「成果上传」提交教研资料。'}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{r.uploader || '—'}</td>
                    <td className="px-4 py-3 text-slate-800">
                      <div className="font-medium">{r.name || r.orig_name}</div>
                      {r.orig_name && r.orig_name !== r.name && (
                        <div className="text-xs text-slate-400 truncate max-w-[220px]">{r.orig_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.course || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.class_name || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="rounded px-1.5 py-0.5 text-[11px] bg-slate-100 text-slate-500">
                        {r.type || '其他'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtTime(r.created_at)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setPreview(r)}
                        disabled={!fileAvailable(r)}
                        className={`text-xs mr-3 ${
                          fileAvailable(r)
                            ? 'text-brand-600 hover:underline'
                            : 'text-slate-300 cursor-not-allowed'
                        }`}
                        title={fileAvailable(r) ? '在线预览' : '演示模式：本地文件未上传，无法预览'}
                      >
                        预览
                      </button>
                      {r.local && r.source === 'url' && r.url ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-emerald-600 hover:underline"
                        >
                          下载
                        </a>
                      ) : (
                        <a
                          href={fileAvailable(r) ? fileLink(r, false) : undefined}
                          download={fileAvailable(r) ? r.orig_name : undefined}
                          onClick={(e) => {
                            if (!fileAvailable(r)) e.preventDefault()
                          }}
                          className={`text-xs ${
                            fileAvailable(r)
                              ? 'text-emerald-600 hover:underline'
                              : 'text-slate-300 cursor-not-allowed'
                          }`}
                          title={fileAvailable(r) ? '下载文件' : '演示模式：本地文件未上传，无法下载'}
                        >
                          下载
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 在线预览弹窗 */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-3xl h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 h-14 border-b border-slate-100">
              <div className="min-w-0">
                <div className="font-medium text-slate-800 truncate">{preview.name || preview.orig_name}</div>
                <div className="text-xs text-slate-400 truncate">{preview.orig_name}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {fileAvailable(preview) && !preview.local && (
                  <a
                    href={fileLink(preview, false)}
                    download={preview.orig_name}
                    className="text-xs text-emerald-600 hover:underline"
                  >
                    下载
                  </a>
                )}
                <button
                  onClick={() => setPreview(null)}
                  className="text-slate-400 hover:text-slate-600 text-sm"
                  aria-label="关闭"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 min-h-0">
              {!fileAvailable(preview) ? (
                <div className="h-full grid place-items-center text-sm text-slate-400 px-6 text-center">
                  演示模式：该资料为本地上传文件，未真正上传到服务器，无法在线预览/下载。
                </div>
              ) : preview.local && preview.source === 'url' && preview.url ? (
                <iframe src={preview.url} className="w-full h-full" title="预览" />
              ) : preview.mime?.startsWith('image/') ? (
                <div className="h-full grid place-items-center p-4">
                  <img
                    src={fileLink(preview, true)}
                    alt={preview.orig_name}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : (
                <iframe src={fileLink(preview, true)} className="w-full h-full" title="预览" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
