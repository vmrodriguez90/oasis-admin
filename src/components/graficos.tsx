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
        <div className="fila" key={d.etiqueta} title={d.detalle}>
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

export interface PuntoDia {
  dia: string
  valor: number
  detalle: string
}

/**
 * Una serie diaria (ocupación): línea de 2 px sobre un lavado del 10%, cruz
 * que sigue al puntero o a las flechas del teclado, el pico rotulado y una
 * marca en «hoy» si cae dentro.
 */
export function Linea({
  datos, formato, maximo, titulo, marca, rotuloEje,
}: {
  datos: PuntoDia[]
  formato: (n: number) => string
  maximo?: number
  titulo: string
  marca?: string
  /** Rótulo del eje X para un día, o null si ese día no lleva. */
  rotuloEje: (dia: string) => string | null
}) {
  const [activo, setActivo] = useState<number | null>(null)
  const [tabla, setTabla] = useState(false)
  const [ref, W] = useAncho<HTMLDivElement>(600)

  const H = 220
  const arriba = 20
  const abajo = 22
  const alto = H - arriba - abajo
  const maxDato = Math.max(0, ...datos.map((d) => d.valor))
  const paso = pasoLindo(maximo ?? maxDato)
  const tope = maximo ?? Math.max(paso, Math.ceil(maxDato / paso) * paso)
  const ticks: number[] = []
  for (let v = 0; v <= tope + 1e-9; v += paso) ticks.push(v)
  const izq = Math.ceil(Math.max(...ticks.map((t) => anchoTexto(formato(t))))) + 10
  const der = 8
  const n = datos.length
  const dx = n > 1 ? (W - izq - der) / (n - 1) : 0
  const x = (i: number) => izq + i * dx
  const y = (v: number) => arriba + alto - (v / tope) * alto

  if (tabla) {
    return (
      <div ref={ref}>
        <div className="tabla-desplazable">
          <table>
            <thead><tr><th scope="col">Día</th><th className="num" scope="col">{titulo}</th></tr></thead>
            <tbody>
              {datos.map((d) => <tr key={d.dia}><td>{d.detalle}</td><td className="num">{formato(d.valor)}</td></tr>)}
            </tbody>
          </table>
        </div>
        <button type="button" className="ver-tabla" onClick={() => setTabla(false)}>Ver gráfico</button>
      </div>
    )
  }

  if (!n) return <div ref={ref} />

  const linea = datos.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.valor).toFixed(1)}`).join('')
  const area = `${linea}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`
  const iPico = datos.findIndex((d) => d.valor === maxDato)
  const iMarca = marca ? datos.findIndex((d) => d.dia === marca) : -1

  // Rótulos del eje: los que pide rotuloEje, sin encimarse.
  const rotulos: { i: number; t: string }[] = []
  datos.forEach((d, i) => {
    const t = rotuloEje(d.dia)
    if (t == null) return
    const prev = rotulos.at(-1)
    if (!prev || x(i) - x(prev.i) >= anchoTexto(prev.t) + 10) rotulos.push({ i, t })
    // El rótulo del primer día cede su lugar al primer mes, que orienta más.
    else if (prev.i === 0) rotulos[rotulos.length - 1] = { i, t }
  })

  const mover = (i: number) => setActivo(Math.max(0, Math.min(n - 1, i)))
  const act = activo != null ? datos[activo] : undefined

  return (
    <div className="grafico" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={titulo}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grilla-linea" x1={izq} x2={W - der} y1={y(t)} y2={y(t)} />
            <text className="eje" x={izq - 6} y={y(t) + 4} textAnchor="end">{formato(t)}</text>
          </g>
        ))}
        {rotulos.map((r) => (
          <text key={r.i} className="eje" x={x(r.i)} y={H - 6} textAnchor="middle">{r.t}</text>
        ))}
        {iMarca >= 0 && (
          <g>
            <line className="hoy" x1={x(iMarca)} x2={x(iMarca)} y1={arriba - 4} y2={y(0)} />
            <text className="eje" x={x(iMarca) + 4} y={arriba + 4}>hoy</text>
          </g>
        )}
        <path className="area" d={area} />
        <path className="linea" d={linea} />
        {iPico >= 0 && maxDato > 0 && activo == null && (
          <g>
            <circle className="punto" cx={x(iPico)} cy={y(maxDato)} r={4} />
            <text className="valor" x={x(iPico)} y={y(maxDato) - 9} textAnchor={iPico > n * 0.85 ? 'end' : iPico < n * 0.15 ? 'start' : 'middle'}>
              {formato(maxDato)}
            </text>
          </g>
        )}
        {act && activo != null && (
          <g>
            <line className="cruz" x1={x(activo)} x2={x(activo)} y1={arriba} y2={y(0)} />
            <circle className="punto" cx={x(activo)} cy={y(act.valor)} r={4} />
          </g>
        )}
        <rect
          className="golpe"
          x={izq - dx / 2}
          y={0}
          width={W - izq - der + dx}
          height={H - abajo}
          tabIndex={0}
          aria-label={`${titulo}: usá las flechas para recorrer los días`}
          onPointerMove={(e) => {
            const caja = e.currentTarget.ownerSVGElement!.getBoundingClientRect()
            const px = ((e.clientX - caja.left) / caja.width) * W
            mover(dx ? Math.round((px - izq) / dx) : 0)
          }}
          onPointerLeave={() => setActivo(null)}
          onFocus={() => setActivo((a) => a ?? iPico)}
          onBlur={() => setActivo(null)}
          onKeyDown={(e) => {
            const salto = e.shiftKey ? 7 : 1
            if (e.key === 'ArrowRight') mover((activo ?? 0) + salto)
            else if (e.key === 'ArrowLeft') mover((activo ?? 0) - salto)
            else if (e.key === 'Home') mover(0)
            else if (e.key === 'End') mover(n - 1)
            else return
            e.preventDefault()
          }}
        />
      </svg>
      {act && activo != null && (
        <div
          className="tooltip"
          style={{
            left: `${Math.min(Math.max(x(activo), 70), W - 70)}px`,
            top: `${y(act.valor)}px`,
          }}
          aria-live="polite"
        >
          <strong>{formato(act.valor)}</strong>
          {act.detalle}
        </div>
      )}
      <button type="button" className="ver-tabla" onClick={() => setTabla(true)}>Ver tabla</button>
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
