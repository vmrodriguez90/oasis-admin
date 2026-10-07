import { describe, expect, it } from 'vitest'
import { choques, ocupacionDelDia, pagadoPorReserva, saldo, unidadesLibres } from './reservas'
import { cobrosPorMes, embudoConsultas, ocupacionPorTipo, resumenTemporada } from './stats'
import type { ConId, Consulta, Pago, Reserva, Unidad } from './types'

const unidad = (id: string, tipo: Unidad['tipo'] = 'carpa', activa = true): ConId<Unidad> =>
  ({ id, codigo: id.toUpperCase(), tipo, sector: '', orden: 0, activa })

const reserva = (id: string, unidadId: string, desde: string, hasta: string, extra: Partial<Reserva> = {}): ConId<Reserva> => ({
  id, unidadId, unidadCodigo: unidadId, unidadTipo: 'carpa', clienteId: 'c', clienteNombre: 'C',
  desde, hasta, modalidad: 'dia', temporada: '2026/27', precio: 100_000, estado: 'confirmada', notas: '',
  creado: null, creadoPor: 'x', ...extra,
})

const pago = (reservaId: string, monto: number, fecha = '2027-01-05'): Pago => ({
  reservaId, monto, fecha, clienteId: 'c', clienteNombre: 'C', unidadCodigo: 'C1', temporada: '2026/27',
  metodo: 'efectivo', nota: '', creado: null, creadoPor: 'x',
})

describe('reservas', () => {
  const rs = [
    reserva('r1', 'c1', '2027-01-01', '2027-01-15'),
    reserva('r2', 'c2', '2027-01-10', '2027-01-10', { estado: 'cancelada' }),
    reserva('r3', 'c3', '2027-01-05', '2027-01-20', { estado: 'pendiente' }),
  ]

  it('encuentra choques en la misma unidad e ignora canceladas y la propia', () => {
    expect(choques(rs, { unidadId: 'c1', desde: '2027-01-15', hasta: '2027-01-16' }).map((r) => r.id)).toEqual(['r1'])
    expect(choques(rs, { unidadId: 'c1', desde: '2027-01-15', hasta: '2027-01-16' }, 'r1')).toEqual([])
    expect(choques(rs, { unidadId: 'c2', desde: '2027-01-10', hasta: '2027-01-10' })).toEqual([])
  })

  it('arma la ocupación del día sin las canceladas', () => {
    const m = ocupacionDelDia(rs, '2027-01-10')
    expect([...m.keys()].sort()).toEqual(['c1', 'c3'])
  })

  it('lista unidades libres para un rango', () => {
    const us = [unidad('c1'), unidad('c2'), unidad('c3'), unidad('c4', 'carpa', false)]
    expect(unidadesLibres(us, rs, '2027-01-02', '2027-01-03').map((u) => u.id)).toEqual(['c2', 'c3'])
  })

  it('calcula saldo sin pasarse a negativo y en cero si está cancelada', () => {
    const pagado = pagadoPorReserva([pago('r1', 30_000), pago('r1', 20_000)])
    expect(pagado.get('r1')).toBe(50_000)
    expect(saldo(rs[0]!, 50_000)).toBe(50_000)
    expect(saldo(rs[0]!, 120_000)).toBe(0)
    expect(saldo(rs[1]!, 0)).toBe(0)
  })
})

describe('estadísticas', () => {
  it('resume la temporada', () => {
    const rs = [
      reserva('r1', 'c1', '2027-01-01', '2027-01-15'),
      reserva('r2', 'c2', '2027-01-01', '2027-01-15', { precio: 50_000 }),
      reserva('r3', 'c3', '2027-01-01', '2027-01-15', { estado: 'cancelada' }),
    ]
    const r = resumenTemporada(rs, [pago('r1', 100_000), pago('r2', 20_000)])
    expect(r).toEqual({ facturado: 150_000, cobrado: 120_000, pendiente: 30_000, reservas: 2, conDeuda: 1 })
  })

  it('agrupa cobros por mes de la temporada', () => {
    const meses = cobrosPorMes([pago('r', 10, '2027-01-02'), pago('r', 5, '2027-01-30'), pago('r', 7, '2026-12-01')], '2026/27')
    expect(meses.find((m) => m.mes === '2027-01')?.monto).toBe(15)
    expect(meses.find((m) => m.mes === '2026-12')?.monto).toBe(7)
  })

  it('cuenta ocupación por tipo sólo de unidades activas', () => {
    const us = [unidad('c1'), unidad('c2'), unidad('p1', 'palapa'), unidad('c9', 'carpa', false)]
    const rs = [reserva('r1', 'c1', '2027-01-01', '2027-01-15'), reserva('r2', 'c9', '2027-01-01', '2027-01-15')]
    expect(ocupacionPorTipo(us, rs, '2027-01-10')).toEqual([
      { tipo: 'carpa', ocupadas: 1, total: 2 },
      { tipo: 'palapa', ocupadas: 0, total: 1 },
    ])
  })

  it('calcula la conversión de consultas cerradas', () => {
    const c = (estado: Consulta['estado'], canal: Consulta['canal'] = 'whatsapp'): Consulta => ({
      nombre: '', contacto: '', canal, interes: 'carpa', fechas: '', mensaje: '', estado, clienteId: null,
      creado: null, creadoPor: 'x',
    })
    const e = embudoConsultas([c('nueva'), c('ganada'), c('ganada', 'instagram'), c('perdida')])
    expect(e.abiertas).toBe(1)
    expect(e.conversion).toBeCloseTo(2 / 3)
    expect(e.porCanal[0]).toEqual({ canal: 'whatsapp', total: 3 })
    expect(embudoConsultas([c('nueva')]).conversion).toBeNull()
  })
})
