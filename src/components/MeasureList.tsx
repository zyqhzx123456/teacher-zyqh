import { useState } from 'react'
import { measures as initial } from '../data/mock'

// 改进措施清单：可勾选「已落实 / 未落实」。
export default function MeasureList() {
  const [items, setItems] = useState(initial)
  const toggle = (id: string) =>
    setItems(items.map((m) => (m.id === id ? { ...m, done: !m.done } : m)))
  const doneCount = items.filter((m) => m.done).length

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-800">改进措施清单</h3>
        <span className="text-xs text-slate-400">
          已落实 {doneCount}/{items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-slate-400 py-6 text-center">暂无改进措施，添加后将在此展示。</div>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => (
            <li key={m.id}>
              <label className="flex items-start gap-3 rounded-xl p-3 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={m.done}
                  onChange={() => toggle(m.id)}
                  className="mt-1 h-4 w-4 accent-brand-500"
                />
                <div className="flex-1">
                  <div className={m.done ? 'text-slate-400 line-through' : 'text-slate-700'}>
                    {m.text}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">负责人：{m.owner}</div>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                    m.done ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  {m.done ? '已落实' : '未落实'}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
