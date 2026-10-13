import { casas } from '@/lib/casas'
import { ghl } from '@/lib/ghl'

export const dynamic = 'force-dynamic'

// Diagnóstico (protegido pelo CRON_SECRET), só leitura e direto no CRM: contatos criados nas últimas horas,
// com o dono do contato e dos cards. GET ?casa=<locationId>&horas=6
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }
  const q = new URL(req.url).searchParams
  const casa = casas().find(c => c.locationId === q.get('casa'))
  if (!casa) return Response.json({ erro: 'casa não encontrada' }, { status: 404 })
  const desde = Date.now() - Number(q.get('horas') ?? 6) * 3600_000
  const { users = [] } = await ghl<{ users: any[] }>(`/users/?locationId=${casa.locationId}`, casa.token)
  const nome = (id: string | null) => (id ? users.find(u => u.id === id)?.name ?? id : null)
  const { contacts = [] } = await ghl<{ contacts: any[] }>(
    `/contacts/?locationId=${casa.locationId}&limit=100&sortBy=date_added&sortOrder=desc`, casa.token)
  const novos = contacts.filter(c => Date.parse(c.dateAdded) >= desde)
  const linhas = []
  for (const c of novos) {
    const { opportunities = [] } = await ghl<{ opportunities: any[] }>(
      `/opportunities/search?location_id=${casa.locationId}&contact_id=${c.id}`, casa.token)
    linhas.push({
      id: c.id, criado: c.dateAdded, origem: c.source ?? null, criadoPor: c.createdBy?.source ?? null,
      dono: nome(c.assignedTo ?? null),
      cards: opportunities.map(o => ({ etapa: o.pipelineStageId, dono: nome(o.assignedTo ?? null), criado: o.createdAt })),
    })
  }
  return Response.json({ casa: casa.nome, total: linhas.length, linhas })
}
