export function mesAtual() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date())
}

export function mesValido(m: string | undefined) {
  return m && /^\d{4}-\d{2}$/.test(m) ? m : mesAtual()
}

export function ultimosMeses(n = 12) {
  const [a, m] = mesAtual().split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - i, 1))
    return d.toISOString().slice(0, 7)
  })
}

export function nomeMes(m: string) {
  const [a, mm] = m.split('-').map(Number)
  const s = new Date(Date.UTC(a, mm - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function pct(parte: number, total: number) {
  return total ? `${Math.round((parte / total) * 100)}%` : '–'
}

export function dataHora(d: Date | string | null) {
  if (!d) return '–'
  return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export const BASES: Record<string, string> = { vendas: 'Vendas', planejamento: 'Planejamento', decoracao: 'Decoração' }

export function hoje() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

export function diaValido(d: string | undefined) {
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : hoje()
}

export function nomeDia(d: string) {
  const [a, m, dd] = d.split('-').map(Number)
  const s = new Date(Date.UTC(a, m - 1, dd, 12)).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Soma dias a uma data AAAA-MM-DD. */
export function somarDias(d: string, n: number) {
  const [a, m, dd] = d.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, dd + n)).toISOString().slice(0, 10)
}

/** Soma meses mantendo o dia (31 vira o último dia do mês quando ele é mais curto). */
export function somarMeses(d: string, n: number) {
  const [a, m, dd] = d.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m - 1 + n + 1, 0)).getUTCDate()
  return new Date(Date.UTC(a, m - 1 + n, Math.min(dd, ultimo))).toISOString().slice(0, 10)
}

export function dataCurta(d: string) {
  const [a, m, dd] = d.split('-')
  return `${dd}/${m}/${a}`
}

/** Variação contra o período anterior, como "+12%" ou "–5%". */
export function variacao(atual: number, antes: number) {
  if (!antes) return atual ? 'novo' : '–'
  const v = Math.round(((atual - antes) / antes) * 100)
  return `${v > 0 ? '+' : v < 0 ? '–' : ''}${Math.abs(v)}%`
}
