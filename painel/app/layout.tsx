import './globals.css'
import type { ReactNode } from 'react'

export const metadata = { title: 'Painel de Gestão · Grupo Magical' }

export default function Raiz({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
