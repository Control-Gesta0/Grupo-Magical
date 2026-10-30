import { casaSalva, casasSalvas, equipeSalva, ultimaSync, usuarios, type CasaInfo } from './dados'
import type { CardFato, Entrada, Fatos } from './fatos'
import { cmd, k, pipeline } from './kv'
import { somarDias, somarMeses } from './util'

/**
 * Tudo aqui conta ENTRADAS em etapa, pelo histórico de movimentações, como a Núbia mede:
 * agendamento = card entrou em AGENDAMENTO; orçamento = cliente foi à casa (entrou em ORÇAMENTO/VISITA);
 * fechamento = entrou em FECHAMENTO. Cada oportunidade conta uma vez por etapa no período.
 * Os dados vêm do resumo por casa montado na sincronização (fatos.ts).
 */
export interface Periodo {
  ini: string // AAAA-MM-DD, horário de São Paulo
  fim: string // AAAA-MM-DD, exclusivo (o dia seguinte ao último)
}

export const periodoMes = (mes: string): Periodo => ({ ini: `${mes}-01`, fim: somarMeses(`${mes}-01`, 1) })
export const periodoDia = (data: string): Periodo => ({ ini: data, fim: somarDias(data, 1) })
/** De `de` até `ate`, os dois dias inclusive. */
export const periodoIntervalo = (de: string, ate: string): Periodo => ({ ini: de, fim: somarDias(ate, 1) })
/** As mesmas datas um mês antes (1 a 5 de outubro → 1 a 5 de setembro). */
export const periodoAnterior = (p: Periodo): Periodo => ({ ini: somarMeses(p.ini, -1), fim: somarMeses(p.fim, -1) })

/** Limites do período em segundos (meia-noite de São Paulo, UTC−3). */
const limites = (p: Periodo) => [Date.parse(`${p.ini}T00:00:00-03:00`) / 1000, Date.parse(`${p.fim}T00:00:00-03:00`) / 1000]

// cache por instância: o resumo de cada casa só muda quando ela sincroniza
const g = globalThis as unknown as { __fatos?: Map<string, Fatos> }
const cache = (g.__fatos ??= new Map())

async function fatosDas(lids: string[]): Promise<Map<string, Fatos>> {
  if (!lids.length) return new Map()
  const versoes = await cmd<(string | null)[]>('HMGET', k('fatos-v'), ...lids)
  const faltam = lids.filter((lid, i) => versoes[i] && cache.get(lid)?.v !== Number(versoes[i]))
  if (faltam.length) {
    const brutos = await pipeline(faltam.map(lid => ['GET', k('fatos', lid)]))
    faltam.forEach((lid, i) => { if (brutos[i]) cache.set(lid, JSON.parse(brutos[i])) })
  }
  return new Map(lids.flatMap(lid => (cache.has(lid) ? [[lid, cache.get(lid)!] as const] : [])))
}

interface EntradaNoPeriodo { card: CardFato; em: number; dono: string | null; passou: boolean }

/** Primeira entrada de cada card em cada etapa dentro do período. */
function entradas(f: Fatos, ini: number, fim: number) {
  const r = { a: [] as EntradaNoPeriodo[], o: [] as EntradaNoPeriodo[], f: [] as EntradaNoPeriodo[] }
  for (const card of f.cards) {
    const vistas = new Set<string>()
    for (const [em, etapa, dono, passou] of card.e as Entrada[]) {
      if (em < ini || em >= fim || vistas.has(etapa)) continue
      vistas.add(etapa)
      r[etapa].push({ card, em, dono: f.donos[dono] ?? null, passou: !!passou })
    }
  }
  return r
}

function desfeitos(f: Fatos, ini: number, fim: number) {
  const r: { card: CardFato; em: number; prox_em: number; prox_etapa: string | null; dono: string | null }[] = []
  for (const card of f.cards) {
    for (const [em, proxEm, proxEtapa, dono] of card.x ?? []) {
      if (em >= ini && em < fim) r.push({ card, em, prox_em: proxEm, prox_etapa: proxEtapa, dono: f.donos[dono] ?? null })
    }
  }
  return r
}

