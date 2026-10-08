import { useState } from 'react'
import { observations, type Observation } from '../data/mock'

function scoreTone(score: number) {
  if (score >= 90) return 'bg-emerald-500'
  if (score >= 80) return 'bg-brand-500'
  return 'bg-amber-500'
}

export default function Observation() {
  const [list, setList] = useState<Observation[]>(observations.map((x) => ({ ...x })))
  const [course, setCourse] = useState('')
  const [teacher, setTeacher] = useState('')
  const [observer, setObserver] = useState('')
  const [score, setScore] = useState('85')
  const [comment, setComment] = useState('')

  const add = () => {
    if (!course.trim() || !teacher.trim()) return
    setList((prev) => [
      {
        id: `ob${Date.now()}`,
        course: course.trim(),
        teacher: teacher.trim(),
        observer: observer.trim() || '待定',
        date: new Date().toISOString().slice(5, 10),
        score: Number(score) || 0,
        comment: comment.trim() || '—',
      },
      ...prev,
    ])
    setCourse('')
    setTeacher('')
    setObserver('')
    setScore('85')
    setComment('')
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">听评课</h1>
        <p className="text-sm text-slate-400 mt-1">记录听课评分与改进建议，沉淀课堂教学样本。</p>
      </div>

      <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5 space-y-3">
        <div className="font-medium text-sm text-slate-700">新增听评课记录</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="课题" className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
          <input value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="授课人" className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
          <input value={observer} onChange={(e) => setObserver(e.target.value)} placeholder="听课人" className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
          <input value={score} onChange={(e) => setScore(e.target.value)} type="number" min={0} max={100} placeholder="评分" className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
        </div>
        <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="评语" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
        <button onClick={add} className="rounded-xl text-sm px-4 py-1.5 bg-brand-500 text-white hover:bg-brand-600">
          添加
        </button>
      </div>

      <div className="space-y-3">
        {list.length === 0 ? (
          <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-8 text-center text-sm text-slate-400">
            暂无听评课记录，使用上方表单添加第一条。
          </div>
        ) : (
          list.map((x) => (
            <div key={x.id} className="rounded-2xl bg-white shadow-sm border border-slate-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="font-medium text-slate-700 text-sm">{x.course}</div>
                <div className="text-sm font-semibold text-slate-700 whitespace-nowrap">{x.score} 分</div>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                授课 {x.teacher} · 听课 {x.observer} · {x.date}
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 mt-2 overflow-hidden">
                <div className={`h-full ${scoreTone(x.score)}`} style={{ width: `${x.score}%` }} />
              </div>
              <div className="text-xs text-slate-500 mt-2">{x.comment}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
