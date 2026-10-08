import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3, CalendarDays, LayoutGrid, LogOut, Menu, MessageCircle, ShieldCheck, Upload, Users, Wallet,
} from 'lucide-react'
import { salir, useUsuario } from '../sesion'
import { esAdmin } from '../lib/permisos'
import { ROLES } from '../lib/types'

export function Layout() {
  const yo = useUsuario()
  const [abierto, setAbierto] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setAbierto(false), [pathname])

  return (
    <div className={abierto ? 'app menu-abierto' : 'app'} onClick={(e) => {
      if (abierto && e.target === e.currentTarget) setAbierto(false)
    }}>
      <nav className="nav" aria-label="Secciones">
        <div className="nav-logo">
          <img src="/brand/imagotipo-horizontal-color.png" alt="OASIS Club de Mar" width={160} height={45} />
        </div>
        <NavLink to="/" end><BarChart3 size={18} />Estadísticas</NavLink>
        <NavLink to="/reservas"><CalendarDays size={18} />Reservas</NavLink>
        <NavLink to="/clientes"><Users size={18} />Clientes</NavLink>
        <NavLink to="/pagos"><Wallet size={18} />Pagos</NavLink>
        <NavLink to="/consultas"><MessageCircle size={18} />Consultas</NavLink>
        {esAdmin(yo.rol) && (
          <>
            <div className="nav-sep">Ajustes</div>
            <NavLink to="/unidades"><LayoutGrid size={18} />Unidades</NavLink>
            <NavLink to="/importar"><Upload size={18} />Importar</NavLink>
            <NavLink to="/equipo"><ShieldCheck size={18} />Equipo</NavLink>
          </>
        )}
        <div className="nav-pie">
          <strong title={yo.email}>{yo.nombre}</strong>
          {ROLES[yo.rol]}
          <button type="button" className="btn btn-sec btn-chico" style={{ marginTop: 10, width: '100%' }} onClick={() => salir()}>
            <LogOut size={15} />Salir
          </button>
        </div>
      </nav>

      <div style={{ minWidth: 0 }}>
        <div className="barra-movil">
          <img src="/brand/imagotipo-horizontal-color.png" alt="OASIS Club de Mar" width={110} height={31} />
          <button type="button" className="btn btn-sec btn-icono" aria-label="Menú" aria-expanded={abierto} onClick={() => setAbierto(true)}>
            <Menu size={20} />
          </button>
        </div>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
