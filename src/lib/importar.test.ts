import { describe, expect, it } from 'vitest'
import {
  leerEstado, leerExport, leerFecha, leerMonto, leerUnidad, modalidadPorDias, planificar, prolijarNombre,
  type Existentes,
} from './importar'
import type { ConId, Reserva } from './types'

// Mismo formato que exporta el sistema (encabezados sueltos en <thead>, CRLF,
// «-» en las unidades extra), con datos inventados.
const fila = (c: string[]) => `<tr>${c.map((x) => `<td>${x}</td>`).join('\r\n')}</tr>`
const ARCHIVO = `<meta charset='utf-8'>\r\n<table>\r\n<thead>\r\n${
  ['#', 'Estado', 'Unidad', 'Cliente', 'E-mail', 'Teléfono', 'Desde', 'Hasta', 'Cant dias', 'Importe', 'Saldo', 'Fecha de reserva']
    .map((h) => `<th>${h}</th>`).join('\r\n')
}\r\n</thead>\r\n<tbody>\r\n${[
  ['900002', 'Confirmada', 'Carpa #8', 'ANA PÉREZ', 'Ana@Example.com', '2291 111111', '31/12/2026', '22/01/2027', '23', '1611000.00', '611000.00', '22/09/2026 19:39'],
  ['900002', 'Confirmada', 'Cochera #33', 'ANA PÉREZ', 'Ana@Example.com', '2291 111111', '31/12/2026', '22/01/2027', '23', '-', '-', '-'],
  ['900001', 'Pre-confirmada', 'Guarum #7', 'juan de la cruz', '', '223 555', '27/12/2026', '09/01/2027', '14', '1.00', '1.00', '20/09/2026 16:23'],
  ['900001', 'Pre-confirmada', 'Sombrilla #1', 'juan de la cruz', '', '223 555', '10/01/2027', '15/02/2027', '37', '-', '-', '-'],
  ['800001', 'Finalizada', 'Guarum #2', 'Beto Gómez', 'beto@example.com', '', '01/01/2026', '13/01/2026', '13', '900000.00', '-20000.00', '01/11/2025 10:00'],
  ['800001', 'Finalizada', 'Guarum #2', 'Beto Gómez', 'beto@example.com', '', '01/02/2026', '28/02/2026', '28', '-', '-', '-'],
  ['800002', 'Cancelada', 'Carpa #41', 'Ana Pérez', 'ana@example.com', '', '16/01/2026', '31/01/2026', '16', '360000.00', '360000.00', '02/11/2025 09:00'],
  ['800003', 'Finalizada', 'Yate #1', 'X', '', '', '01/01/2026', '01/01/2026', '1', '1000.00', '0.00', '02/11/2025 09:00'],
  ['800004', 'Finalizada', 'Carpa #1', 'Y', '', '', '31/02/2026', '01/03/2026', '1', '1000.00', '0.00', '02/11/2025 09:00'],
].map(fila).join('\r\n')}</tbody>\r\n</table>`

const vacio: Existentes = { unidades: [], clientes: [], reservas: [] }

describe('lectura del archivo', () => {
  it('lee fechas, montos, unidades y estados', () => {
    expect(leerFecha('22/09/2026 19:39')).toBe('2026-09-22')
    expect(leerFecha('31/02/2026')).toBeNull()
    expect(leerMonto('1611000.00')).toBe(1611000)
    expect(leerMonto('1.611.000,50')).toBe(1611001)
    expect(leerMonto('-')).toBeNull()
    expect(leerMonto('-20000.00')).toBe(-20000)
    expect(leerUnidad('Guarum #14')).toEqual({ tipo: 'guorum', numero: 14 })
    expect(leerUnidad('Sombrilla #1')).toEqual({ tipo: 'sombrilla', numero: 1 })
    expect(leerUnidad('Yate #1')).toBeNull()
    expect(leerEstado('Finalizada')).toBe('confirmada')
    expect(leerEstado('Pre-confirmada')).toBe('pendiente')
    expect(leerEstado('Cancelada')).toBe('cancelada')
    expect(leerEstado('Rara')).toBeNull()
  })

  it('arregla nombres en mayúsculas o minúsculas y deja los demás', () => {
    expect(prolijarNombre('LAURA GIMÉNEZ')).toBe('Laura Giménez')
    expect(prolijarNombre('juan de la cruz')).toBe('Juan de la Cruz')
    expect(prolijarNombre('MARÍA JOSÉ PEÑA-LÓPEZ')).toBe('María José Peña-López')
    expect(prolijarNombre('Sofía Ruiz - Papá')).toBe('Sofía Ruiz - Papá')
  })

  it('deduce la modalidad por los días', () => {
    expect([1, 7, 15, 23, 31, 121].map(modalidadPorDias)).toEqual(['dia', 'semana', 'quincena', 'mes', 'mes', 'temporada'])
  })

  it('lee el archivo, saltea fechas inválidas y propaga la fecha de reserva', () => {
    const l = leerExport(ARCHIVO)
    expect(l.errores).toEqual([])
    expect(l.filas).toHaveLength(8)
    expect(l.avisos).toEqual(['Fila 9 (#800004): fechas inválidas, se saltea.'])
    const cochera = l.filas.find((f) => f.unidad === 'Cochera #33')!
    expect(cochera.importe).toBeNull()
    expect(cochera.reservadaEl).toBe('2026-09-22')
  })

  it('rechaza un archivo sin tabla o sin las columnas necesarias', () => {
    expect(leerExport('hola').errores).toHaveLength(1)
    const sinUnidad = ARCHIVO.replace('<th>Unidad</th>', '<th>Otra</th>')
    expect(leerExport(sinUnidad).errores[0]).toMatch(/faltan columnas: unidad/)
  })
})