function contarLeads(f: Fatos, ini: number, fim: number) {
  const porDono = new Map<string | null, number>()
  let total = 0
  for (let i = 0; i < f.leads.length; i += 2) {
    if (f.leads[i] < ini || f.leads[i] >= fim) continue
    total++
    const dono = f.donos[f.leads[i + 1]] ?? null
    porDono.set(dono, (porDono.get(dono) ?? 0) + 1)
  }
  return { total, porDono }
}

export interface LinhaCasa {
  location_id: string
  casa: string
  nome: string
  base: string
  leads: number
  agendamentos: number
  desfeitos: number
  orcamentos: number
  fechamentos: number
  pulou: number
  orc_sem: number
  sem_dono: number
  dono_fora: number
  historico_ok: number
  historico_total: number
  ultima_sync: Date | null
  sync_ok: boolean | null
}

export async function resumoCasas(periodo: Periodo, base: string): Promise<LinhaCasa[]> {
  const lista = await casasSalvas(base)
  const [fatos, syncs] = await Promise.all([fatosDas(lista.map(c => c.location_id)), Promise.all(lista.map(c => ultimaSync(c.location_id)))])
  const [ini, fim] = limites(periodo)
  return lista.map((c, i) => {
    const f = fatos.get(c.location_id)
    const s = syncs[i]
    const linha: LinhaCasa = {
      ...c, leads: 0, agendamentos: 0, desfeitos: 0, orcamentos: 0, fechamentos: 0, pulou: 0, orc_sem: 0,
      sem_dono: 0, dono_fora: 0, historico_ok: 0, historico_total: 0,
      ultima_sync: s?.fim ? new Date(s.fim) : null, sync_ok: s?.ok ?? null,
    }
    if (!f) return linha
    const e = entradas(f, ini, fim)
    const acesso = new Set(f.acesso)
    linha.leads = contarLeads(f, ini, fim).total
    linha.agendamentos = e.a.length
    linha.desfeitos = new Set(desfeitos(f, ini, fim).map(x => x.card.id)).size
    linha.orcamentos = e.o.length
    linha.fechamentos = e.f.length
    linha.pulou = e.f.filter(x => !x.passou).length
    linha.orc_sem = e.o.filter(x => !x.passou).length
    linha.sem_dono = f.semDono
    linha.dono_fora = Object.entries(f.abertas).filter(([d]) => !acesso.has(d)).reduce((t, [, n]) => t + n, 0)
    for (let j = 0; j < f.hist.length; j += 2) {
      if (f.hist[j] < ini) continue
      linha.historico_total++
      linha.historico_ok += f.hist[j + 1]
    }
    return linha
  })
}

export interface LinhaVendedor {
  dono_id: string | null
  nome: string | null
  location_id: string
  casa: string
  leads: number
  agendamentos: number
  desfeitos: number
  orcamentos: number
  fechamentos: number
  pulou: number
  orc_sem: number
  abertas: number
  na_casa: boolean
  na_equipe: boolean
  pausado: boolean
}

