import { definirModo, substituirEquipe, type Modo } from '@/lib/dados'

export const dynamic = 'force-dynamic'

/**
 * Manutenção (protegida pelo CRON_SECRET): define a equipe do rodízio e o modo de várias casas de uma vez.
 * Corpo: { casas: [{ locationId, usuarios: [userId], modo? }] }. Substitui a equipe inteira da casa.
 */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }
  try {
    const { casas = [] } = await req.json()
    const feito = []
    for (const c of casas as { locationId: string; usuarios: string[]; modo?: Modo }[]) {
      await substituirEquipe(c.locationId, c.usuarios)
      if (c.modo) await definirModo(c.locationId, c.modo)
      feito.push({ casa: c.locationId, pessoas: c.usuarios.length, modo: c.modo ?? null })
    }
    return Response.json({ ok: true, feito })
  } catch (e: any) {
    return Response.json({ ok: false, erro: String(e?.message ?? e).slice(0, 300) }, { status: 500 })
  }
}
