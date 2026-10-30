import { modoDaCasa, ultimasAtribuicoes, usuarios } from '@/lib/dados'

export const dynamic = 'force-dynamic'

// Diagnóstico (protegido pelo CRON_SECRET): últimas atribuições do painel numa casa. GET ?casa=<locationId>
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }
  const lid = new URL(req.url).searchParams.get('casa') ?? ''
  const [modo, atribs, nomes] = await Promise.all([modoDaCasa(lid), ultimasAtribuicoes(lid, 50), usuarios()])
  const linhas = atribs.map(a => ({
    em: new Date(a.em), contato_id: a.contato_id, usuario: a.usuario_id ? nomes[a.usuario_id]?.nome ?? a.usuario_id : null,
    origem: a.origem, simulada: a.simulada, detalhe: a.detalhe ?? null,
  }))
  return Response.json({ modo, linhas })
}
