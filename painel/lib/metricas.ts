import { db, migrar } from './db'

/**
 * Tudo aqui conta ENTRADAS em etapa, pelo histórico de movimentações, como a Núbia mede:
 * agendamento = card entrou em AGENDAMENTO; orçamento = cliente foi à casa (entrou em ORÇAMENTO/VISITA);
 * fechamento = entrou em FECHAMENTO. Cada oportunidade conta uma vez por etapa no período.
 */
export interface Periodo {
  ini: string // AAAA-MM-DD, horário de São Paulo
  duracao: '1 day' | '1 month'
}

export const periodoMes = (mes: string): Periodo => ({ ini: `${mes}-01`, duracao: '1 month' })
export const periodoDia = (data: string): Periodo => ({ ini: data, duracao: '1 day' })

// Fechamento "pulou" = primeira entrada em FECHAMENTO no período sem nenhuma passagem por ORÇAMENTO/VISITA antes dela.
const BASE = ({ ini, duracao }: Periodo) => db()`
  with p as (
    select (${ini}::timestamp at time zone 'America/Sao_Paulo') as ini,
           ((${ini}::timestamp + ${duracao}::interval) at time zone 'America/Sao_Paulo') as fim
  ),
  funil as (select distinct pipeline_id from etapas where principal),
  opp as (select o.* from oportunidades o join funil f on f.pipeline_id = o.pipeline_id),
  entradas as (
    select distinct m.oportunidade_id, m.location_id, m.chave_para as chave
    from movimentos m join opp o on o.id = m.oportunidade_id, p
    where m.chave_para in ('agendamento', 'orcamento', 'fechamento') and m.em >= p.ini and m.em < p.fim
  ),
  fech as (
    select m.oportunidade_id, m.location_id, min(m.em) as em
    from movimentos m join opp o on o.id = m.oportunidade_id, p
    where m.chave_para = 'fechamento' and m.em >= p.ini and m.em < p.fim
    group by 1, 2
  ),
  fech_class as (
    select f.*, exists (
      select 1 from movimentos m2 where m2.oportunidade_id = f.oportunidade_id
        and m2.chave_para = 'orcamento' and m2.em <= f.em) as passou
    from fech f
  )`

export interface LinhaCasa {
  location_id: string
  casa: string
  nome: string
  base: string
  leads: number
  agendamentos: number
  orcamentos: number
  fechamentos: number
  pulou: number
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
      (select count(*) from entradas e where e.location_id = c.location_id and e.chave = 'orcamento')::int as orcamentos,
      (select count(*) from fech_class f where f.location_id = c.location_id)::int as fechamentos,
      (select count(*) from fech_class f where f.location_id = c.location_id and not f.passou)::int as pulou,
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
  orcamentos: number
  fechamentos: number
  pulou: number
  abertas: number
  na_casa: boolean
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
      union select location_id, usuario_id from usuario_casa where location_id in ${sql(lids)}
    )
    select * from (
      select d.dono_id, u.nome, d.location_id, c.nome as casa,
        (select count(*) from opp, p where opp.location_id = d.location_id and opp.dono_id = d.dono_id and opp.criado_em >= p.ini and opp.criado_em < p.fim)::int as leads,
        (select count(*) from entradas e join opp o on o.id = e.oportunidade_id where e.location_id = d.location_id and o.dono_id = d.dono_id and e.chave = 'agendamento')::int as agendamentos,
        (select count(*) from entradas e join opp o on o.id = e.oportunidade_id where e.location_id = d.location_id and o.dono_id = d.dono_id and e.chave = 'orcamento')::int as orcamentos,
        (select count(*) from fech_class f join opp o on o.id = f.oportunidade_id where f.location_id = d.location_id and o.dono_id = d.dono_id)::int as fechamentos,
        (select count(*) from fech_class f join opp o on o.id = f.oportunidade_id where f.location_id = d.location_id and o.dono_id = d.dono_id and not f.passou)::int as pulou,
        (select count(*) from opp left join etapas e on e.id = opp.etapa_id where opp.location_id = d.location_id and opp.dono_id = d.dono_id
           and opp.status = 'open' and e.chave is distinct from 'descartado')::int as abertas,
        exists (select 1 from usuario_casa uc where uc.location_id = d.location_id and uc.usuario_id = d.dono_id) as na_casa
      from donos d join casas c on c.location_id = d.location_id left join usuarios u on u.id = d.dono_id
    ) x
    where leads + agendamentos + orcamentos + fechamentos + abertas > 0
    order by agendamentos desc, orcamentos desc, fechamentos desc, leads desc, nome`
}

export interface FechamentoPulou {
  id: string
  nome: string | null
  dono: string | null
  em: Date
  caminho: string | null
}

export async function fechamentosQuePularam(lid: string, periodo: Periodo): Promise<FechamentoPulou[]> {
  await migrar()
  const sql = db()
  return sql<FechamentoPulou[]>`
    ${BASE(periodo)}
    select o.id, o.nome, u.nome as dono, f.em,
      (select string_agg(coalesce(m.etapa_para, '?'), ' → ' order by m.em) from movimentos m
         where m.oportunidade_id = o.id and m.tipo in ('opportunity_created', 'opportunity_stage_updated')) as caminho
    from fech_class f join opp o on o.id = f.oportunidade_id left join usuarios u on u.id = o.dono_id
    where f.location_id = ${lid} and not f.passou
    order by f.em desc`
}

export async function casa(lid: string) {
  await migrar()
  const [c] = await db()<{ location_id: string; casa: string; nome: string; base: string }[]>`
    select * from casas where location_id = ${lid}`
  return c ?? null
}
