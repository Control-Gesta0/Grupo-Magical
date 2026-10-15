import { casas } from '@/lib/casas'
import { ghl, ghlGravar } from '@/lib/ghl'

export const dynamic = 'force-dynamic'

// Cria um usuário (Account / User) com acesso só à subconta informada. Protegido pelo CRON_SECRET.
// POST ?casa=<locationId>  corpo: { firstName, lastName, email, password }
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }
  const casa = casas().find(c => c.locationId === new URL(req.url).searchParams.get('casa'))
  if (!casa) return Response.json({ erro: 'casa não encontrada' }, { status: 404 })
  const { firstName, lastName, email, password } = await req.json()
  try {
    // não duplica: se o e-mail já tem acesso a esta subconta, só informa
    const { users = [] } = await ghl<{ users: any[] }>(`/users/?locationId=${casa.locationId}`, casa.token)
    const existente = users.find(u => u.email?.toLowerCase() === String(email).toLowerCase())
    if (existente) return Response.json({ ok: true, jaExistia: true, id: existente.id, nome: existente.name })
    const { location } = await ghl<{ location: any }>(`/locations/${casa.locationId}`, casa.token)
    const r = await ghlGravar<any>('POST', '/users/', casa.token, {
      companyId: location.companyId, firstName, lastName, email, password,
      type: 'account', role: 'user', locationIds: [casa.locationId],
    })
    return Response.json({ ok: true, id: r.id ?? r.user?.id, nome: r.name ?? `${firstName} ${lastName}` })
  } catch (e: any) {
    return Response.json({ ok: false, erro: String(e?.message ?? e).slice(0, 400) }, { status: 500 })
  }
}
