/**
 * Link de WhatsApp para un teléfono cargado a mano. Los números argentinos se
 * escriben de mil formas ("2291 46-7001", "+54 9 2291…", "02291 15 467001");
 * wa.me pide 549 + característica + número, sin 0 ni 15.
 */
export function linkWhatsApp(telefono: string): string | null {
  let d = telefono.replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('549')) return `https://wa.me/${d}`
  if (d.startsWith('54')) d = d.slice(2)
  if (d.startsWith('0')) d = d.slice(1)
  // El 15 va después de la característica (2 a 4 dígitos); con 10 dígitos ya no está.
  if (d.length === 12) d = d.replace(/^(\d{2,4})15(\d{6,8})$/, (m, a: string, b: string) => (a.length + b.length === 10 ? a + b : m))
  if (d.length !== 10) return null
  return `https://wa.me/549${d}`
}
