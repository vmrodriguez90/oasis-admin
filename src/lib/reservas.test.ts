import { describe, expect, it } from 'vitest'
import { choques, claveReserva, esPrincipal, ocupacionDelDia, pagadoDe, pagadoPorReserva, saldo, unidadesLibres } from './reservas'
import {
  anticipacion, clientesQueVuelven, duraciones, embudoConsultas, mejoresClientes, ocupacionDiaria, ocupacionPorTipo,
  resumenTemporada, ritmoDeVentas, ventasPorMes, ventasPorTipo,
} from './stats'
import type { ConId, Consulta, Pago, Reserva, Unidad } from './types'

const unidad = (id: string, tipo: Unidad['tipo'] = 'carpa', activa = true): ConId<Unidad> =>
  ({ id, codigo: id.toUpperCase(), tipo, sector: '', orden: 0, activa })

const reserva = (id: string, unidadId: string, desde: string, hasta: string, extra: Partial<Reserva> = {}): ConId<Reserva> => ({
  id, unidadId, unidadCodigo: unidadId, unidadTipo: 'carpa', clienteId: 'c', clienteNombre: 'C',
  desde, hasta, modalidad: 'dia', temporada: '2026/27', precio: 100_000, estado: 'confirmada', notas: '',
  origen: 'manual', externoId: null, saldoExterno: null, reservadaEl: null,
  creado: null, creadoPor: 'x', ...extra,
})

/** Importada: la principal lleva el saldo del sistema; las extras, null. */
const importada = (id: string, unidadId: string, desde: string, hasta: string, extra: Partial<Reserva> = {}) =>
  reserva(id, unidadId, desde, hasta, { origen: 'importada', externoId: id.split('-')[1], saldoExterno: 0, ...extra })

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

  it('en las importadas toma lo cobrado del sistema de reservas', () => {
    const principal = importada('imp-9-c1', 'c1', '2027-01-01', '2027-01-15', { precio: 500_000, saldoExterno: 200_000 })
    const cochera = importada('imp-9-co1', 'co1', '2027-01-01', '2027-01-15', { precio: 0, saldoExterno: null, unidadTipo: 'cochera' })
    const sinPagos = new Map<string, number>()
    expect(pagadoDe(principal, sinPagos)).toBe(300_000)
    expect(saldo(principal, pagadoDe(principal, sinPagos))).toBe(200_000)
    expect(pagadoDe(cochera, sinPagos)).toBe(0)
    expect([esPrincipal(principal), esPrincipal(cochera)]).toEqual([true, false])
    expect(claveReserva(principal)).toBe(claveReserva(cochera))
    // Pagó de más: saldo negativo en el sistema.
    expect(pagadoDe({ ...principal, saldoExterno: -20_000 }, sinPagos)).toBe(520_000)
  })
})

