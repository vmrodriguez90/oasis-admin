import { useLayoutEffect, useRef, useState } from 'react'

// Gráficos de una sola serie: un solo color (--dato), sin leyenda (el título
// dice qué se grafica), tooltip al pasar o enfocar cada barra y la tabla como
// alternativa accesible. Ver la skill de dataviz: barras finas, extremo de
// datos redondeado y base recta, grilla de un pelo.

export interface Punto {
  etiqueta: string
  valor: number
  /** Texto del tooltip, si hace falta más que la etiqueta. */
  detalle?: string
}

/** Ancho real del contenedor, para dibujar en píxeles de pantalla: si el SVG
 *  se escalara, en el celular los rótulos quedarían de 6 px. */
function useAncho<T extends HTMLElement>(inicial: number) {
  const ref = useRef<T>(null)
  const [ancho, setAncho] = useState(inicial)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => e && setAncho(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, ancho] as const
}

// Ancho aproximado de un rótulo de 11.5 px en Jost, para reservarle lugar.
const anchoTexto = (t: string) => t.length * 6.4

function pasoLindo(max: number, n = 4): number {
  if (max <= 0) return 1
  const crudo = max / n
  const mag = 10 ** Math.floor(Math.log10(crudo))
  const f = crudo / mag
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag
}

function barraRedondeada(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return ''
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

export function Columnas({
  datos, formato, formatoEje, maximo, titulo, etiquetarMaximo = true,
}: {
  datos: Punto[]
  formato: (n: number) => string
  formatoEje?: (n: number) => string
  maximo?: number
  titulo: string
  etiquetarMaximo?: boolean
}) {
  const [activo, setActivo] = useState<number | null>(null)
  const [tabla, setTabla] = useState(false)
  const [ref, W] = useAncho<HTMLDivElement>(600)

  const H = 200
  const abajo = 22
  const arriba = 18
  const alto = H - abajo - arriba
  const maxDato = Math.max(0, ...datos.map((d) => d.valor))
  const paso = pasoLindo(maximo ?? maxDato)
  const tope = maximo ?? Math.max(paso, Math.ceil(maxDato / paso) * paso)
  const ticks: number[] = []
  for (let v = 0; v <= tope + 1e-9; v += paso) ticks.push(v)
  const fEje = formatoEje ?? formato
  const izq = Math.ceil(Math.max(...ticks.map((t) => anchoTexto(fEje(t))))) + 10
  const ancho = W - izq
  const slot = ancho / Math.max(1, datos.length)
  const bw = Math.min(24, slot * 0.6)
  const y = (v: number) => arriba + alto - (v / tope) * alto
  const iMax = etiquetarMaximo && maxDato > 0 ? datos.findIndex((d) => d.valor === maxDato) : -1
  // Si los rótulos no entran, se rotula una columna de cada dos (o tres…).
  const rotulo = Math.max(...datos.map((d) => anchoTexto(d.etiqueta))) + 6
  const salto = Math.max(1, Math.ceil(rotulo / slot))

  if (tabla) {
    return (
      <div ref={ref}>
        <table>
          <thead><tr><th scope="col">{titulo}</th><th className="num" scope="col">Valor</th></tr></thead>
          <tbody>
            {datos.map((d) => (
              <tr key={d.etiqueta}><td>{d.detalle ?? d.etiqueta}</td><td className="num">{formato(d.valor)}</td></tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="ver-tabla" onClick={() => setTabla(false)}>Ver gráfico</button>
      </div>
    )
  }

  const act = activo != null ? datos[activo] : undefined

  return (
    <div className="grafico" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={titulo} onPointerLeave={() => setActivo(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grilla-linea" x1={izq} x2={W} y1={y(t)} y2={y(t)} />
            <text className="eje" x={izq - 6} y={y(t) + 4} textAnchor="end">{fEje(t)}</text>
          </g>
        ))}
        {datos.map((d, i) => {
          const cx = izq + slot * i + slot / 2
          const h = (d.valor / tope) * alto
          return (
            <g key={d.etiqueta} className={activo === i ? 'activa' : undefined}>
              <path className="barra" d={barraRedondeada(cx - bw / 2, y(d.valor), bw, h, 4)} />
              {i === iMax && (
                <text className="valor" x={cx} y={y(d.valor) - 5} textAnchor="middle">{fEje(d.valor)}</text>
              )}
              {i % salto === 0 && (
                <text className="eje" x={cx} y={H - 6} textAnchor="middle">{d.etiqueta}</text>
              )}
              <rect
                className="golpe"
                x={izq + slot * i}
                y={arriba}
                width={slot}
                height={alto}
                tabIndex={0}
                aria-label={`${d.detalle ?? d.etiqueta}: ${formato(d.valor)}`}
                onPointerEnter={() => setActivo(i)}
                onFocus={() => setActivo(i)}
                onBlur={() => setActivo(null)}
              />
            </g>
          )
        })}
      </svg>
      {act && activo != null && (
        <div
          className="tooltip"
          style={{
            left: `${((izq + slot * activo + slot / 2) / W) * 100}%`,
            top: `${(y(act.valor) / H) * 100}%`,
          }}
        >
          <strong>{formato(act.valor)}</strong>
          {act.detalle ?? act.etiqueta}
        </div>
      )}
      <button type="button" className="ver-tabla" onClick={() => setTabla(true)}>Ver tabla</button>
    </div>
  )
}

export function BarrasH({ datos, formato }: { datos: Punto[]; formato: (n: number) => string }) {
  const max = Math.max(1, ...datos.map((d) => d.valor))
  return (
    <div className="barras-h">
      {datos.map((d) => (
        <div className="fila" key={d.etiqueta}>
          <span>{d.etiqueta}</span>
          <div className="pista" aria-hidden="true">
            <div style={{ width: `${(d.valor / max) * 100}%` }} />
          </div>
          <span className="num">{formato(d.valor)}</span>
        </div>
      ))}
    </div>
  )
}

export function Medidor({ valor, total }: { valor: number; total: number }) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0
  return (
    <div className="medidor" role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={valor}>
      <div style={{ width: `${pct}%` }} />
    </div>
  )
}
