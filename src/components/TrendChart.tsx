import { useEffect, useRef } from 'react'
import type { TrendSeries } from '../data/mock'

// 原生 Canvas 趋势折线图，支持多系列、DPR 高清、窗口缩放重绘。
export default function TrendChart({
  weeks,
  series,
}: {
  weeks: string[]
  series: TrendSeries[]
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      const cssW = canvas.clientWidth
      const cssH = canvas.clientHeight
      if (!cssW || !cssH) return
      canvas.width = cssW * dpr
      canvas.height = cssH * dpr
      const ctx = canvas.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cssW, cssH)

      const pad = { l: 36, r: 14, t: 14, b: 26 }
      const plotW = cssW - pad.l - pad.r
      const plotH = cssH - pad.t - pad.b

      const all = series.flatMap((s) => s.data)
      let yMin = Math.min(...all)
      let yMax = Math.max(...all)
      if (yMin === yMax) {
        yMin -= 1
        yMax += 1
      }
      const span = yMax - yMin
      yMin = Math.floor((yMin - span * 0.1) * 10) / 10
      yMax = Math.ceil((yMax + span * 0.1) * 10) / 10

      const xAt = (i: number) => pad.l + plotW * (i / (weeks.length - 1))
      const yAt = (v: number) => pad.t + plotH * (1 - (v - yMin) / (yMax - yMin))

      // 网格线 + Y 轴刻度
      ctx.strokeStyle = '#f1f5f9'
      ctx.fillStyle = '#94a3b8'
      ctx.font = '11px system-ui, sans-serif'
      ctx.lineWidth = 1
      const steps = 4
      for (let i = 0; i <= steps; i++) {
        const v = yMin + ((yMax - yMin) * i) / steps
        const y = yAt(v)
        ctx.beginPath()
        ctx.moveTo(pad.l, y)
        ctx.lineTo(cssW - pad.r, y)
        ctx.stroke()
        ctx.fillText(String(Math.round(v)), 6, y + 3)
      }

      // X 轴标签
      ctx.textAlign = 'center'
      weeks.forEach((w, i) => ctx.fillText(w, xAt(i), cssH - 8))
      ctx.textAlign = 'left'

      // 折线 + 数据点
      series.forEach((s) => {
        ctx.strokeStyle = s.color
        ctx.lineWidth = 2
        ctx.beginPath()
        s.data.forEach((v, i) => {
          const X = xAt(i)
          const Y = yAt(v)
          if (i === 0) ctx.moveTo(X, Y)
          else ctx.lineTo(X, Y)
        })
        ctx.stroke()
        s.data.forEach((v, i) => {
          ctx.fillStyle = s.color
          ctx.beginPath()
          ctx.arc(xAt(i), yAt(v), 3, 0, Math.PI * 2)
          ctx.fill()
        })
      })
    }

    draw()
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [weeks, series])

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5">
      <h3 className="font-semibold text-slate-800 mb-3">趋势折线图</h3>
      {series.length === 0 || weeks.length === 0 ? (
        <div className="text-sm text-slate-400 py-10 text-center">暂无趋势数据。</div>
      ) : (
        <>
          <div className="flex gap-4 mb-2">
            {series.map((s) => (
              <div key={s.name} className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                {s.name}
              </div>
            ))}
          </div>
          <canvas ref={ref} className="w-full h-56" />
        </>
      )}
    </div>
  )
}
