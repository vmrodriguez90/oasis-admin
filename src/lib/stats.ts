import { contiene, diasEntre, sumarDias, unAnioAntes } from './fechas'
import { ORDEN_TIPOS, activa, claveReserva, esPrincipal, pagadoDe, pagadoPorReserva, saldo } from './reservas'
import type { CanalConsulta, ConId, Consulta, Fecha, MetodoPago, Pago, Reserva, TipoUnidad, Unidad } from './types'

// Estadísticas de una temporada. Sirven igual para reservas cargadas acá y
// para las importadas del sistema de reservas: en las importadas, una reserva
// con varias unidades son varios documentos con el mismo número, y la plata
// está sólo en la unidad principal (ver esPrincipal y claveReserva).

type R = ConId<Reserva>

export interface Ocupacion {
  tipo: TipoUnidad
  ocupadas: number
  total: number
}

export function ocupacionPorTipo(unidades: ConId<Unidad>[], reservas: R[], dia: Fecha): Ocupacion[] {
  const ocupadas = new Set(reservas.filter((r) => activa(r) && contiene(r, dia)).map((r) => r.unidadId))
  return ORDEN_TIPOS
    .map((tipo) => {
      const delTipo = unidades.filter((u) => u.activa && u.tipo === tipo)
      return { tipo, total: delTipo.length, ocupadas: delTipo.filter((u) => ocupadas.has(u.id)).length }
    })
    .filter((o) => o.total > 0)
}

/** Unidades de un tipo ocupadas cada día, desde la primera reserva hasta la última. */
export function ocupacionDiaria(
  unidades: ConId<Unidad>[],
  reservas: R[],
  tipo: TipoUnidad,
): { dia: Fecha; ocupadas: number; total: number }[] {
  const ids = new Set(unidades.filter((u) => u.activa && u.tipo === tipo).map((u) => u.id))
  const delTipo = reservas.filter((r) => activa(r) && ids.has(r.unidadId))
  if (!ids.size || !delTipo.length) return []
  const desde = delTipo.reduce((m, r) => (r.desde < m ? r.desde : m), delTipo[0]!.desde)
  const hasta = delTipo.reduce((m, r) => (r.hasta > m ? r.hasta : m), delTipo[0]!.hasta)
  const n = diasEntre(desde, hasta) + 1
  const porDia = Array.from({ length: n }, () => new Set<string>())
  for (const r of delTipo) {
    for (let i = diasEntre(desde, r.desde); i <= diasEntre(desde, r.hasta); i++) porDia[i]!.add(r.unidadId)
  }
  return porDia.map((s, i) => ({ dia: sumarDias(desde, i), ocupadas: s.size, total: ids.size }))
}

export interface Resumen {
  /** Importe de las reservas activas. */
  vendido: number
  cobrado: number
  pendiente: number
  reservas: number
  canceladas: number
  conDeuda: number
  /** Activas con importe 0 (o el $1 que el sistema usa de marcador): falta cargarles el precio. */
  sinImporte: number
}

export function resumenTemporada(reservas: R[], pagos: Pago[]): Resumen {
  const pagos_ = pagadoPorReserva(pagos)
  const activas = reservas.filter(activa)
  const conDeuda = new Set<string>()
  let pendiente = 0
  for (const r of activas) {
    const s = saldo(r, pagadoDe(r, pagos_))
    pendiente += s
    if (s > 0) conDeuda.add(claveReserva(r))
  }
  return {
    vendido: activas.reduce((n, r) => n + r.precio, 0),
    // También lo cobrado en reservas que después se cancelaron: es plata que entró.
    cobrado: reservas.reduce((n, r) => n + pagadoDe(r, pagos_), 0),
    pendiente,
    reservas: new Set(activas.map(claveReserva)).size,
    canceladas: new Set(reservas.filter((r) => !activa(r)).map(claveReserva)).size,
    conDeuda: conDeuda.size,
    sinImporte: activas.filter((r) => esPrincipal(r) && r.precio <= 1).length,
  }
}

function meses(desde: string, hasta: string): string[] {
  const out: string[] = []
  let [y, m] = desde.split('-').map(Number) as [number, number]
  while (`${y}-${String(m).padStart(2, '0')}` <= hasta) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) [y, m] = [y + 1, 1]
  }
  return out
}

/** Lo vendido por mes en que se hizo la reserva: cuándo se vende la temporada. */
export function ventasPorMes(reservas: R[]): { mes: string; monto: number; reservas: number }[] {
  const conFecha = reservas.filter((r) => activa(r) && esPrincipal(r) && r.reservadaEl)
  if (!conFecha.length) return []
  const m = new Map<string, { monto: number; claves: Set<string> }>()
  for (const r of conFecha) {
    const k = r.reservadaEl!.slice(0, 7)
    const x = m.get(k) ?? { monto: 0, claves: new Set() }
    x.monto += r.precio
    x.claves.add(claveReserva(r))
    m.set(k, x)
  }
  const ks = [...m.keys()].sort()
  return meses(ks[0]!, ks.at(-1)!).map((mes) => ({ mes, monto: m.get(mes)?.monto ?? 0, reservas: m.get(mes)?.claves.size ?? 0 }))
}

