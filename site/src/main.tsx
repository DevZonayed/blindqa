import { StrictMode } from 'react'
import { hydrateRoot, createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

const root = document.getElementById('root')!
const app = <StrictMode><App /></StrictMode>
// pre-rendered in production (hydrate); empty in `vite dev` (render)
if (root.firstElementChild) hydrateRoot(root, app)
else createRoot(root).render(app)
