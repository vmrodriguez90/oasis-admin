import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Cargando } from './components/ui'
import { esAdmin } from './lib/permisos'
import { ClienteDetalle } from './pages/ClienteDetalle'
import { Clientes } from './pages/Clientes'
import { Consultas } from './pages/Consultas'
import { Equipo } from './pages/Equipo'
import { Estadisticas } from './pages/Estadisticas'
import { Login } from './pages/Login'
import { Pagos } from './pages/Pagos'
import { Reservas } from './pages/Reservas'
import { Sombras } from './pages/Sombras'
import { useSesion } from './sesion'

export function App() {
  const sesion = useSesion()
  if (sesion.estado === 'cargando') return <Cargando />
  if (sesion.estado !== 'dentro') return <Login sesion={sesion} />
  const admin = esAdmin(sesion.rol)
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Estadisticas />} />
          <Route path="reservas" element={<Reservas />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="clientes/:id" element={<ClienteDetalle />} />
          <Route path="pagos" element={<Pagos />} />
          <Route path="consultas" element={<Consultas />} />
          {admin && <Route path="sombras" element={<Sombras />} />}
          {admin && <Route path="equipo" element={<Equipo />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