/** Placar por vendedor (dono atual da oportunidade). Sem `lid`, traz todas as casas da base. */
export async function porVendedor(periodo: Periodo, filtro: { lid: string } | { base: string }): Promise<LinhaVendedor[]> {
  const lista: CasaInfo[] = 'lid' in filtro
    ? [await casaSalva(filtro.lid)].filter((c): c is CasaInfo => !!c)
    : await casasSalvas(filtro.base)
  if (!lista.length) return []
  const [fatos, nomes, equipes] = await Promise.all([
    fatosDas(lista.map(c => c.location_id)), usuarios(), Promise.all(lista.map(c => equipeSalva(c.location_id))),
  ])
  const [ini, fim] = limites(periodo)
  const linhas: LinhaVendedor[] = []
  lista.forEach((c, i) => {
    const f = fatos.get(c.location_id)
    if (!f) return
    const equipe = equipes[i]
    const e = entradas(f, ini, fim)
    const des = desfeitos(f, ini, fim)
    const leads = contarLeads(f, ini, fim).porDono
    const acesso = new Set(f.acesso)
    const donos = new Set<string>([
      ...Object.keys(f.abertas), ...f.acesso, ...Object.keys(equipe),
      ...[...e.a, ...e.o, ...e.f].map(x => x.dono).filter((x): x is string => !!x),
      ...[...leads.keys()].filter((x): x is string => !!x),
    ])
    for (const dono of donos) {
      const de = <T extends { dono: string | null }>(l: T[]) => l.filter(x => x.dono === dono)
      const l: LinhaVendedor = {
        dono_id: dono, nome: nomes[dono]?.nome ?? null, location_id: c.location_id, casa: c.nome,
        leads: leads.get(dono) ?? 0,
        agendamentos: de(e.a).length,
        desfeitos: new Set(de(des).map(x => x.card.id)).size,
        orcamentos: de(e.o).length,
        fechamentos: de(e.f).length,
        pulou: de(e.f).filter(x => !x.passou).length,
        orc_sem: de(e.o).filter(x => !x.passou).length,
        abertas: f.abertas[dono] ?? 0,
        na_casa: acesso.has(dono),
        na_equipe: dono in equipe,
        pausado: dono in equipe && !equipe[dono].ativo,
      }
      if (l.na_equipe || l.leads + l.agendamentos + l.orcamentos + l.fechamentos + l.abertas > 0) linhas.push(l)
    }
  })
  return linhas.sort((a, b) => b.agendamentos - a.agendamentos || b.orcamentos - a.orcamentos
    || b.fechamentos - a.fechamentos || b.leads - a.leads || (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'))
}

export interface FechamentoPulou {
  id: string
  nome: string | null
  dono: string | null
  em: Date
  caminho: string | null
}

/** Cards que pularam etapa: fechamento sem orçamento antes, ou orçamento sem agendamento antes. */
export async function quePularam(lid: string, periodo: Periodo, tipo: 'fechamento' | 'orcamento'): Promise<FechamentoPulou[]> {
  const [fatos, nomes] = await Promise.all([fatosDas([lid]), usuarios()])
  const f = fatos.get(lid)
  if (!f) return []
  const [ini, fim] = limites(periodo)
  const e = entradas(f, ini, fim)
  return (tipo === 'fechamento' ? e.f : e.o).filter(x => !x.passou)
    .sort((a, b) => b.em - a.em)
    .map(x => ({ id: x.card.id, nome: x.card.n, dono: x.dono ? nomes[x.dono]?.nome ?? null : null, em: new Date(x.em * 1000), caminho: x.card.k ?? null }))
}

export const casa = casaSalva

export interface AgendamentoDesfeito {
  oportunidade_id: string
  location_id: string
  casa: string
  card: string | null
  vendedor: string | null
  em: Date
  prox_em: Date
  prox_etapa: string | null
}

export async function agendamentosDesfeitos(periodo: Periodo, base: string): Promise<AgendamentoDesfeito[]> {
  const lista = await casasSalvas(base)
  const [fatos, nomes] = await Promise.all([fatosDas(lista.map(c => c.location_id)), usuarios()])
  const [ini, fim] = limites(periodo)
  return lista.flatMap(c => {
    const f = fatos.get(c.location_id)
    return f ? desfeitos(f, ini, fim).map(x => ({
      oportunidade_id: x.card.id, location_id: c.location_id, casa: c.nome, card: x.card.n,
      vendedor: x.dono ? nomes[x.dono]?.nome ?? null : null,
      em: new Date(x.em * 1000), prox_em: new Date(x.prox_em * 1000), prox_etapa: x.prox_etapa,
    })) : []
  }).sort((a, b) => +b.em - +a.em).slice(0, 200)
}

/** Donos de cards abertos (qualquer funil) que não têm mais acesso à casa. */
export async function donosSemAcesso(lid: string): Promise<string[]> {
  const f = (await fatosDas([lid])).get(lid)
  if (!f) return []
  const acesso = new Set(f.acesso)
  return Object.keys(f.abertasTodas).filter(d => !acesso.has(d))
}
