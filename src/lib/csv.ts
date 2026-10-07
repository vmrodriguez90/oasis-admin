function celda(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * CSV con punto y coma y BOM: es lo que Excel en español abre directo, con
 * acentos y sin partir los montos que llevan coma decimal.
 */
export function aCSV(filas: Record<string, unknown>[], columnas: [clave: string, titulo: string][]): string {
  const head = columnas.map(([, t]) => celda(t)).join(';')
  const body = filas.map((f) => columnas.map(([k]) => celda(f[k])).join(';'))
  return '﻿' + [head, ...body].join('\r\n')
}

export function descargar(nombre: string, contenido: string): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}