/** El importe va en la unidad principal de cada reserva. */
export function ventasPorTipo(reservas: R[]): { tipo: TipoUnidad; monto: number; unidades: number }[] {
  return ORDEN_TIPOS
    .map((tipo) => {
      const xs = reservas.filter((r) => activa(r) && r.unidadTipo === tipo)
      return { tipo, monto: xs.reduce((n, r) => n + r.precio, 0), unidades: xs.length }
    })
    .filter((x) => x.unidades > 0)
}

export const RANGOS_DURACION = ['1 día', '2 a 6 días', '1 a 2 semanas', '2 semanas a 1 mes', 'Más de 1 mes'] as const

export function duraciones(reservas: R[]): { rango: (typeof RANGOS_DURACION)[number]; reservas: number }[] {
  const cuenta = RANGOS_DURACION.map(() => 0)
  for (const r of reservas) {
    if (!activa(r) || !esPrincipal(r)) continue
    const d = diasEntre(r.desde, r.hasta) + 1
    cuenta[d <= 1 ? 0 : d <= 6 ? 1 : d <= 14 ? 2 : d <= 31 ? 3 : 4]!++
  }
  return RANGOS_DURACION.map((rango, i) => ({ rango, reservas: cuenta[i]! }))
}

export const RANGOS_ANTICIPACION = ['Menos de 1 semana', '1 a 4 semanas', '1 a 3 meses', 'Más de 3 meses'] as const

/** Con cuántos días de anticipación se reserva. */
export function anticipacion(reservas: R[]): {
  mediana: number | null
  rangos: { rango: (typeof RANGOS_ANTICIPACION)[number]; reservas: number }[]
} {
  const dias = reservas
    .filter((r) => activa(r) && esPrincipal(r) && r.reservadaEl)
    .map((r) => Math.max(0, diasEntre(r.reservadaEl!, r.desde)))
    .sort((a, b) => a - b)
  const cuenta = RANGOS_ANTICIPACION.map(() => 0)
  for (const d of dias) cuenta[d < 7 ? 0 : d < 30 ? 1 : d < 90 ? 2 : 3]!++
  const mitad = Math.floor(dias.length / 2)
  return {
    mediana: !dias.length ? null : dias.length % 2 ? dias[mitad]! : Math.round((dias[mitad - 1]! + dias[mitad]!) / 2),
    rangos: RANGOS_ANTICIPACION.map((rango, i) => ({ rango, reservas: cuenta[i]! })),
  }
}

/** Clientes de esta temporada que ya habían venido la anterior. */
export function clientesQueVuelven(actual: R[], anterior: R[]): { clientes: number; vuelven: number } {
  const antes = new Set(anterior.filter(activa).map((r) => r.clienteId))
  const ahora = new Set(actual.filter(activa).map((r) => r.clienteId))
  return { clientes: ahora.size, vuelven: [...ahora].filter((c) => antes.has(c)).length }
}

export function mejoresClientes(reservas: R[], n = 5) {
  const m = new Map<string, { clienteId: string; clienteNombre: string; monto: number; claves: Set<string> }>()
  for (const r of reservas) {
    if (!activa(r)) continue
    const x = m.get(r.clienteId) ?? { clienteId: r.clienteId, clienteNombre: r.clienteNombre, monto: 0, claves: new Set() }
    x.monto += r.precio
    x.claves.add(claveReserva(r))
    m.set(r.clienteId, x)
  }
  return [...m.values()]
    .sort((a, b) => b.monto - a.monto)
    .slice(0, n)
    .map(({ claves, ...x }) => ({ ...x, reservas: claves.size }))
}

/**
 * Lo vendido hasta hoy, contra lo que se había vendido de la temporada
 * anterior al mismo día del año pasado. Null si no hay con qué comparar.
 */
export function ritmoDeVentas(actual: R[], anterior: R[], dia: Fecha): { actual: number; anterior: number } | null {
  const vendido = (rs: R[], corte: Fecha) =>
    rs.filter((r) => activa(r) && esPrincipal(r) && r.reservadaEl && r.reservadaEl <= corte).reduce((n, r) => n + r.precio, 0)
  const a = vendido(anterior, unAnioAntes(dia))
  return a > 0 ? { actual: vendido(actual, dia), anterior: a } : null
}

export function cobrosPorMetodo(pagos: Pago[]): { metodo: MetodoPago; monto: number }[] {
  const m = new Map<MetodoPago, number>()
  for (const p of pagos) m.set(p.metodo, (m.get(p.metodo) ?? 0) + p.monto)
  return [...m].map(([metodo, monto]) => ({ metodo, monto })).sort((a, b) => b.monto - a.monto)
}

export interface EmbudoConsultas {
  abiertas: number
  ganadas: number
  perdidas: number
  /** ganadas / cerradas, o null si todavía no se cerró ninguna. */
  conversion: number | null
  porCanal: { canal: CanalConsulta; total: number }[]
}

export function embudoConsultas(consultas: Consulta[]): EmbudoConsultas {
  const ganadas = consultas.filter((c) => c.estado === 'ganada').length
  const perdidas = consultas.filter((c) => c.estado === 'perdida').length
  const canal = new Map<CanalConsulta, number>()
  for (const c of consultas) canal.set(c.canal, (canal.get(c.canal) ?? 0) + 1)
  return {
    abiertas: consultas.length - ganadas - perdidas,
    ganadas,
    perdidas,
    conversion: ganadas + perdidas > 0 ? ganadas / (ganadas + perdidas) : null,
    porCanal: [...canal].map(([c, total]) => ({ canal: c, total })).sort((a, b) => b.total - a.total),
  }
}
