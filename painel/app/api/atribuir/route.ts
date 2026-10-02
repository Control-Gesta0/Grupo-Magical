import { casas } from '@/lib/casas'
import { atribuirContato } from '@/lib/rodizio'

export const dynamic = 'force-dynamic'

/**
 * Webhook do workflow "Novo Lead" de cada casa (ação Webhook, depois de "Criar ou atualizar oportunidade"):
 *   POST /api/atribuir?casa=<locationId>&chave=<ATRIBUIR_SECRET>
 * O corpo padrão do GHL traz contact_id; aceita também contactId/id.
 */
export async function POST(req: Request) {
  const url = new URL(req.url)
  const segredo = process.env.ATRIBUIR_SECRET
  if (!segredo || url.searchParams.get('chave') !== segredo) {
    return Response.json({ ok: false, erro: 'não autorizado' }, { status: 401 })
  }
  const corpo: any = await req.json().catch(() => ({}))
  const lid = url.searchParams.get('casa') ?? corpo?.location?.id ?? corpo?.locationId
  const contatoId = corpo?.contact_id ?? corpo?.contactId ?? corpo?.contact?.id ?? corpo?.id
  const casa = casas().find(c => c.locationId === lid)
  if (!casa || !contatoId) return Response.json({ ok: false, erro: 'casa ou contato ausente' }, { status: 400 })
  try {
    return Response.json(await atribuirContato(casa, String(contatoId)))
  } catch (e: any) {
    return Response.json({ ok: false, erro: String(e?.message ?? e).slice(0, 300) }, { status: 500 })
  }
}
