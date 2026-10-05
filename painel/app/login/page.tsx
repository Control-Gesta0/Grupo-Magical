import { redirect } from 'next/navigation'
import { entrar } from '@/lib/auth'

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  async function acao(form: FormData) {
    'use server'
    const ok = await entrar(String(form.get('email') ?? ''), String(form.get('senha') ?? ''))
    redirect(ok ? '/dia' : '/login?erro=1')
  }
  return (
    <div className="tela-login">
      <form action={acao} className="login">
        <img className="logo-claro" src="/logo.png" alt="Control Gestão" />
        <img className="logo-escuro" src="/logo-negativo.png" alt="Control Gestão" />
        <h1>Painel de Gestão · Grupo Magical</h1>
        <input name="email" type="email" placeholder="E-mail" required autoFocus />
        <input name="senha" type="password" placeholder="Senha" required />
        {erro && <span className="erro">E-mail ou senha incorretos.</span>}
        <button type="submit">Entrar</button>
      </form>
    </div>
  )
}
