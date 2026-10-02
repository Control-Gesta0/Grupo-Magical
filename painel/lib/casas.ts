export type Base = 'vendas' | 'planejamento' | 'decoracao'

export interface Casa {
  casa: string
  nome: string
  base: Base
  locationId: string
  token: string
}

let cache: Casa[] | null = null

/** Contas GHL vindas de GHL_CASAS_JSON. A ordem define o índice usado pelo cron. */
export function casas(): Casa[] {
  if (cache) return cache
  const bruto = process.env.GHL_CASAS_JSON
  if (!bruto) throw new Error('GHL_CASAS_JSON não definida')
  cache = (JSON.parse(bruto) as Casa[]).map(c => ({ ...c, token: c.token.trim() }))
  return cache
}
