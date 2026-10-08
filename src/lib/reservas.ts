import { contiene, sePisan } from './fechas'
import { TIPOS_UNIDAD, type ConId, type Fecha, type Pago, type Reserva, type TipoUnidad, type Unidad } from './types'

export const ORDEN_TIPOS = Object.keys(TIPOS_UNIDAD) as TipoUnidad[]

export function activa(r: Pick<Reserva, 'estado'>): boolean {
  return r.estado !== 'cancelada'
}

/** Total cobrado por reserva. */
export function pagadoPorReserva(pagos: Pick<Pago, 'reservaId' | 'monto'>[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of pagos) m.set(p.reservaId, (m.get(p.reservaId) ?? 0) + p.monto)
  return m
}

/**
 * Lo cobrado de una reserva: los pagos cargados acá más, si es importada, lo
 * que el sistema de reservas ya da por cobrado (importe menos saldo).
 */
export function pagadoDe(
  r: Pick<ConId<Reserva>, 'id' | 'origen' | 'precio' | 'saldoExterno'>,
  pagosPorReserva: Map<string, number>,
): number {
  const externo = r.origen === 'importada' && r.saldoExterno != null ? r.precio - r.saldoExterno : 0
  return externo + (pagosPorReserva.get(r.id) ?? 0)
}

/**
 * Identifica la reserva «de verdad»: en una importada con carpa y cochera hay
 * dos documentos pero es una sola reserva.
 */
export function claveReserva(r: Pick<ConId<Reserva>, 'id' | 'externoId'>): string {
  return r.externoId ? `#${r.externoId}` : r.id
}

/** La unidad que lleva la plata de la reserva (en las manuales, todas). */
export function esPrincipal(r: Pick<Reserva, 'origen' | 'saldoExterno'>): boolean {
  return r.origen !== 'importada' || r.saldoExterno != null
}

/** Lo que falta cobrar. Una cancelada no debe nada, aunque se le haya cobrado algo. */
export function saldo(r: Pick<Reserva, 'precio' | 'estado'>, pagado: number): number {
  if (!activa(r)) return 0
  return Math.max(0, r.precio - pagado)
}

/**
 * Reservas activas de la misma unidad que se pisan con el rango propuesto.
 * `ignorar` es la reserva que se está editando, que no choca consigo misma.
 */
export function choques(
  reservas: ConId<Reserva>[],
  propuesta: { unidadId: string; desde: Fecha; hasta: Fecha },
  ignorar?: string,
): ConId<Reserva>[] {
  return reservas.filter(
    (r) => r.id !== ignorar && activa(r) && r.unidadId === propuesta.unidadId && sePisan(r, propuesta),
  )
}

/** Qué reserva ocupa cada unidad un día dado. */
export function ocupacionDelDia(reservas: ConId<Reserva>[], dia: Fecha): Map<string, ConId<Reserva>> {
  const m = new Map<string, ConId<Reserva>>()
  for (const r of reservas) {
    if (!activa(r) || !contiene(r, dia)) continue
    // Si por error hay dos, gana la confirmada: es la que de verdad ocupa la unidad.
    const previa = m.get(r.unidadId)
    if (!previa || (previa.estado !== 'confirmada' && r.estado === 'confirmada')) m.set(r.unidadId, r)
  }
  return m
}

export function unidadesLibres(
  unidades: ConId<Unidad>[],
  reservas: ConId<Reserva>[],
  desde: Fecha,
  hasta: Fecha,
  ignorar?: string,
): ConId<Unidad>[] {
  return unidades.filter(
    (u) => u.activa && choques(reservas, { unidadId: u.id, desde, hasta }, ignorar).length === 0,
  )
}

export function ordenarUnidades<T extends Pick<Unidad, 'tipo' | 'orden' | 'codigo'>>(us: T[]): T[] {
  return [...us].sort(
    (a, b) => ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo) || a.orden - b.orden
      || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }),
  )
}
