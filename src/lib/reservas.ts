import { contiene, sePisan } from './fechas'
import type { ConId, Fecha, Pago, Reserva, Unidad } from './types'

export function activa(r: Pick<Reserva, 'estado'>): boolean {
  return r.estado !== 'cancelada'
}

/** Total cobrado por reserva. */
export function pagadoPorReserva(pagos: Pick<Pago, 'reservaId' | 'monto'>[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of pagos) m.set(p.reservaId, (m.get(p.reservaId) ?? 0) + p.monto)
  return m
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
    // Si por error hay dos, gana la confirmada: es la que de verdad ocupa la sombra.
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
  const orden = { carpa: 0, palapa: 1, guorum: 2 }
  return [...us].sort(
    (a, b) => orden[a.tipo] - orden[b.tipo] || a.orden - b.orden || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }),
  )
}
