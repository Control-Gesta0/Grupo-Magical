import { db, migrar } from './db'

export interface LinhaCasa {
  location_id: string
  casa: string
  nome: string
  base: string
  leads: number
  agendados: number
  visitas: number
  realizadas: number
  faltas: number
  canceladas: number
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

// Fechamento "pulou" = primeira entrada em FECHAMENTO no mês sem nenhuma passagem por ORÇAMENTO/VISITA antes dela.
const BASE = (mes: string) => db()`
  with p as (
    select (${mes + '-01'}::timestamp at time zone 'America/Sao_Paulo') as ini,
           ((${mes + '-01'}::timestamp + interval '1 month') at time zone 'America/Sao_Paulo') as fim
  ),
  funil as (select distinct pipeline_id from etapas where principal),
  opp as (select o.* from oportunidades o join funil f on f.pipeline_id = o.pipeline_id),
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

export async function resumoCasas(mes: string, base: string): Promise<LinhaCasa[]> {
  await migrar()
  const sql = db()
  return sql<LinhaCasa[]>`
    ${BASE(mes)}
    select c.location_id, c.casa, c.nome, c.base,
      (select count(*) from opp, p where opp.location_id = c.location_id and opp.criado_em >= p.ini and opp.criado_em < p.fim)::int as leads,
      (select count(*) from agendamentos a, p where a.location_id = c.location_id and a.criado_em >= p.ini and a.criado_em < p.fim)::int as agendados,
      (select count(*) from agendamentos a, p where a.location_id = c.location_id and a.inicio >= p.ini and a.inicio < p.fim and a.status is distinct from 'cancelled')::int as visitas,
      (select count(*) from visitas a, p where a.location_id = c.location_id and a.inicio >= p.ini and a.inicio < p.fim and a.virou_orcamento)::int as realizadas,
      (select count(*) from visitas a, p where a.location_id = c.location_id and a.inicio >= p.ini and a.inicio < p.fim and a.inicio < now() and not a.virou_orcamento)::int as faltas,
      (select count(*) from agendamentos a, p where a.location_id = c.location_id and a.inicio >= p.ini and a.inicio < p.fim and a.status = 'cancelled')::int as canceladas,
      (select count(distinct m.oportunidade_id) from movimentos m join opp o on o.id = m.oportunidade_id, p
         where m.location_id = c.location_id and m.chave_para = 'orcamento' and m.em >= p.ini and m.em < p.fim)::int as orcamentos,
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
  leads: number
  agendados: number
  visitas: number
  compareceu: number
  orcamentos: number
  fechamentos: number
  pulou: number
  abertas: number
  na_casa: boolean
}

export async function porVendedor(lid: string, mes: string): Promise<LinhaVendedor[]> {
  await migrar()
  const sql = db()
  return sql<LinhaVendedor[]>`
    ${BASE(mes)},
    donos as (
      select dono_id from opp where location_id = ${lid} and dono_id is not null
      union select usuario_id from usuario_casa where location_id = ${lid}
      union select dono_id from agendamentos where location_id = ${lid} and dono_id is not null
    )
    select * from (
      select d.dono_id, u.nome,
        (select count(*) from opp, p where opp.location_id = ${lid} and opp.dono_id = d.dono_id and opp.criado_em >= p.ini and opp.criado_em < p.fim)::int as leads,
        (select count(*) from agendamentos a, p where a.location_id = ${lid} and a.dono_id = d.dono_id and a.criado_em >= p.ini and a.criado_em < p.fim)::int as agendados,
        (select count(*) from visitas a, p where a.location_id = ${lid} and a.dono_id = d.dono_id and a.inicio >= p.ini and a.inicio < p.fim and a.inicio < now())::int as visitas,
        (select count(*) from visitas a, p where a.location_id = ${lid} and a.dono_id = d.dono_id and a.inicio >= p.ini and a.inicio < p.fim and a.virou_orcamento)::int as compareceu,
        (select count(distinct m.oportunidade_id) from movimentos m join opp o on o.id = m.oportunidade_id, p
           where m.location_id = ${lid} and o.dono_id = d.dono_id and m.chave_para = 'orcamento' and m.em >= p.ini and m.em < p.fim)::int as orcamentos,
        (select count(*) from fech_class f join opp o on o.id = f.oportunidade_id where f.location_id = ${lid} and o.dono_id = d.dono_id)::int as fechamentos,
        (select count(*) from fech_class f join opp o on o.id = f.oportunidade_id where f.location_id = ${lid} and o.dono_id = d.dono_id and not f.passou)::int as pulou,
        (select count(*) from opp left join etapas e on e.id = opp.etapa_id where opp.location_id = ${lid} and opp.dono_id = d.dono_id
           and opp.status = 'open' and e.chave is distinct from 'descartado')::int as abertas,
        exists (select 1 from usuario_casa uc where uc.location_id = ${lid} and uc.usuario_id = d.dono_id) as na_casa
      from donos d left join usuarios u on u.id = d.dono_id
    ) x
    where leads + agendados + orcamentos + fechamentos + abertas > 0
    order by fechamentos desc, orcamentos desc, leads desc`
}

