import { contiene, mesesDeTemporada, sumarDias } from './fechas'
import { activa, pagadoPorReserva, saldo } from './reservas'
import type {
  CanalConsulta, ConId, Consulta, Fecha, MetodoPago, Pago, Reserva, TipoUnidad, Unidad,
} from './types'

export interface Ocupacion {
  tipo: TipoUnidad
  ocupadas: number
  total: number
}

export function ocupacionPorTipo(unidades: ConId<Unidad>[], reservas: ConId<Reserva>[], dia: Fecha): Ocupacion[] {
  const ocupadas = new Set(reservas.filter((r) => activa(r) && contiene(r, dia)).map((r) => r.unidadId))
  const tipos: TipoUnidad[] = ['carpa', 'palapa', 'guorum']
  return tipos
    .map((tipo) => {
      const delTipo = unidades.filter((u) => u.activa && u.tipo === tipo)
      return { tipo, total: delTipo.length, ocupadas: delTipo.filter((u) => ocupadas.has(u.id)).length }
    })
    .filter((o) => o.total > 0)
}

/** Porcentaje de unidades activas ocupadas en cada uno de los próximos `dias` días. */
export function ocupacionProximosDias(
  unidades: ConId<Unidad>[],
  reservas: ConId<Reserva>[],
  desde: Fecha,
  dias: number,
): { dia: Fecha; ocupadas: number; total: number }[] {
  const ids = new Set(unidades.filter((u) => u.activa).map((u) => u.id))
  const act = reservas.filter((r) => activa(r) && ids.has(r.unidadId))
  return Array.from({ length: dias }, (_, i) => {
    const dia = sumarDias(desde, i)
    const ocupadas = new Set(act.filter((r) => contiene(r, dia)).map((r) => r.unidadId)).size
    return { dia, ocupadas, total: ids.size }
  })
}

export interface Resumen {
  facturado: number
  cobrado: number
  pendiente: number
  reservas: number
  conDeuda: number
}

export function resumenTemporada(reservas: ConId<Reserva>[], pagos: Pago[]): Resumen {
  const pagado = pagadoPorReserva(pagos)
  const act = reservas.filter(activa)
  let pendiente = 0
  let conDeuda = 0
  for (const r of act) {
    const s = saldo(r, pagado.get(r.id) ?? 0)
    pendiente += s
    if (s > 0) conDeuda++
  }
  return {
    facturado: act.reduce((n, r) => n + r.precio, 0),
    cobrado: pagos.reduce((n, p) => n + p.monto, 0),
    pendiente,
    reservas: act.length,
    conDeuda,
  }
}

export function cobrosPorMes(pagos: Pago[], temporada: string): { mes: string; monto: number }[] {
  const meses = mesesDeTemporada(temporada)
  const m = new Map(meses.map((x) => [x, 0]))
  for (const p of pagos) {
    const k = p.fecha.slice(0, 7)
    if (m.has(k)) m.set(k, m.get(k)! + p.monto)
  }
  return meses.map((mes) => ({ mes, monto: m.get(mes)! }))
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
