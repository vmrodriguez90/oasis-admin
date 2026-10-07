import { describe, expect, it } from 'vitest'
import {
  diasIncluidos, esFechaValida, hoy, mesesDeTemporada, sePisan, sumarDias, temporadaDe, temporadasAlrededor,
} from './fechas'

describe('fechas', () => {
  it('hoy usa la hora de Argentina, no la del navegador', () => {
    // 02:00 UTC del 1/1 todavía es 31/12 en Miramar (UTC-3).
    expect(hoy(new Date('2027-01-01T02:00:00Z'))).toBe('2026-12-31')
    expect(hoy(new Date('2027-01-01T03:00:00Z'))).toBe('2027-01-01')
  })

  it('suma días cruzando meses y años', () => {
    expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02')
    expect(sumarDias('2027-03-01', -1)).toBe('2027-02-28')
  })

  it('cuenta los días con ambas puntas', () => {
    expect(diasIncluidos('2027-01-01', '2027-01-01')).toBe(1)
    expect(diasIncluidos('2026-12-15', '2027-01-14')).toBe(31)
  })

  it('valida fechas reales', () => {
    expect(esFechaValida('2027-02-28')).toBe(true)
    expect(esFechaValida('2027-02-29')).toBe(false)
    expect(esFechaValida('27-02-01')).toBe(false)
  })

  it('detecta rangos que se pisan, incluido compartir un solo día', () => {
    const a = { desde: '2027-01-01', hasta: '2027-01-15' }
    expect(sePisan(a, { desde: '2027-01-15', hasta: '2027-01-20' })).toBe(true)
    expect(sePisan(a, { desde: '2027-01-16', hasta: '2027-01-20' })).toBe(false)
    expect(sePisan(a, { desde: '2026-12-01', hasta: '2027-02-01' })).toBe(true)
  })

  it('nombra la temporada por los dos años que cruza', () => {
    expect(temporadaDe('2026-12-20')).toBe('2026/27')
    expect(temporadaDe('2027-02-10')).toBe('2026/27')
    expect(temporadaDe('2027-07-01')).toBe('2027/28')
    expect(temporadaDe('2099-08-01')).toBe('2099/00')
  })

  it('lista temporadas y sus meses', () => {
    expect(temporadasAlrededor('2026/27')).toEqual(['2027/28', '2026/27', '2025/26', '2024/25'])
    const meses = mesesDeTemporada('2026/27')
    expect(meses[0]).toBe('2026-07')
    expect(meses[5]).toBe('2026-12')
    expect(meses[6]).toBe('2027-01')
    expect(meses).toHaveLength(12)
  })
})
