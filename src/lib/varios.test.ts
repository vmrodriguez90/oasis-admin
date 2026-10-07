import { describe, expect, it } from 'vitest'
import { aCSV } from './csv'
import { leerPesos } from './dinero'
import { linkWhatsApp } from './whatsapp'

describe('leerPesos', () => {
  it('acepta las formas en que se escribe un monto', () => {
    expect(leerPesos('150.000')).toBe(150_000)
    expect(leerPesos('$ 150000')).toBe(150_000)
    expect(leerPesos('99,6')).toBe(100)
    expect(leerPesos('abc')).toBeNull()
    expect(leerPesos('')).toBeNull()
  })
})

describe('linkWhatsApp', () => {
  it('normaliza teléfonos argentinos', () => {
    expect(linkWhatsApp('2291 46-7001')).toBe('https://wa.me/5492291467001')
    expect(linkWhatsApp('+54 9 2291 467001')).toBe('https://wa.me/5492291467001')
    expect(linkWhatsApp('02291 15 467001')).toBe('https://wa.me/5492291467001')
    expect(linkWhatsApp('011 15 2345 6789')).toBe('https://wa.me/5491123456789')
    expect(linkWhatsApp('+54 11 2345-6789')).toBe('https://wa.me/5491123456789')
    expect(linkWhatsApp('1234')).toBeNull()
    expect(linkWhatsApp('')).toBeNull()
  })
})

describe('aCSV', () => {
  it('escapa separadores y comillas', () => {
    const csv = aCSV([{ a: 'x;y', b: 'dijo "hola"' }], [['a', 'A'], ['b', 'B']])
    expect(csv).toBe('﻿A;B\r\n"x;y";"dijo ""hola"""')
  })
})
