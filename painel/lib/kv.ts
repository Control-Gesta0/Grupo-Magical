/**
 * Upstash Redis pela API REST (sem dependência). Tudo do painel fica sob o prefixo `magical:`,
 * porque o mesmo Redis guarda dados de outros projetos da Control Gestão: nunca usar chave fora dele.
 */
const PREFIXO = 'magical:'

type Valor = string | number
type Comando = Valor[]

function conexao() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  if (!url || !token) throw new Error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN não definidas')
  return { url: url.replace(/\/$/, ''), token }
}

async function enviar(caminho: string, corpo: unknown): Promise<any> {
  const { url, token } = conexao()
  for (let tentativa = 0; ; tentativa++) {
    const r = await fetch(url + caminho, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(corpo), cache: 'no-store',
    })
    if (r.ok) return r.json()
    if (tentativa >= 2 || (r.status < 500 && r.status !== 429)) {
      throw new Error(`Redis ${r.status}: ${(await r.text()).slice(0, 200)}`)
    }
    await new Promise(res => setTimeout(res, 500 * (tentativa + 1)))
  }
}

/** Chave completa (com prefixo). */
export const k = (...partes: string[]) => PREFIXO + partes.join(':')

export async function cmd<T = any>(...c: Comando): Promise<T> {
  const r = await enviar('', c.map(String))
  if (r.error) throw new Error(`Redis: ${r.error}`)
  return r.result as T
}

/** Vários comandos numa ida só (não é transação). Devolve os resultados na ordem. */
export async function pipeline(cs: Comando[]): Promise<any[]> {
  if (!cs.length) return []
  const r: any[] = await enviar('/pipeline', cs.map(c => c.map(String)))
  return r.map(x => {
    if (x.error) throw new Error(`Redis: ${x.error}`)
    return x.result
  })
}

/** Como `pipeline`, mas atômico (MULTI/EXEC). */
export async function transacao(cs: Comando[]): Promise<any[]> {
  if (!cs.length) return []
  const r: any[] = await enviar('/multi-exec', cs.map(c => c.map(String)))
  return r.map(x => {
    if (x.error) throw new Error(`Redis: ${x.error}`)
    return x.result
  })
}

export async function getJson<T>(chave: string): Promise<T | null> {
  const v = await cmd<string | null>('GET', chave)
  return v == null ? null : (JSON.parse(v) as T)
}

export const setJson = (chave: string, v: unknown) => cmd('SET', chave, JSON.stringify(v))

/** HGETALL em objeto, com os valores em JSON. */
export async function hgetallJson<T>(chave: string): Promise<Record<string, T>> {
  const l = await cmd<string[]>('HGETALL', chave)
  const o: Record<string, T> = {}
  for (let i = 0; i < l.length; i += 2) o[l[i]] = JSON.parse(l[i + 1])
  return o
}

export async function hgetall(chave: string): Promise<Record<string, string>> {
  const l = await cmd<string[]>('HGETALL', chave)
  const o: Record<string, string> = {}
  for (let i = 0; i < l.length; i += 2) o[l[i]] = l[i + 1]
  return o
}

/** HSET em lotes (cada pedido ao Upstash tem limite de tamanho). */
export async function hsetMuitos(chave: string, campos: [string, string][], lote = 400) {
  const cs: Comando[] = []
  for (let i = 0; i < campos.length; i += lote) cs.push(['HSET', chave, ...campos.slice(i, i + lote).flat()])
  for (let i = 0; i < cs.length; i += 10) await pipeline(cs.slice(i, i + 10))
}

/** Troca o conteúdo inteiro de um hash: grava numa chave temporária e renomeia (quem lê nunca vê pela metade). */
export async function hsubstituir(chave: string, campos: [string, string][]) {
  if (!campos.length) { await cmd('DEL', chave); return }
  const tmp = `${chave}:novo`
  await cmd('DEL', tmp)
  await hsetMuitos(tmp, campos)
  await cmd('RENAME', tmp, chave)
}

/** Trava simples entre instâncias (SET NX com validade). Espera até `esperaMs` para conseguir. */
export async function comTrava<T>(nome: string, fn: () => Promise<T>, esperaMs = 15_000): Promise<T> {
  const chave = k('trava', nome)
  const dono = Math.random().toString(36).slice(2)
  const limite = Date.now() + esperaMs
  while (!(await cmd('SET', chave, dono, 'NX', 'PX', 30_000))) {
    if (Date.now() > limite) throw new Error(`trava ocupada: ${nome}`)
    await new Promise(r => setTimeout(r, 150))
  }
  try {
    return await fn()
  } finally {
    if ((await cmd('GET', chave)) === dono) await cmd('DEL', chave)
  }
}
