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
  const texto = bruto.trim().replace(/^GHL_CASAS_JSON\s*=\s*/, '')
  let lista: unknown
  try {
    lista = JSON.parse(texto)
  } catch (e: any) {
    // a mensagem do JSON.parse cita trechos do texto (que tem tokens); devolve só a posição
    const pos = /position (\d+)/.exec(String(e?.message))?.[1]
    throw new Error(`GHL_CASAS_JSON não é um JSON válido${pos ? ` (erro perto do caractere ${pos})` : ''}; começa com "${texto.slice(0, 2)}"`)
  }
  if (!Array.isArray(lista)) throw new Error('GHL_CASAS_JSON precisa ser uma lista [...]')
  const faltando = lista.findIndex((c: any) => !c?.casa || !c?.base || !c?.locationId || !c?.token)
  if (faltando >= 0) throw new Error(`GHL_CASAS_JSON: item ${faltando} sem casa, base, locationId ou token`)
  cache = (lista as Casa[]).map(c => ({ ...c, nome: c.nome || c.casa, token: c.token.trim() }))
  return cache
}
