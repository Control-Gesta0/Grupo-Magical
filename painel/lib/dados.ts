import { cmd, getJson, hgetall, hgetallJson, hsetMuitos, k, pipeline, setJson } from './kv'

/**
 * O que o painel guarda no Redis (tudo sob `magical:`):
 *   casas                  hash  locationId → {casa, base, nome}
 *   usuarios               hash  usuário → {nome, email}
 *   acesso:<casa>          json  usuários com acesso à casa no CRM
 *   etapas:<casa>          json  etapas de todos os funis da casa
 *   modo                   hash  casa → desligado | simulacao | ativo
 *   equipe:<casa>          hash  usuário → {ativo, desde}
 *   ultimo:<casa>:<r|s>    hash  usuário → quando recebeu o último lead pelo rodízio (real | simulado)
 *   atrib:<casa>           lista atribuições mais recentes primeiro
 *   atribc:<casa>:<contato> json atribuições recentes do contato (expira em 3 dias)
 *   mov:<casa>             hash  card → histórico de etapas
 *   lido:<casa>            hash  card → quando o histórico foi lido
 *   fatos:<casa>           json  números prontos para as telas (ver fatos.ts); versão em fatos-v
 *   sync:<casa>            json  última sincronização
 *   transf, transf:seq     hash  id → transferência
 *   alin:<casa>, alin:seq  lista contatos acertados para o dono dos cards
 */

export interface CasaInfo { location_id: string; casa: string; base: string; nome: string }

