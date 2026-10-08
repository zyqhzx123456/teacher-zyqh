import type { ChartSpec, AxisChart, HeatmapChart } from '../api/analyze'

const SERIES_COLORS = ['#8B5CF6', '#10b981', '#f59e0b', '#0ea5e9', '#ef4444']
const LIGHT = [237, 233, 254] // #ede9fe
const DARK = [124, 58, 237] // #7c3aed

function lerpColor(t: number): string {
  const c = Math.max(0, Math.min(1, t))
  const r = Math.round(LIGHT[0] + (DARK[0] - LIGHT[0]) * c)
  const g = Math.round(LIGHT[1] + (DARK[1] - LIGHT[1]) * c)
  const b = Math.round(LIGHT[2] + (DARK[2] - LIGHT[2]) * c)
  return `rgb(${r},${g},${b})`
}

const W = 480
const H = 240
const padL = 46
const padR = 16
const padT = 16
const padB = 42
const plotW = W - padL - padR
const plotH = H - padT - padB

function AxisChartSvg({ chart }: { chart: AxisChart }) {
  const all = chart.series.flatMap((s) => s.values)
  const maxV = Math.max(1, ...all)
  const isPct = /%|百分/.test(chart.unit)
  const yMax = isPct && maxV <= 100 ? 100 : Math.ceil((maxV * 1.12) / 5) * 5
  const n = chart.labels.length
  const slot = plotW / Math.max(1, n)
  const xCenter = (i: number) => padL + slot * (i + 0.5)
  const yFor = (v: number) => padT + plotH * (1 - v / yMax)

  const grid: number[] = []
  for (let g = 0; g <= 4; g++) grid.push(yMax * (g / 4))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={chart.title}>
      {/* y 轴网格与刻度 */}
      {grid.map((gv, i) => {
        const y = yFor(gv)
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#eef2f7" strokeWidth={1} />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={10} fill="#94a3b8">
              {Math.round(gv * 10) / 10}
            </text>
          </g>
        )
      })}

      {/* x 轴类目 */}
      {chart.labels.map((lb, i) => (
        <text key={i} x={xCenter(i)} y={H - padB + 16} textAnchor="middle" fontSize={10} fill="#64748b">
          {lb}
        </text>
      ))}

      {/* 折线 / 条形 */}
      {chart.type === 'line' ? (
        chart.series.map((s, si) => {
          const pts = s.values.map((v, i) => `${xCenter(i)},${yFor(v)}`).join(' ')
          return (
            <g key={si}>
              <polyline points={pts} fill="none" stroke={SERIES_COLORS[si % SERIES_COLORS.length]} strokeWidth={2.5} />
              {s.values.map((v, i) => (
                <circle key={i} cx={xCenter(i)} cy={yFor(v)} r={3} fill={SERIES_COLORS[si % SERIES_COLORS.length]} />
              ))}
            </g>
          )
        })
      ) : (
        chart.series.map((s, si) => {
          const K = chart.series.length
          const groupW = slot * 0.78
          const barW = (groupW / K) * 0.8
          return (
            <g key={si}>
              {s.values.map((v, i) => {
                const gh = padT + plotH - yFor(v)
                const x =
                  xCenter(i) - groupW / 2 + (K === 1 ? (groupW - barW) / 2 : (groupW / K) * si + (groupW / K - barW) / 2)
                return (
                  <rect
                    key={i}
                    x={x}
                    y={yFor(v)}
                    width={barW}
                    height={Math.max(0, gh)}
                    rx={3}
                    fill={SERIES_COLORS[si % SERIES_COLORS.length]}
                  />
                )
              })}
            </g>
          )
        })
      )}

      {/* 图例（多系列时） */}
      {chart.series.length > 1 && (
        <g>
          {chart.series.map((s, si) => {
            const lx = padL + si * 92
            const ly = padT - 2
            return (
              <g key={si} transform={`translate(${lx},${ly})`}>
                <rect width={10} height={10} rx={2} y={-9} fill={SERIES_COLORS[si % SERIES_COLORS.length]} />
                <text x={14} y={0} fontSize={10} fill="#64748b">
                  {s.name}
                </text>
              </g>
            )
          })}
        </g>
      )}
    </svg>
  )
}

function HeatmapSvg({ chart }: { chart: HeatmapChart }) {
  const R = chart.rows.length
  const C = chart.cols.length
  const cellW = plotW / Math.max(1, C)
  const cellH = plotH / Math.max(1, R)
  const flat = chart.matrix.flat()
  const minV = Math.min(...flat)
  const maxV = Math.max(...flat)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={chart.title}>
      {chart.matrix.map((row, ri) =>
        row.map((v, ci) => {
          const t = maxV === minV ? 0.5 : (v - minV) / (maxV - minV)
          const x = padL + ci * cellW
          const y = padT + ri * cellH
          return (
            <g key={`${ri}-${ci}`}>
              <rect x={x + 1} y={y + 1} width={cellW - 2} height={cellH - 2} rx={4} fill={lerpColor(t)} />
              <text
                x={x + cellW / 2}
                y={y + cellH / 2 + 3}
                textAnchor="middle"
                fontSize={10}
                fill={t > 0.55 ? '#fff' : '#475569'}
              >
                {Math.round(v * 10) / 10}
              </text>
            </g>
          )
        }),
      )}
      {chart.cols.map((c, ci) => (
        <text key={`c${ci}`} x={padL + ci * cellW + cellW / 2} y={H - padB + 16} textAnchor="middle" fontSize={10} fill="#64748b">
          {c}
        </text>
      ))}
      {chart.rows.map((r, ri) => (
        <text key={`r${ri}`} x={padL - 6} y={padT + ri * cellH + cellH / 2 + 3} textAnchor="end" fontSize={10} fill="#64748b">
          {r}
        </text>
      ))}
    </svg>
  )
}

export default function ChartBlock({ chart }: { chart: ChartSpec }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h5 className="text-sm font-semibold text-slate-700">{chart.title}</h5>
        <span className="text-xs text-slate-400 whitespace-nowrap">{chart.unit}</span>
      </div>
      <div className="mt-2">
        {chart.type === 'heatmap' ? <HeatmapSvg chart={chart} /> : <AxisChartSvg chart={chart as AxisChart} />}
      </div>
      <p className="mt-2 text-xs text-slate-500 leading-relaxed">
        <span className="text-brand-500 font-medium">解读：</span>
        {chart.interpretation}
      </p>
    </div>
  )
}