describe('estadísticas', () => {
  it('resume la temporada contando una vez cada reserva con varias unidades', () => {
    const rs = [
      reserva('r1', 'c1', '2027-01-01', '2027-01-15'),
      reserva('r2', 'c2', '2027-01-01', '2027-01-15', { precio: 50_000 }),
      reserva('r3', 'c3', '2027-01-01', '2027-01-15', { estado: 'cancelada' }),
      importada('imp-7-c4', 'c4', '2027-01-01', '2027-01-15', { precio: 400_000, saldoExterno: 100_000 }),
      importada('imp-7-co1', 'co1', '2027-01-01', '2027-01-15', { precio: 0, saldoExterno: null, unidadTipo: 'cochera' }),
      importada('imp-8-c5', 'c5', '2027-01-01', '2027-01-15', { precio: 90_000, saldoExterno: 60_000, estado: 'cancelada' }),
    ]
    const r = resumenTemporada(rs, [pago('r1', 100_000), pago('r2', 20_000)])
    expect(r).toEqual({ vendido: 550_000, cobrado: 450_000, pendiente: 130_000, reservas: 3, canceladas: 2, conDeuda: 2, sinImporte: 0 })
    const sinPrecio = resumenTemporada([reserva('r9', 'c9', '2027-01-01', '2027-01-01', { precio: 1 })], [])
    expect(sinPrecio.sinImporte).toBe(1)
  })

  it('cuenta ocupación por tipo sólo de unidades activas', () => {
    const us = [unidad('c1'), unidad('c2'), unidad('s1', 'sombrilla'), unidad('c9', 'carpa', false)]
    const rs = [reserva('r1', 'c1', '2027-01-01', '2027-01-15'), reserva('r2', 'c9', '2027-01-01', '2027-01-15')]
    expect(ocupacionPorTipo(us, rs, '2027-01-10')).toEqual([
      { tipo: 'carpa', ocupadas: 1, total: 2 },
      { tipo: 'sombrilla', ocupadas: 0, total: 1 },
    ])
  })

  it('arma la ocupación diaria de un tipo sin contar dos veces la misma unidad', () => {
    const us = [unidad('c1'), unidad('c2')]
    const rs = [
      reserva('r1', 'c1', '2027-01-01', '2027-01-03'),
      reserva('r2', 'c1', '2027-01-03', '2027-01-04'),
      reserva('r3', 'c2', '2027-01-02', '2027-01-02'),
      reserva('r4', 'c2', '2027-01-04', '2027-01-04', { estado: 'cancelada' }),
    ]
    expect(ocupacionDiaria(us, rs, 'carpa').map((d) => [d.dia, d.ocupadas])).toEqual([
      ['2027-01-01', 1], ['2027-01-02', 2], ['2027-01-03', 1], ['2027-01-04', 1],
    ])
    expect(ocupacionDiaria(us, rs, 'guorum')).toEqual([])
  })

  it('agrupa ventas por mes de reserva, con los meses sin ventas en cero', () => {
    const rs = [
      reserva('r1', 'c1', '2027-01-01', '2027-01-15', { reservadaEl: '2026-08-10' }),
      reserva('r2', 'c2', '2027-01-01', '2027-01-15', { reservadaEl: '2026-10-02', precio: 30_000 }),
      reserva('r3', 'c3', '2027-01-01', '2027-01-15', { reservadaEl: '2026-10-03', estado: 'cancelada' }),
      reserva('r4', 'c4', '2027-01-01', '2027-01-15'),
    ]
    expect(ventasPorMes(rs)).toEqual([
      { mes: '2026-08', monto: 100_000, reservas: 1 },
      { mes: '2026-09', monto: 0, reservas: 0 },
      { mes: '2026-10', monto: 30_000, reservas: 1 },
    ])
  })

  it('reparte ventas por tipo, duración y anticipación', () => {
    const rs = [
      reserva('r1', 'c1', '2027-01-01', '2027-01-01', { reservadaEl: '2027-01-01' }),
      reserva('r2', 'g1', '2027-01-01', '2027-01-15', { unidadTipo: 'guorum', precio: 300_000, reservadaEl: '2026-12-01' }),
      reserva('r3', 'c2', '2027-01-01', '2027-03-31', { reservadaEl: '2026-08-01' }),
      importada('imp-5-co1', 'co1', '2027-01-01', '2027-01-15', { precio: 0, saldoExterno: null, unidadTipo: 'cochera' }),
    ]
    expect(ventasPorTipo(rs)).toEqual([
      { tipo: 'carpa', monto: 200_000, unidades: 2 },
      { tipo: 'guorum', monto: 300_000, unidades: 1 },
      { tipo: 'cochera', monto: 0, unidades: 1 },
    ])
    expect(duraciones(rs).map((d) => d.reservas)).toEqual([1, 0, 0, 1, 1])
    const a = anticipacion(rs)
    expect(a.mediana).toBe(31)
    expect(a.rangos.map((x) => x.reservas)).toEqual([1, 0, 1, 1])
  })

  it('cuenta clientes que vuelven y los que más compraron', () => {
    const antes = [reserva('a1', 'c1', '2026-01-01', '2026-01-02', { clienteId: 'ana' })]
    const ahora = [
      reserva('r1', 'c1', '2027-01-01', '2027-01-02', { clienteId: 'ana', clienteNombre: 'Ana', precio: 50_000 }),
      reserva('r2', 'c2', '2027-01-01', '2027-01-02', { clienteId: 'beto', clienteNombre: 'Beto', precio: 80_000 }),
      reserva('r3', 'c3', '2027-02-01', '2027-02-02', { clienteId: 'ana', clienteNombre: 'Ana', precio: 40_000 }),
    ]
    expect(clientesQueVuelven(ahora, antes)).toEqual({ clientes: 2, vuelven: 1 })
    expect(mejoresClientes(ahora, 1)).toEqual([{ clienteId: 'ana', clienteNombre: 'Ana', monto: 90_000, reservas: 2 }])
  })

  it('compara el ritmo de ventas con el mismo día del año pasado', () => {
    const antes = [
      reserva('a1', 'c1', '2026-01-01', '2026-01-02', { reservadaEl: '2025-09-01', precio: 200_000 }),
      reserva('a2', 'c2', '2026-01-01', '2026-01-02', { reservadaEl: '2025-12-01' }),
    ]
    const ahora = [reserva('r1', 'c1', '2027-01-01', '2027-01-02', { reservadaEl: '2026-09-15', precio: 300_000 })]
    expect(ritmoDeVentas(ahora, antes, '2026-10-07')).toEqual({ actual: 300_000, anterior: 200_000 })
    expect(ritmoDeVentas(ahora, [], '2026-10-07')).toBeNull()
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
