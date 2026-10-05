import { createHmac, scryptSync, timingSafeEqual, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'

const COOKIE = 'painel_sessao'
const DURACAO = 7 * 24 * 3600

/** admin: tudo, inclusive transferir cards. gestor (padrão): tudo menos transferências. */
type Perfil = 'admin' | 'gestor'
interface Usuario { email: string; nome: string; senha: string; perfil?: Perfil }
export interface Sessao { email: string; nome: string; admin: boolean }

function usuarios(): Usuario[] {
  return JSON.parse(process.env.PAINEL_USUARIOS || '[]')
}

function segredo() {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('SESSION_SECRET ausente ou curto (mínimo 32 caracteres)')
  return s
}

export function hashSenha(senha: string) {
  const sal = randomBytes(16).toString('hex')
  return `scrypt:${sal}:${scryptSync(senha, sal, 32).toString('hex')}`
}

function confere(senha: string, guardado: string) {
  const [alg, sal, hash] = guardado.split(':')
  if (alg !== 'scrypt' || !sal || !hash) return false
  const calc = scryptSync(senha, sal, 32)
  const esperado = Buffer.from(hash, 'hex')
  return esperado.length === calc.length && timingSafeEqual(calc, esperado)
}

const assinar = (v: string) => createHmac('sha256', segredo()).update(v).digest('hex')

export async function entrar(email: string, senha: string): Promise<boolean> {
  const u = usuarios().find(x => x.email.toLowerCase() === email.trim().toLowerCase())
  if (!u || !confere(senha, u.senha)) return false
  const valor = `${u.email}|${Math.floor(Date.now() / 1000) + DURACAO}`
  ;(await cookies()).set(COOKIE, `${valor}|${assinar(valor)}`, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: DURACAO,
  })
  return true
}

export async function sair() {
  ;(await cookies()).delete(COOKIE)
}

export async function usuarioAtual(): Promise<Sessao | null> {
  const bruto = (await cookies()).get(COOKIE)?.value
  if (!bruto) return null
  const [email, exp, assinatura] = bruto.split('|')
  const valor = `${email}|${exp}`
  const a = Buffer.from(assinatura ?? '', 'hex'), b = Buffer.from(assinar(valor), 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b) || Number(exp) * 1000 < Date.now()) return null
  const u = usuarios().find(x => x.email === email)
  return u ? { email: u.email, nome: u.nome, admin: u.perfil === 'admin' } : null
}
