import { db, migrar } from './db'
import { somarDias, somarMeses } from './util'

/**
 * Tudo aqui conta ENTRADAS em etapa, pelo histórico de movimentações, como a Núbia mede:
 * agendamento = card entrou em AGENDAMENTO; orçamento = cliente foi à casa (entrou em ORÇAMENTO/VISITA);
 * fechamento = entrou em FECHAMENTO. Cada oportunidade conta uma vez por etapa no período.
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

// Fechamento "pulou" = primeira entrada em FECHAMENTO no período sem nenhuma passagem por ORÇAMENTO/VISITA antes dela.
// Orçamento "sem agendamento" = entrada em ORÇAMENTO/VISITA sem nenhuma passagem por AGENDAMENTO antes dela
// (o vendedor marcou a visita mas deixou o card em qualificação).
const BASE = ({ ini, fim }: Periodo) => db()`
  with p as (
    select (${ini}::timestamp at time zone 'America/Sao_Paulo') as ini,
           (${fim}::timestamp at time zone 'America/Sao_Paulo') as fim
  ),
  funil as (select distinct pipeline_id from etapas where principal),
  opp as (select o.* from oportunidades o join funil f on f.pipeline_id = o.pipeline_id),
  -- primeira entrada de cada card em cada etapa no período, com quem era dono naquele momento
  entradas as (
    select distinct on (m.oportunidade_id, m.chave_para)
      m.oportunidade_id, m.location_id, m.chave_para as chave, m.em, coalesce(m.dono_na_hora, o.dono_id) as dono_id
    from movimentos m join opp o on o.id = m.oportunidade_id, p
    where m.chave_para in ('agendamento', 'orcamento', 'fechamento') and m.em >= p.ini and m.em < p.fim
    order by m.oportunidade_id, m.chave_para, m.em
  ),
  fech as (
    select oportunidade_id, location_id, em, dono_id from entradas where chave = 'fechamento'
  ),
  -- agendamento desfeito: entrou em AGENDAMENTO e, no mesmo dia, a mudança seguinte foi para trás ou para descartado
  desfeitos as (
    select x.oportunidade_id, x.location_id, x.em, x.dono_id, x.prox_em, x.prox_etapa
    from (
      select m.oportunidade_id, m.location_id, m.em, m.chave_para, coalesce(m.dono_na_hora, o.dono_id) as dono_id,
        lead(m.em) over w as prox_em, lead(m.chave_para) over w as prox_chave, lead(m.etapa_para) over w as prox_etapa
      from movimentos m join opp o on o.id = m.oportunidade_id
      where m.tipo in ('opportunity_created', 'opportunity_stage_updated')
        and m.oportunidade_id in (select oportunidade_id from entradas where chave = 'agendamento')
      window w as (partition by m.oportunidade_id order by m.em)
    ) x, p
    where x.chave_para = 'agendamento' and x.em >= p.ini and x.em < p.fim
      and x.prox_chave in ('novo_lead', 'ligacao', 'qualificacao', 'follow_up', 'descartado')
      and (x.prox_em at time zone 'America/Sao_Paulo')::date = (x.em at time zone 'America/Sao_Paulo')::date
  ),
  fech_class as (
    select f.*, exists (
      select 1 from movimentos m2 where m2.oportunidade_id = f.oportunidade_id
        and m2.chave_para = 'orcamento' and m2.em <= f.em) as passou
    from fech f
  ),
  orc_class as (
    select e.oportunidade_id, e.location_id, e.em, e.dono_id, exists (
      select 1 from movimentos m2 where m2.oportunidade_id = e.oportunidade_id
        and m2.chave_para = 'agendamento' and m2.em <= e.em) as passou
    from entradas e where e.chave = 'orcamento'
  )`

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
  await migrar()
  const sql = db()
  return sql<LinhaCasa[]>`
    ${BASE(periodo)}
    select c.location_id, c.casa, c.nome, c.base,
      (select count(*) from opp, p where opp.location_id = c.location_id and opp.criado_em >= p.ini and opp.criado_em < p.fim)::int as leads,
      (select count(*) from entradas e where e.location_id = c.location_id and e.chave = 'agendamento')::int as agendamentos,
      (select count(distinct d.oportunidade_id) from desfeitos d where d.location_id = c.location_id)::int as desfeitos,
      (select count(*) from entradas e where e.location_id = c.location_id and e.chave = 'orcamento')::int as orcamentos,
      (select count(*) from fech_class f where f.location_id = c.location_id)::int as fechamentos,
      (select count(*) from fech_class f where f.location_id = c.location_id and not f.passou)::int as pulou,
      (select count(*) from orc_class o where o.location_id = c.location_id and not o.passou)::int as orc_sem,
      (select count(*) from opp left join etapas e on e.id = opp.etapa_id
         where opp.location_id = c.location_id and opp.status = 'open' and opp.dono_id is null
           and e.chave is distinct from 'descartado')::int as sem_dono,
      (select count(*) from opp left join etapas e on e.id = opp.etapa_id
         where opp.location_id = c.location_id and opp.status = 'open' and opp.dono_id is not null
           and e.chave is distinct from 'descartado'
           and not exists (select 1 from usuario_casa uc where uc.location_id = c.location_id and uc.usuario_id = opp.dono_id))::int as dono_fora,
      (select count(*) from opp, p where opp.location_id = c.location_id and opp.ultima_mudanca_etapa >= p.ini
         and opp.historico_lido_em >= opp.ultima_mudanca_etapa)::int as historico_ok,
      (select count(*) from opp, p where opp.location_id = c.location_id and opp.ultima_mudanca_etapa >= p.ini)::int as historico_total,
      s.fim as ultima_sync, s.ok as sync_ok
    from casas c
    left join lateral (select fim, ok from sincronizacoes s where s.location_id = c.location_id and s.fim is not null
                       order by s.id desc limit 1) s on true
    where c.base = ${base}
    order by c.nome`
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
  await migrar()
  const sql = db()
  const lids = 'lid' in filtro
    ? [filtro.lid]
    : (await sql<{ location_id: string }[]>`select location_id from casas where base = ${filtro.base}`).map(r => r.location_id)
  if (!lids.length) return []
  return sql<LinhaVendedor[]>`
    ${BASE(periodo)},
    donos as (
      select distinct location_id, dono_id from opp where location_id in ${sql(lids)} and dono_id is not null
      union select distinct location_id, dono_id from entradas where location_id in ${sql(lids)} and dono_id is not null
      union select location_id, usuario_id from usuario_casa where location_id in ${sql(lids)}
    )
    select * from (
      select d.dono_id, u.nome, d.location_id, c.nome as casa,
        (select count(*) from opp, p where opp.location_id = d.location_id and opp.dono_id = d.dono_id and opp.criado_em >= p.ini and opp.criado_em < p.fim)::int as leads,
        (select count(*) from entradas e where e.location_id = d.location_id and e.dono_id = d.dono_id and e.chave = 'agendamento')::int as agendamentos,
        (select count(distinct x.oportunidade_id) from desfeitos x where x.location_id = d.location_id and x.dono_id = d.dono_id)::int as desfeitos,
        (select count(*) from entradas e where e.location_id = d.location_id and e.dono_id = d.dono_id and e.chave = 'orcamento')::int as orcamentos,
        (select count(*) from fech_class f where f.location_id = d.location_id and f.dono_id = d.dono_id)::int as fechamentos,
        (select count(*) from fech_class f where f.location_id = d.location_id and f.dono_id = d.dono_id and not f.passou)::int as pulou,
        (select count(*) from orc_class o where o.location_id = d.location_id and o.dono_id = d.dono_id and not o.passou)::int as orc_sem,
        (select count(*) from opp left join etapas e on e.id = opp.etapa_id where opp.location_id = d.location_id and opp.dono_id = d.dono_id
           and opp.status = 'open' and e.chave is distinct from 'descartado')::int as abertas,
        exists (select 1 from usuario_casa uc where uc.location_id = d.location_id and uc.usuario_id = d.dono_id) as na_casa,
        exists (select 1 from equipe eq where eq.location_id = d.location_id and eq.usuario_id = d.dono_id) as na_equipe,
        exists (select 1 from equipe eq where eq.location_id = d.location_id and eq.usuario_id = d.dono_id and not eq.ativo) as pausado
      from donos d join casas c on c.location_id = d.location_id left join usuarios u on u.id = d.dono_id
    ) x
    where na_equipe or leads + agendamentos + orcamentos + fechamentos + abertas > 0
    order by agendamentos desc, orcamentos desc, fechamentos desc, leads desc, nome`
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
  await migrar()
  const sql = db()
  const origem = tipo === 'fechamento' ? sql`fech_class` : sql`orc_class`
  return sql<FechamentoPulou[]>`
    ${BASE(periodo)}
    select o.id, o.nome, u.nome as dono, f.em,
      (select string_agg(coalesce(m.etapa_para, '?'), ' → ' order by m.em) from movimentos m
         where m.oportunidade_id = o.id and m.tipo in ('opportunity_created', 'opportunity_stage_updated')) as caminho
    from ${origem} f join opp o on o.id = f.oportunidade_id left join usuarios u on u.id = f.dono_id
    where f.location_id = ${lid} and not f.passou
    order by f.em desc`
}

export async function casa(lid: string) {
  await migrar()
  const [c] = await db()<{ location_id: string; casa: string; nome: string; base: string }[]>`
    select * from casas where location_id = ${lid}`
  return c ?? null
}

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
  await migrar()
  return db()<AgendamentoDesfeito[]>`
    ${BASE(periodo)}
    select d.oportunidade_id, d.location_id, c.nome as casa, o.nome as card, u.nome as vendedor, d.em, d.prox_em, d.prox_etapa
    from desfeitos d join casas c on c.location_id = d.location_id
      join opp o on o.id = d.oportunidade_id left join usuarios u on u.id = d.dono_id
    where c.base = ${base}
    order by d.em desc
    limit 200`
}
