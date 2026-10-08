import { teacherCompare } from '../data/mock'

// 教师对比表格。
export default function TeacherTable() {
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5">
      <h3 className="font-semibold text-slate-800 mb-4">教师对比</h3>
      {teacherCompare.length === 0 ? (
        <div className="text-sm text-slate-400 py-6 text-center">暂无教师对比数据。</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-3 font-medium">教师</th>
                <th className="py-2 pr-3 font-medium">提交数</th>
                <th className="py-2 pr-3 font-medium">平均分</th>
                <th className="py-2 pr-3 font-medium">听评课</th>
                <th className="py-2 pr-3 font-medium">落实率</th>
              </tr>
            </thead>
            <tbody>
              {teacherCompare.map((t) => (
                <tr key={t.name} className="border-b border-slate-50">
                  <td className="py-2.5 pr-3 font-medium text-slate-700">{t.name}</td>
                  <td className="py-2.5 pr-3">{t.submissions}</td>
                  <td className="py-2.5 pr-3">{t.avgScore}</td>
                  <td className="py-2.5 pr-3">{t.observe}</td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-brand-500" style={{ width: `${t.doneRate}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{t.doneRate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
