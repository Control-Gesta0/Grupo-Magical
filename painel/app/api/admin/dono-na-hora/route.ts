import { db, migrar } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Manutenção (protegida pelo CRON_SECRET): grava quem era dono nas movimentações antigas.
 * Corpo: { itens?: [{ id, dono, ate }], congelarRestante?: boolean }
 *  - itens: card transferido; movimentos antes de `ate` ficam com `dono` (o dono anterior à transferência)
 *  - congelarRestante: movimentos ainda sem dono_na_hora recebem o dono atual do card
 */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }
  await migrar()
  const sql = db()
  const { itens = [], congelarRestante = false } = await req.json()
  let atualizados = 0
  for (let i = 0; i < itens.length; i += 500) {
    const lote = itens.slice(i, i + 500).map((x: any) => ({ id: String(x.id), dono: String(x.dono), ate: new Date(x.ate) }))
    const r = await sql`
      update movimentos m set dono_na_hora = v.dono
      from (select * from json_to_recordset(${sql.json(lote as any)}) as t(id text, dono text, ate timestamptz)) v
      where m.oportunidade_id = v.id and m.em < v.ate and m.dono_na_hora is null`
    atualizados += r.count
  }
  let congelados = 0
  if (congelarRestante) {
    const r = await sql`
      update movimentos m set dono_na_hora = o.dono_id
      from oportunidades o where o.id = m.oportunidade_id and m.dono_na_hora is null and o.dono_id is not null`
    congelados = r.count
  }
  return Response.json({ ok: true, atualizados, congelados })
}
