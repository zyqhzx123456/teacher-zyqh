import StatCard from '../components/StatCard'
import TrendChart from '../components/TrendChart'
import MeasureList from '../components/MeasureList'
import TeacherTable from '../components/TeacherTable'
import { groupSummary, trend } from '../data/mock'

// 教研结论页：全组汇总 / 改进措施 / 教师对比 / 趋势折线
export default function Conclusion() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">教研结论页</h1>
        <p className="text-sm text-slate-400 mt-1">本周期全组教研分析汇总与趋势。</p>
      </div>

      {/* 全组汇总卡片 */}
      {groupSummary.length === 0 ? (
        <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-8 text-center text-sm text-slate-400">
          暂无汇总数据，提交教研资料并生成结论后将在此展示。
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {groupSummary.map((g) => (
            <StatCard
              key={g.label}
              label={g.label}
              value={g.value}
              sub={g.sub}
              tone={g.tone}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TrendChart weeks={trend.weeks} series={trend.series} />
        <MeasureList />
      </div>

      <TeacherTable />
    </div>
  )
}