export async function casasSalvas(base?: string): Promise<CasaInfo[]> {
  const todas = Object.entries(await hgetallJson<Omit<CasaInfo, 'location_id'>>(k('casas')))
    .map(([location_id, c]) => ({ location_id, ...c }))
  return todas.filter(c => !base || c.base === base).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export async function casaSalva(lid: string): Promise<CasaInfo | null> {
  const v = await cmd<string | null>('HGET', k('casas'), lid)
  return v ? { location_id: lid, ...JSON.parse(v) } : null
}

export const salvarCasa = (c: CasaInfo) =>
  cmd('HSET', k('casas'), c.location_id, JSON.stringify({ casa: c.casa, base: c.base, nome: c.nome }))

export interface Usuario { nome: string | null; email: string | null }

export const usuarios = () => hgetallJson<Usuario>(k('usuarios'))

export const salvarUsuarios = (us: { id: string; nome: string | null; email: string | null }[]) =>
  hsetMuitos(k('usuarios'), us.map(u => [u.id, JSON.stringify({ nome: u.nome, email: u.email })]))

export const acessoDaCasa = async (lid: string) => (await getJson<string[]>(k('acesso', lid))) ?? []
export const salvarAcesso = (lid: string, ids: string[]) => setJson(k('acesso', lid), ids)

export interface Etapa {
  id: string; pipeline_id: string; pipeline_nome: string; principal: boolean; nome: string; chave: string | null; posicao: number | null
}
export const etapasDaCasa = async (lid: string) => (await getJson<Etapa[]>(k('etapas', lid))) ?? []
export const salvarEtapas = (lid: string, es: Etapa[]) => setJson(k('etapas', lid), es)

export interface Sincronizacao { inicio: number; fim: number | null; ok: boolean | null; detalhe: unknown }
export const ultimaSync = (lid: string) => getJson<Sincronizacao>(k('sync', lid))
export const salvarSync = (lid: string, s: Sincronizacao) => setJson(k('sync', lid), s)

// ---------- rodízio ----------

export type Modo = 'desligado' | 'simulacao' | 'ativo'

export async function modoDaCasa(lid: string): Promise<Modo> {
  return ((await cmd<string | null>('HGET', k('modo'), lid)) as Modo | null) ?? 'desligado'
}
export const definirModo = (lid: string, modo: Modo) => cmd('HSET', k('modo'), lid, modo)

export interface MembroSalvo { ativo: boolean; desde: number }
export const equipeSalva = (lid: string) => hgetallJson<MembroSalvo>(k('equipe', lid))

export async function salvarMembro(lid: string, usuario: string, m: Partial<MembroSalvo>) {
  const atual = await cmd<string | null>('HGET', k('equipe', lid), usuario)
  const novo: MembroSalvo = { ativo: true, desde: Date.now(), ...(atual ? JSON.parse(atual) : {}), ...m }
  await cmd('HSET', k('equipe', lid), usuario, JSON.stringify(novo))
}
export const removerMembro = (lid: string, usuario: string) => cmd('HDEL', k('equipe', lid), usuario)

export async function substituirEquipe(lid: string, us: string[]) {
  const agora = Date.now()
  await pipeline([
    ['DEL', k('equipe', lid)],
    ...(us.length ? [['HSET', k('equipe', lid), ...us.flatMap((u, i) => [u, JSON.stringify({ ativo: true, desde: agora + i })])]] : []),
  ])
}

export interface Atribuicao {
  em: number; contato_id: string; usuario_id: string | null; origem: string; simulada: boolean; detalhe?: unknown
}

const MAX_ATRIBUICOES = 5000

export async function registrarAtribuicao(lid: string, a: Atribuicao) {
  const chaveContato = k('atribc', lid, a.contato_id)
  const anteriores = (await getJson<Atribuicao[]>(chaveContato)) ?? []
  const cs: (string | number)[][] = [
    ['LPUSH', k('atrib', lid), JSON.stringify(a)],
    ['LTRIM', k('atrib', lid), 0, MAX_ATRIBUICOES - 1],
    ['SET', chaveContato, JSON.stringify([...anteriores, a]), 'EX', 3 * 86_400],
  ]
  if (a.usuario_id && a.origem !== 'manual') {
    cs.push(['HSET', k('ultimo', lid, a.simulada ? 's' : 'r'), a.usuario_id, a.em])
  }
  await pipeline(cs)
}

/** Atribuições recentes de um contato (até 3 dias). */
export const atribuicoesDoContato = async (lid: string, contato: string) =>
  (await getJson<Atribuicao[]>(k('atribc', lid, contato))) ?? []

export async function ultimasAtribuicoes(lid: string, n = MAX_ATRIBUICOES): Promise<Atribuicao[]> {
  return (await cmd<string[]>('LRANGE', k('atrib', lid), 0, n - 1)).map(x => JSON.parse(x))
}

/** Quando cada pessoa recebeu o último lead pelo rodízio. */
export async function ultimoPorPessoa(lid: string, simulada: boolean): Promise<Record<string, number>> {
  const h = await hgetall(k('ultimo', lid, simulada ? 's' : 'r'))
  return Object.fromEntries(Object.entries(h).map(([u, v]) => [u, Number(v)]))
}

// ---------- alinhamentos (contato acompanha o dono dos cards) ----------

export interface Alinhamento { id: number; contato_id: string; de: string | null; para: string; origem: string; em: number }

export async function registrarAlinhamento(lid: string, a: Omit<Alinhamento, 'id' | 'em'>) {
  const id = await cmd<number>('INCR', k('alin', 'seq'))
  await cmd('LPUSH', k('alin', lid), JSON.stringify({ ...a, id, em: Date.now() }))
}

export async function alinhamentosDaCasa(lid: string): Promise<Alinhamento[]> {
  return (await cmd<string[]>('LRANGE', k('alin', lid), 0, -1)).map(x => JSON.parse(x))
}

export async function removerAlinhamentos(lid: string, ids: Set<number>) {
  const todos = await alinhamentosDaCasa(lid)
  const ficam = todos.filter(a => !ids.has(a.id))
  await pipeline([
    ['DEL', k('alin', lid)],
    ...(ficam.length ? [['RPUSH', k('alin', lid), ...ficam.map(a => JSON.stringify(a))]] : []),
  ])
}