describe('plan de importación', () => {
  const { filas } = leerExport(ARCHIVO)

  it('crea unidades, clientes y una reserva por unidad', () => {
    const p = planificar(filas, vacio)
    expect(p.avisos).toEqual(['Fila 8 (#800003): no reconozco la unidad «Yate #1», se saltea.'])
    expect(p.unidadesNuevas.map((u) => u.codigo).sort()).toEqual(['C-08', 'C-41', 'CO-33', 'G-02', 'G-07', 'S-01'])
    // Ana con el email en mayúsculas y en minúsculas es la misma persona.
    expect(p.clientesNuevos.map((c) => c.nombre).sort()).toEqual(['Ana Pérez', 'Beto Gómez', 'Juan de la Cruz'])
    expect(p.crear).toHaveLength(7)
    expect(p.reservas).toBe(4)
    expect(p.temporadas).toEqual([{ temporada: '2026/27', reservas: 2 }, { temporada: '2025/26', reservas: 2 }])
  })

  it('pone importe y saldo sólo en la unidad principal', () => {
    const p = planificar(filas, vacio)
    const carpa = p.crear.find((r) => r.id === 'imp-900002-carpa-08')!
    const cochera = p.crear.find((r) => r.id === 'imp-900002-cochera-33')!
    expect(carpa).toMatchObject({ precio: 1611000, saldoExterno: 611000, estado: 'confirmada', modalidad: 'mes', externoId: '900002' })
    expect(cochera).toMatchObject({ precio: 0, saldoExterno: null, reservadaEl: '2026-09-22', clienteId: carpa.clienteId })
  })

  it('distingue dos tramos de la misma unidad en una reserva', () => {
    const p = planificar(filas, vacio)
    const tramos = p.crear.filter((r) => r.externoId === '800001').map((r) => [r.id, r.desde])
    expect(tramos).toEqual([['imp-800001-guorum-02', '2026-01-01'], ['imp-800001-guorum-02-2', '2026-02-01']])
  })

  it('al reimportar no duplica: actualiza sólo lo que cambió y respeta las notas', () => {
    const primera = planificar(filas, vacio)
    const guardadas: ConId<Reserva>[] = primera.crear.map((r) => ({
      ...r, creado: null, creadoPor: 'admin@oasis.test', notas: r.id === 'imp-900002-carpa-08' ? 'Pidió primera fila' : '',
    }))
    const ex: Existentes = {
      unidades: primera.unidadesNuevas,
      clientes: primera.clientesNuevos.map((c) => ({ ...c, creado: null, creadoPor: 'admin@oasis.test' })),
      reservas: guardadas,
    }
    const igual = planificar(filas, ex)
    expect([igual.crear.length, igual.actualizar.length, igual.sinCambios]).toEqual([0, 0, 7])
    expect(igual.unidadesNuevas).toEqual([])
    expect(igual.clientesNuevos).toEqual([])

    const pago = leerExport(ARCHIVO.replace('<td>611000.00</td>', '<td>0.00</td>')).filas
    const segunda = planificar(pago, ex)
    expect(segunda.actualizar.map((r) => [r.id, r.saldoExterno, r.notas])).toEqual([['imp-900002-carpa-08', 0, 'Pidió primera fila']])
  })

  it('reconoce unidades cargadas a mano por su código', () => {
    const p = planificar(filas, { ...vacio, unidades: [{ id: 'abc', codigo: 'C-08', tipo: 'carpa', sector: 'Fila 1', orden: 8, activa: true }] })
    expect(p.unidadesNuevas.some((u) => u.codigo === 'C-08')).toBe(false)
    expect(p.crear.find((r) => r.externoId === '900002' && r.unidadTipo === 'carpa')!.unidadId).toBe('abc')
  })
})
