import { createRoot } from 'react-dom/client'
import { ContextMenuApp } from './ContextMenuApp'

import '../../index.css'


const container = document.querySelector('#context-menu-root')
if (container) {
  createRoot(container).render(
    <ContextMenuApp />
  )
}
