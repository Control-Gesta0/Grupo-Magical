import { db, migrar } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Diagnóstico (protegido pelo CRON_SECRET): últimas atribuições do painel numa casa. GET ?casa=<locationId>
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }
  await migrar()
  const lid = new URL(req.url).searchParams.get('casa')
  const linhas = await db()`
    select a.em, a.contato_id, u.nome as usuario, a.origem, a.simulada, a.detalhe
    from atribuicoes a left join usuarios u on u.id = a.usuario_id
    where a.location_id = ${lid} order by a.id desc limit 50`
  return Response.json({ modo: (await db()`select modo from rodizio_config where location_id = ${lid}`)[0]?.modo ?? 'desligado', linhas })
}
