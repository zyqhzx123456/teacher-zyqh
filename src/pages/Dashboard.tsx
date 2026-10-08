import { useState, useEffect } from 'react'
import StatCard from '../components/StatCard'
import { researchGroups } from '../data/mock'
import { listSubmissions } from '../api/submit'
import { loadJSON } from '../lib/storage'

// 工作台首页：展示真实统计数据；无真实数据时统一展示空状态。
// 真实数据来源：资料提交数（后端 /api/submissions）、已分析 / 待分析数（本地分析草稿）。
export default function Dashboard() {
  const [subTotal, setSubTotal] = useState(0)
  const [analyzed, setAnalyzed] = useState(0)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    listSubmissions({}).then((r) => {
      setSubTotal(r.code === 0 ? r.total : 0)
    }).catch(() => setSubTotal(0))

    const mats = loadJSON<Array<{ status?: string }>>('twb:v2:analyze:materials', [])
    setAnalyzed(mats.filter((m) => m.status === 'done').length)
    setPending(mats.filter((m) => m.status === 'pending').length)
  }, [])

  const hasData = subTotal > 0 || analyzed > 0 || pending > 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">工作台首页</h1>
      </div>

      {!hasData ? (
        <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-10 text-center text-sm text-slate-400 leading-relaxed">
          暂无数据。请先在「成果上传」上传教研资料，并在「资料分析」中运行分析，
          <br />
          相关统计将在此自动汇总展示。
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="提交数" value={subTotal} sub="资料库累计" tone="brand" />
          <StatCard label="已分析数" value={analyzed} sub="已完成分析" tone="green" />
          <StatCard label="待处理数" value={pending} sub="待分析资料" tone="amber" />
          <StatCard label="教研组数" value={researchGroups.length} sub="本校教研组" tone="slate" />
        </div>
      )}
    </div>
  )
}
