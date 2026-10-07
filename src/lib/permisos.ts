import type { Rol } from './types'

// Espejo de firestore.rules, sólo para no mostrar botones que las reglas
// después rechazarían. La seguridad real está en las reglas, no acá.
export function puedeEditar(rol: Rol): boolean {
  return rol === 'admin' || rol === 'manager'
}

export function esAdmin(rol: Rol): boolean {
  return rol === 'admin'
}
