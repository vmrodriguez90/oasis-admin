const fmt = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
})

export function pesos(n: number): string {
  return fmt.format(n)
}

/** Acepta "150.000", "$ 150000" o "150000,50" y devuelve pesos enteros, o null. */
export function leerPesos(s: string): number | null {
  const limpio = s.replace(/[$\s.]/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null
  return Math.round(Number(limpio))
}

/** Para ejes y rótulos chicos: "$ 1,2 M", "$ 350 mil". */
export function pesosCorto(n: number): string {
  if (n >= 1_000_000) return `$ ${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`
  if (n >= 1_000) return `$ ${Math.round(n / 1_000).toLocaleString('es-AR')} mil`
  return `$ ${n.toLocaleString('es-AR')}`
}
