import { chaveEtapa } from './etapas'
import type { Etapa } from './dados'

/**
 * Os números das telas saem de um resumo por casa montado na sincronização ("fatos"), para cada tela
 * ler um JSON pequeno por casa em vez do histórico inteiro. Regras (como a Núbia mede):
 * - agendamento / orçamento / fechamento = ENTRADA do card na etapa, pelo histórico; conta uma vez por card
 *   e etapa no período (a primeira entrada dentro dele), atribuída a quem era dono do card naquele momento;
 * - fechamento "pulou" = sem nenhuma passagem por ORÇAMENTO/VISITA até ele;
 * - orçamento "sem agendamento" = sem nenhuma passagem por AGENDAMENTO até ele;
 * - agendamento desfeito = entrou em AGENDAMENTO e a mudança de etapa seguinte, no mesmo dia, voltou para
 *   uma etapa anterior ou para descartado.
 * Só entram os cards do funil principal de cada casa. Datas em segundos.
 */
export interface Movimento {
  id: string
  em: number // ms
  tipo: string | null
  de: string | null
  para: string | null
  chave: string | null
  status: string | null
  dono: string | null // dono do card quando a mudança foi lida
}

export type Entrada = [em: number, etapa: 'a' | 'o' | 'f', dono: number, passou: 0 | 1]
export type Desfeito = [em: number, proxEm: number, proxEtapa: string | null, dono: number]

export interface CardFato {
  id: string
  n: string | null
  e: Entrada[]
  x?: Desfeito[]
  /** caminho no funil, só dos cards que pularam etapa */
  k?: string
}

export interface Fatos {
  v: number
  /** dicionário dos donos: os números abaixo guardam o índice (-1 = sem dono) */
  donos: string[]
  /** pares [criado_em, dono] de cada card do funil principal */
  leads: number[]
  /** pares [última mudança de etapa, histórico lido 0/1] */
  hist: number[]
  /** cards abertos do funil principal (fora descartado) por dono */
  abertas: Record<string, number>
  semDono: number
  /** cards abertos de qualquer funil por dono (para achar quem saiu da casa e ainda tem cards) */
  abertasTodas: Record<string, number>
  acesso: string[]
  cards: CardFato[]
}

const LETRA: Record<string, 'a' | 'o' | 'f'> = { agendamento: 'a', orcamento: 'o', fechamento: 'f' }
const MUDANCA = new Set(['opportunity_created', 'opportunity_stage_updated'])
const VOLTA = new Set(['novo_lead', 'ligacao', 'qualificacao', 'follow_up', 'descartado'])
const s = (ms: number) => Math.floor(ms / 1000)
/** Dia em São Paulo (UTC−3, sem horário de verão). */
export const diaSP = (ms: number) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)

export function montarFatos(p: {
  opps: any[]; etapas: Etapa[]; acesso: string[]; movs: Record<string, Movimento[]>; lido: Record<string, number>
}): Fatos {
  const principal = new Set(p.etapas.filter(e => e.principal).map(e => e.pipeline_id))
  const chave = new Map(p.etapas.map(e => [e.id, e.chave]))
  const donos: string[] = []
  const indice = new Map<string, number>()
  const d = (u: string | null | undefined) => {
    if (!u) return -1
    let i = indice.get(u)
    if (i === undefined) { i = donos.length; donos.push(u); indice.set(u, i) }
    return i
  }
  const f: Fatos = { v: Date.now(), donos, leads: [], hist: [], abertas: {}, semDono: 0, abertasTodas: {}, acesso: p.acesso, cards: [] }

  for (const o of p.opps) {
    const dono: string | null = o.assignedTo || null
    const aberta = o.status === 'open' && chave.get(o.pipelineStageId) !== 'descartado'
    if (o.status === 'open' && dono) f.abertasTodas[dono] = (f.abertasTodas[dono] ?? 0) + 1
    if (!principal.has(o.pipelineId)) continue
    if (aberta) {
      if (dono) f.abertas[dono] = (f.abertas[dono] ?? 0) + 1
      else f.semDono++
    }
    if (o.createdAt) f.leads.push(s(Date.parse(o.createdAt)), d(dono))
    if (o.lastStageChangeAt) {
      const um = Date.parse(o.lastStageChangeAt)
      f.hist.push(s(um), (p.lido[o.id] ?? 0) >= um ? 1 : 0)
    }

    const ms = (p.movs[o.id] ?? []).slice().sort((a, b) => a.em - b.em)
    if (!ms.length) continue
    const card: CardFato = { id: o.id, n: o.name ?? null, e: [] }
    let pulou = false
    for (const m of ms) {
      const letra = m.chave ? LETRA[m.chave] : undefined
      if (!letra) continue
      const antes = letra === 'f' ? 'orcamento' : letra === 'o' ? 'agendamento' : null
      const passou = !antes || ms.some(m2 => m2.chave === antes && m2.em <= m.em) ? 1 : 0
      if (!passou) pulou = true
      card.e.push([s(m.em), letra, d(m.dono ?? dono), passou])
    }
    const mudancas = ms.filter(m => m.tipo && MUDANCA.has(m.tipo))
    mudancas.forEach((m, i) => {
      const prox = mudancas[i + 1]
      if (m.chave === 'agendamento' && prox && prox.chave && VOLTA.has(prox.chave) && diaSP(prox.em) === diaSP(m.em)) {
        (card.x ??= []).push([s(m.em), s(prox.em), prox.para, d(m.dono ?? dono)])
      }
    })
    if (pulou) card.k = mudancas.map(m => m.para ?? '?').join(' → ')
    if (card.e.length || card.x) f.cards.push(card)
  }
  return f
}

/** Converte uma movimentação lida do CRM. */
export function movimentoDoCrm(m: any, dono: string | null): Movimento {
  const a = m.activity
  return {
    id: m.id, em: Date.parse(m.dateAdded), tipo: a.type ?? null,
    de: a.data.stage?.oldStageName ?? null, para: a.data.stage?.newStageName ?? null,
    chave: chaveEtapa(a.data.stage?.newStageName), status: a.data.status ?? null, dono,
  }
}
