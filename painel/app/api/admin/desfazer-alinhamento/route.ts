import { casas } from '@/lib/casas'
import { db } from '@/lib/db'
import { ghl, ghlGravar } from '@/lib/ghl'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Devolve ao dono anterior os contatos alinhados (tabela alinhamentos). Protegido pelo CRON_SECRET.
// GET simula, POST aplica. ?casa=<locationId>&de=<usuario anterior>  (só desfaz se o contato ainda está com quem recebeu)
async function rodar(req: Request, aplicar: boolean) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }
  const q = new URL(req.url).searchParams
  const casa = casas().find(c => c.locationId === q.get('casa'))
  if (!casa) return Response.json({ erro: 'casa não encontrada' }, { status: 404 })
  const linhas = await db()<{ id: number; contato_id: string; de: string; para: string }[]>`
    select id, contato_id, de, para from alinhamentos
    where location_id = ${casa.locationId} and de = ${q.get('de')} and origem in ('varredura', 'automatico')`
  let devolvidos = 0, mudaramDepois = 0
  try {
    for (const l of linhas) {
      const { contact } = await ghl<{ contact: any }>(`/contacts/${l.contato_id}`, casa.token)
      if (contact?.assignedTo !== l.para) { mudaramDepois++; continue }
      if (aplicar) {
        await ghlGravar('PUT', `/contacts/${l.contato_id}`, casa.token, { assignedTo: l.de })
        await db()`insert into alinhamentos (location_id, contato_id, de, para, origem) values (${casa.locationId}, ${l.contato_id}, ${l.para}, ${l.de}, 'desfeito')`
        await db()`delete from alinhamentos where id = ${l.id}`
      }
      devolvidos++
    }
    return Response.json({ casa: casa.nome, aplicado: aplicar, registros: linhas.length, devolvidos, mudaramDepois })
  } catch (e: any) {
    return Response.json({ erro: String(e?.message ?? e).slice(0, 300), devolvidos }, { status: 500 })
  }
}

export const GET = (req: Request) => rodar(req, false)
export const POST = (req: Request) => rodar(req, true)
