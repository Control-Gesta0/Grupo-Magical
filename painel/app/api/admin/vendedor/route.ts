import { db, migrar } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Diagnóstico (protegido pelo CRON_SECRET), só leitura: por que um vendedor não aparece no placar.
// GET ?casa=<locationId>&nome=<parte do nome>&dias=7
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }
  await migrar()
  const sql = db()
  const q = new URL(req.url).searchParams
  const lid = q.get('casa') ?? ''
  const dias = Number(q.get('dias') ?? 7)
  const usuarios = await sql<{ id: string; nome: string }[]>`
    select u.id, u.nome, exists (select 1 from usuario_casa uc where uc.usuario_id = u.id and uc.location_id = ${lid}) as na_casa
    from usuarios u where u.nome ilike ${'%' + (q.get('nome') ?? '') + '%'}`
  const ids = usuarios.map(u => u.id)
  if (!ids.length) return Response.json({ usuarios })
  const desde = sql`now() - make_interval(days => ${dias})`

  // cards da casa que mudaram de etapa no período: o histórico foi lido e achou movimentação?
  const mudaram = await sql`
    select o.id, o.nome, o.ultima_mudanca_etapa, o.historico_lido_em, e.nome as etapa, u.nome as dono,
      (select count(*) from movimentos m where m.oportunidade_id = o.id and m.em > ${desde})::int as movimentos
    from oportunidades o left join etapas e on e.id = o.etapa_id left join usuarios u on u.id = o.dono_id
    where o.location_id = ${lid} and o.ultima_mudanca_etapa > ${desde}
    order by o.ultima_mudanca_etapa desc limit 40`
  const [cardsPorEtapa, entradas, agendamentosNoCardDeOutro, semHistorico, sync, funis] = await Promise.all([
    // cards da pessoa hoje, por funil e etapa
    sql`select e.pipeline_nome, e.principal, e.nome as etapa, e.chave, o.status, count(*)::int as n
        from oportunidades o left join etapas e on e.id = o.etapa_id
        where o.location_id = ${lid} and o.dono_id in ${sql(ids)}
        group by 1, 2, 3, 4, 5 order by 1, 3`,
    // entradas em agendamento/orçamento/fechamento no período, pelo histórico, com o dono gravado na hora
    sql`select m.em, m.etapa_de, m.etapa_para, m.chave_para, m.dono_na_hora = any(${ids}) as dela_na_hora,
          o.dono_id = any(${ids}) as dela_hoje, e.principal, o.nome
        from movimentos m join oportunidades o on o.id = m.oportunidade_id left join etapas e on e.id = o.etapa_id
        where m.location_id = ${lid} and m.em > ${desde} and m.chave_para in ('agendamento', 'orcamento', 'fechamento')
          and (m.dono_na_hora = any(${ids}) or o.dono_id = any(${ids}))
        order by m.em desc limit 60`,
    // cards dela hoje que entraram em agendamento no período com outro dono na hora
    sql`select count(*)::int as n from movimentos m join oportunidades o on o.id = m.oportunidade_id
        where m.location_id = ${lid} and m.em > ${desde} and m.chave_para = 'agendamento'
          and o.dono_id = any(${ids}) and m.dono_na_hora is not null and not (m.dono_na_hora = any(${ids}))`,
    // cards dela que mudaram de etapa no período mas o histórico ainda não foi lido
    sql`select count(*)::int as n,
          count(*) filter (where historico_lido_em is null)::int as nunca_lido
        from oportunidades where location_id = ${lid} and dono_id in ${sql(ids)}
          and ultima_mudanca_etapa > ${desde}
          and (historico_lido_em is null or ultima_mudanca_etapa > historico_lido_em)`,
    sql`select inicio, fim, ok, detalhe from sincronizacoes where location_id = ${lid} order by id desc limit 2`,
    sql`select distinct pipeline_id, pipeline_nome, principal from etapas where location_id = ${lid}`,
  ])
  return Response.json({ usuarios, mudaram, funis, cardsPorEtapa, entradas, agendamentosNoCardDeOutro, semHistorico, sync })
}
