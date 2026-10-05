import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sair, usuarioAtual } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function Painel({ children }: { children: ReactNode }) {
  const u = await usuarioAtual()
  if (!u) redirect('/login')
  async function acaoSair() {
    'use server'
    await sair()
    redirect('/login')
  }
  return (
    <>
      <header className="topo">
        <Link href="/" className="marca">
          <img src="/logo-negativo.png" alt="Control Gestão" />
          <span>Painel de Gestão · Grupo Magical</span>
        </Link>
        <nav className="abas"><Link href="/dia">Dia</Link><Link href="/">Mês</Link><Link href="/equipe">Equipe</Link></nav>
        <span className="quem">{u.nome}</span>
        <form action={acaoSair}><button type="submit">Sair</button></form>
      </header>
      <main>{children}</main>
      <footer className="rodape">Control Gestão</footer>
    </>
  )
}
