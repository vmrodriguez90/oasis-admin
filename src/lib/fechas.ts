import type { Fecha } from './types'

const TZ = 'America/Argentina/Buenos_Aires'

/** Hoy en Miramar, como 'YYYY-MM-DD', sin importar la zona del navegador. */
export function hoy(ahora: Date = new Date()): Fecha {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(ahora)
}

function aUTC(f: Fecha): number {
  const [y, m, d] = f.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

function desdeUTC(ms: number): Fecha {
  return new Date(ms).toISOString().slice(0, 10)
}

export function sumarDias(f: Fecha, n: number): Fecha {
  return desdeUTC(aUTC(f) + n * 86_400_000)
}

/** Días entre dos fechas, contando ambas puntas. */
export function diasIncluidos(desde: Fecha, hasta: Fecha): number {
  return Math.round((aUTC(hasta) - aUTC(desde)) / 86_400_000) + 1
}

export function esFechaValida(f: string): f is Fecha {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false
  return desdeUTC(aUTC(f)) === f
}

/** Dos rangos inclusivos se pisan si ninguno termina antes de que empiece el otro. */
export function sePisan(a: { desde: Fecha; hasta: Fecha }, b: { desde: Fecha; hasta: Fecha }): boolean {
  return a.desde <= b.hasta && b.desde <= a.hasta
}

export function contiene(r: { desde: Fecha; hasta: Fecha }, dia: Fecha): boolean {
  return r.desde <= dia && dia <= r.hasta
}

/**
 * La temporada de playa cruza el año (diciembre a marzo), así que se nombra
 * por los dos: todo lo que va de julio a junio cae en la misma, "2026/27".
 */
export function temporadaDe(f: Fecha): string {
  const [y, m] = f.split('-').map(Number)
  const inicio = m! >= 7 ? y! : y! - 1
  return `${inicio}/${String((inicio + 1) % 100).padStart(2, '0')}`
}

export function temporadasAlrededor(actual: string, antes = 2, despues = 1): string[] {
  const inicio = Number(actual.slice(0, 4))
  const out: string[] = []
  for (let y = inicio + despues; y >= inicio - antes; y--) {
    out.push(`${y}/${String((y + 1) % 100).padStart(2, '0')}`)
  }
  return out
}

/** Meses (como 'YYYY-MM') que abarca una temporada, de julio a junio. */
export function mesesDeTemporada(t: string): string[] {
  const inicio = Number(t.slice(0, 4))
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((6 + i) % 12) + 1
    const y = i < 6 ? inicio : inicio + 1
    return `${y}-${String(m).padStart(2, '0')}`
  })
}

const fmtCorta = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmtLarga = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
})
const fmtMes = new Intl.DateTimeFormat('es-AR', { month: 'short', timeZone: 'UTC' })

export function fechaCorta(f: Fecha): string {
  return fmtCorta.format(aUTC(f)).replace('.', '')
}

export function fechaLarga(f: Fecha): string {
  return fmtLarga.format(aUTC(f))
}

export function nombreMes(ym: string): string {
  return fmtMes.format(aUTC(`${ym}-01`)).replace('.', '')
}

export function rango(desde: Fecha, hasta: Fecha): string {
  return desde === hasta ? fechaCorta(desde) : `${fechaCorta(desde)} – ${fechaCorta(hasta)}`
}

/** "miércoles, 7 de octubre" -> "Miércoles, 7 de octubre". CSS capitalize pondría "De Octubre". */
export function mayuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function plural(n: number, uno: string, varios: string): string {
  return `${n.toLocaleString('es-AR')} ${n === 1 ? uno : varios}`
}