export interface FechamentoPulou {
  id: string
  nome: string | null
  dono: string | null
  em: Date
  caminho: string | null
}

export async function fechamentosQuePularam(lid: string, mes: string): Promise<FechamentoPulou[]> {
  await migrar()
  const sql = db()
  return sql<FechamentoPulou[]>`
    ${BASE(mes)}
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

export interface DiaCasa {
  location_id: string
  nome: string
  agendados: number
  visitas: number
  realizadas: number
  faltas: number
  canceladas: number
}

export interface DiaPessoa {
  usuario_id: string | null
  nome: string | null
  casas: string
  agendados: number
}

// "Agendados no dia" conta pela data de criação e por quem criou (createdBy), não pelo dono da agenda.
const DIA = (data: string) => db()`
  with d as (
    select (${data}::timestamp at time zone 'America/Sao_Paulo') as ini,
           ((${data}::timestamp + interval '1 day') at time zone 'America/Sao_Paulo') as fim
  )`

export async function agendaDoDia(data: string, base: string) {
  await migrar()
  const sql = db()
  const casas = await sql<DiaCasa[]>`
    ${DIA(data)}
    select c.location_id, c.nome,
      (select count(*) from agendamentos a, d where a.location_id = c.location_id and a.criado_em >= d.ini and a.criado_em < d.fim)::int as agendados,
      (select count(*) from agendamentos a, d where a.location_id = c.location_id and a.inicio >= d.ini and a.inicio < d.fim and a.status is distinct from 'cancelled')::int as visitas,
      (select count(*) from visitas a, d where a.location_id = c.location_id and a.inicio >= d.ini and a.inicio < d.fim and a.virou_orcamento)::int as realizadas,
      (select count(*) from visitas a, d where a.location_id = c.location_id and a.inicio >= d.ini and a.inicio < d.fim and a.inicio < now() and not a.virou_orcamento)::int as faltas,
      (select count(*) from agendamentos a, d where a.location_id = c.location_id and a.inicio >= d.ini and a.inicio < d.fim and a.status = 'cancelled')::int as canceladas
    from casas c where c.base = ${base} order by c.nome`
  const pessoas = await sql<DiaPessoa[]>`
    ${DIA(data)}
    select coalesce(a.criado_por, a.dono_id) as usuario_id, u.nome,
      string_agg(distinct c.nome, ', ') as casas, count(*)::int as agendados
    from agendamentos a join casas c on c.location_id = a.location_id
      left join usuarios u on u.id = coalesce(a.criado_por, a.dono_id), d
    where c.base = ${base} and a.criado_em >= d.ini and a.criado_em < d.fim
    group by 1, 2 order by agendados desc, u.nome`
  const [sync] = await sql<{ fim: Date | null }[]>`
    select min(ultima) as fim from (
      select max(s.fim) as ultima from sincronizacoes s join casas c on c.location_id = s.location_id
      where c.base = ${base} and s.ok group by s.location_id) x`
  return { casas, pessoas, sincronizadoAte: sync?.fim ?? null }
}
