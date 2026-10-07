import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AvisosProvider, SesionProvider, TemporadaProvider } from './sesion'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SesionProvider>
      <TemporadaProvider>
        <AvisosProvider>
          <App />
        </AvisosProvider>
      </TemporadaProvider>
    </SesionProvider>
  </StrictMode>,
)
