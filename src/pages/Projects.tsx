import { useState } from 'react'
import { projects, type Project, type ProjectStatus } from '../data/mock'

const statusMeta: Record<ProjectStatus, { text: string; cls: string }> = {
  planning: { text: '筹划中', cls: 'bg-slate-100 text-slate-500' },
  ongoing: { text: '进行中', cls: 'bg-brand-50 text-brand-700' },
  done: { text: '已结题', cls: 'bg-emerald-50 text-emerald-600' },
}

export default function Projects() {
  const [list, setList] = useState<Project[]>(projects.map((x) => ({ ...x })))
  const [name, setName] = useState('')
  const [leader, setLeader] = useState('')
  const [outcome, setOutcome] = useState('')
  const [progress, setProgress] = useState('20')

  const add = () => {
    if (!name.trim()) return
    setList((prev) => [
      {
        id: `pj${Date.now()}`,
        name: name.trim(),
        leader: leader.trim() || '待定',
        status: 'planning',
        outcome: outcome.trim() || '方案起草中',
        progress: Number(progress) || 0,
      },
      ...prev,
    ])
    setName('')
    setLeader('')
    setOutcome('')
    setProgress('20')
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">课题与成果</h1>
        <p className="text-sm text-slate-400 mt-1">跟踪教研课题进展与产出成果。</p>
      </div>

      <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5 space-y-3">
        <div className="font-medium text-sm text-slate-700">新增课题</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="课题名称" className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
          <input value={leader} onChange={(e) => setLeader(e.target.value)} placeholder="负责人" className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
          <input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="阶段成果" className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
          <input value={progress} onChange={(e) => setProgress(e.target.value)} type="number" min={0} max={100} placeholder="进度%" className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
        </div>
        <button onClick={add} className="rounded-xl text-sm px-4 py-1.5 bg-brand-500 text-white hover:bg-brand-600">
          添加
        </button>
      </div>

      <div className="space-y-3">
        {list.length === 0 ? (
          <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-8 text-center text-sm text-slate-400">
            暂无课题与成果，使用上方表单添加第一条。
          </div>
        ) : (
          list.map((x) => (
            <div key={x.id} className="rounded-2xl bg-white shadow-sm border border-slate-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="font-medium text-slate-700 text-sm">{x.name}</div>
                <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${statusMeta[x.status].cls}`}>
                  {statusMeta[x.status].text}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1">负责人 {x.leader}</div>
              <div className="h-1.5 rounded-full bg-slate-100 mt-2 overflow-hidden">
                <div className="h-full bg-brand-500" style={{ width: `${x.progress}%` }} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <div className="text-xs text-slate-500">{x.outcome}</div>
                <div className="text-xs text-slate-400">{x.progress}%</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
