type Tone = 'brand' | 'green' | 'amber' | 'slate'

const toneMap: Record<Tone, string> = {
  brand: 'text-brand-600 bg-brand-50',
  green: 'text-emerald-600 bg-emerald-50',
  amber: 'text-amber-600 bg-amber-50',
  slate: 'text-slate-600 bg-slate-100',
}

export default function StatCard({
  label,
  value,
  sub,
  tone = 'slate',
}: {
  label: string
  value: string | number
  sub?: string
  tone?: Tone
}) {
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${toneMap[tone].split(' ')[0]}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  )
}
