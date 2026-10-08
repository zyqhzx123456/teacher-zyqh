import { useState, useEffect } from 'react'
import StatCard from '../components/StatCard'
import { researchGroups, type ResearchGroup, type GroupMember } from '../data/mock'
import { useRole, LEADER_GROUP } from '../lib/role'
import { listSubmissions } from '../api/submit'

// 教研组：列出各学科教研组，点击查看资料上交情况。
// 已交状态优先由后端 submissions 按「提交人姓名」实时汇总驱动；后端不可达（如静态部署）时回退为空状态。
export default function Groups() {
  const { group, isGroupScoped } = useRole()
  const [selected, setSelected] = useState<string | null>(null)

  // 后端真实提交人姓名集合（null=尚未加载；空集合=无提交或后端不可达）
  const [uploaderSet, setUploaderSet] = useState<Set<string> | null>(null)

  useEffect(() => {
    let alive = true
    listSubmissions({}).then((r) => {
      if (!alive) return
      if (r.code === 0) {
        setUploaderSet(new Set(r.list.map((s) => s.uploader).filter(Boolean)))
      } else {
        setUploaderSet(new Set()) // 后端不可达 → 全部视为未交
      }
    })
    return () => {
      alive = false
    }
  }, [])

  // 成员是否已交：后端有真实数据时按提交人姓名匹配，否则回退演示字段（已清空为 false）
  const isSubmitted = (m: GroupMember): boolean =>
    uploaderSet ? uploaderSet.has(m.name) : m.submitted

  // 教研组长：仅可查看绑定的本教研组（综合教研组），不展示其他教研组、无切换入口
  if (isGroupScoped) {
    const g = researchGroups.find((x) => x.subject === (group || LEADER_GROUP))
    if (!g) return null
    return <GroupDetail group={g} isSubmitted={isSubmitted} scoped />
  }

  // 其他角色（老师 / 管理员 / 教研校长）：可查看全部教研组
  const groupObj = researchGroups.find((g) => g.subject === selected) || null
  if (groupObj) return <GroupDetail group={groupObj} isSubmitted={isSubmitted} onBack={() => setSelected(null)} />
  return <GroupList isSubmitted={isSubmitted} onSelect={setSelected} />
}

function GroupDetail({
  group,
  isSubmitted,
  scoped,
  onBack,
}: {
  group: ResearchGroup
  isSubmitted: (m: GroupMember) => boolean
  scoped?: boolean
  onBack?: () => void
}) {
  const required = group.members.length
  const submitted = group.members.filter((m) => isSubmitted(m)).length
  const notSubmitted = required - submitted
  const rate = required === 0 ? 0 : Math.round((submitted / required) * 100)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        {onBack && (
          <button
            onClick={onBack}
            className="text-sm text-slate-400 hover:text-brand-600 transition"
          >
            ← 返回教研组列表
          </button>
        )}
        <h1 className="text-xl font-semibold text-slate-800 mt-2">
          {group.subject}教研组 · 资料上交情况
        </h1>
        {scoped && (
          <div className="mt-2 text-xs text-brand-700 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2 leading-relaxed">
            您是 <strong>{group.subject}教研组</strong> 组长，仅可查看本组资料上交情况与 AI 分析，无法查看其他教研组数据。
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="应提交数" value={required} sub="本组教师应交" tone="slate" />
        <StatCard label="已提交数" value={submitted} sub="已上交资料" tone="green" />
        <StatCard label="未提交数" value={notSubmitted} sub="待催收" tone="amber" />
        <StatCard label="提交率" value={`${rate}%`} sub="已交占比" tone="brand" />
      </div>

      <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5">
        <h3 className="font-semibold text-slate-800 mb-4">提交状态</h3>
        {/* 组内教师名单：响应式卡片网格（手机 2 列 / 平板 3 列 / 桌面 4 列） */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {group.members.map((m) => {
            const done = isSubmitted(m)
            return (
              <div
                key={m.name}
                className="rounded-2xl bg-white shadow-sm border border-slate-100 p-4 flex flex-col items-center gap-2"
              >
                <div className="text-sm text-slate-700 text-center">{m.name}</div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    done ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                  }`}
                >
                  {done ? '已交' : '未交'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function GroupList({
  isSubmitted,
  onSelect,
}: {
  isSubmitted: (m: GroupMember) => boolean
  onSelect: (s: string) => void
}) {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">教研组</h1>
        <p className="text-sm text-slate-400 mt-1">点击教研组查看资料上交情况</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {researchGroups.map((g) => {
          const required = g.members.length
          const submitted = g.members.filter((m) => isSubmitted(m)).length
          const rate = required === 0 ? 0 : Math.round((submitted / required) * 100)
          const status = submitted === required ? '已交' : '未交'
          return (
            <button
              key={g.subject}
              onClick={() => onSelect(g.subject)}
              className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5 text-left hover:border-brand-200 hover:shadow transition flex flex-col gap-2"
            >
              <div className="text-base font-semibold text-slate-800">{g.subject}教研组</div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">提交率 {rate}%</span>
                <span className={status === '已交' ? 'text-emerald-600' : 'text-amber-600'}>
                  {status}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
