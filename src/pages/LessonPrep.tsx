import { useState } from 'react'
import { lessonPreps, type LessonPrep, type LessonPrepStatus } from '../data/mock'

const statusMeta: Record<LessonPrepStatus, { text: string; cls: string }> = {
  draft: { text: '草稿', cls: 'bg-slate-100 text-slate-500' },
  discussing: { text: '研讨中', cls: 'bg-brand-50 text-brand-700' },
  finalized: { text: '已定稿', cls: 'bg-emerald-50 text-emerald-600' },
}

export default function LessonPrep() {
  const [list, setList] = useState<LessonPrep[]>(lessonPreps.map((x) => ({ ...x })))
  const [topic, setTopic] = useState('')
  const [subject, setSubject] = useState('')
  const [grade, setGrade] = useState('')
  const [leader, setLeader] = useState('')

  const add = () => {
    if (!topic.trim()) return
    setList((prev) => [
      {
        id: `lp${Date.now()}`,
        topic: topic.trim(),
        subject: subject.trim() || '通用',
        grade: grade.trim() || '—',
        leader: leader.trim() || '待定',
        members: [leader.trim() || '待定'],
        status: 'draft',
        updated: new Date().toISOString().slice(5, 10),
      },
      ...prev,
    ])
    setTopic('')
    setSubject('')
    setGrade('')
    setLeader('')
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">集体备课</h1>
        <p className="text-sm text-slate-400 mt-1">主备牵头、组内协作，沉淀可复用的教学设计。</p>
      </div>

      <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5 space-y-3">
        <div className="font-medium text-sm text-slate-700">新增备课主题</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="备课主题" className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="学科" className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
          <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="年级" className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
          <input value={leader} onChange={(e) => setLeader(e.target.value)} placeholder="主备人" className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
        </div>
        <button onClick={add} className="rounded-xl text-sm px-4 py-1.5 bg-brand-500 text-white hover:bg-brand-600">
          添加
        </button>
      </div>

      <div className="space-y-3">
        {list.length === 0 ? (
          <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-8 text-center text-sm text-slate-400">
            暂无备课主题，使用上方表单添加第一条。
          </div>
        ) : (
          list.map((x) => (
            <div key={x.id} className="rounded-2xl bg-white shadow-sm border border-slate-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="font-medium text-slate-700 text-sm">{x.topic}</div>
                <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${statusMeta[x.status].cls}`}>
                  {statusMeta[x.status].text}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {x.subject} · {x.grade} · 主备 {x.leader} · 更新 {x.updated}
              </div>
              <div className="text-xs text-slate-500 mt-2">参与：{x.members.join('、')}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
