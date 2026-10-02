import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './pwaUpdate'
// Leaflet's own CSS comes first: our map styles load later and win at equal specificity.
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
