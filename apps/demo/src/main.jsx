import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './pwaUpdate'
// Leaflet's own CSS comes first: our map styles load later and win at equal specificity.
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.jsx'
import '@fontsource/manrope/index.css'
import '@fontsource/inter/index.css'
import '@fontsource/plus-jakarta-sans/index.css'
import 'material-symbols/outlined.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
