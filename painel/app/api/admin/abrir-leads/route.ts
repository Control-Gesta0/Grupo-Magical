import { casas } from '@/lib/casas'
import { ghl, ghlGravar } from '@/lib/ghl'
import { atribuirContato } from '@/lib/rodizio'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Abre card e passa pelo rodízio contatos que entraram sem passar pelo workflow (ex.: workflow em rascunho).
// Protegido pelo CRON_SECRET. POST ?casa=<locationId>&contatos=id1,id2[&aplicar=1]. Sem aplicar=1 só simula.
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }
  const q = new URL(req.url).searchParams
  const casa = casas().find(c => c.locationId === q.get('casa'))
  if (!casa) return Response.json({ erro: 'casa não encontrada' }, { status: 404 })
  const aplicar = q.get('aplicar') === '1'
  const ids = (q.get('contatos') ?? '').split(',').map(s => s.trim()).filter(Boolean)

  try {
    // funil principal = o que tem mais cards; etapa inicial = a de menor posição
    const { pipelines = [] } = await ghl<{ pipelines: any[] }>(`/opportunities/pipelines?locationId=${casa.locationId}`, casa.token)
    const contagem = new Map<string, number>()
    for (const p of pipelines) {
      const r = await ghl<{ meta?: { total?: number } }>(
        `/opportunities/search?location_id=${casa.locationId}&pipeline_id=${p.id}&limit=1`, casa.token)
      contagem.set(p.id, r.meta?.total ?? 0)
    }
    const funil = [...pipelines].sort((a, b) => (contagem.get(b.id) ?? 0) - (contagem.get(a.id) ?? 0))[0]
    const etapa = [...funil.stages].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))[0]

    const resultado = []
    for (const id of ids) {
      const { contact } = await ghl<{ contact: any }>(`/contacts/${id}`, casa.token)
      const nome = contact.contactName ?? [contact.firstName, contact.lastName].filter(Boolean).join(' ') ?? contact.phone
      const { opportunities = [] } = await ghl<{ opportunities: any[] }>(
        `/opportunities/search?location_id=${casa.locationId}&contact_id=${id}&status=open`, casa.token)
      const linha: Record<string, unknown> = { id, nome, donoAntes: contact.assignedTo ?? null, cardsAbertos: opportunities.length }
      if (aplicar) {
        if (!opportunities.length) {
          await ghlGravar('POST', '/opportunities/', casa.token, {
            pipelineId: funil.id, pipelineStageId: etapa.id, locationId: casa.locationId, contactId: id, name: nome, status: 'open',
          })
          linha.cardCriado = true
        }
        linha.rodizio = await atribuirContato(casa, id, 'reparo')
      }
      resultado.push(linha)
    }
    return Response.json({ casa: casa.nome, funil: funil.name, etapa: etapa.name, aplicado: aplicar, resultado })
  } catch (e: any) {
    return Response.json({ erro: String(e?.message ?? e).slice(0, 300) }, { status: 500 })
  }
}
