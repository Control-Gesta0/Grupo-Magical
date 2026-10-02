import { redirect } from 'next/navigation'
import { entrar } from '@/lib/auth'

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  async function acao(form: FormData) {
    'use server'
    const ok = await entrar(String(form.get('email') ?? ''), String(form.get('senha') ?? ''))
    redirect(ok ? '/' : '/login?erro=1')
  }
  return (
    <form action={acao} className="login">
      <h1>Painel de Gestão · Grupo Magical</h1>
      <input name="email" type="email" placeholder="E-mail" required autoFocus />
      <input name="senha" type="password" placeholder="Senha" required />
      {erro && <span className="erro">E-mail ou senha incorretos.</span>}
      <button type="submit">Entrar</button>
    </form>
  )
}
