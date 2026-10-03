import { db, migrar } from '@/lib/db'
import { definirModo, type Modo } from '@/lib/rodizio'

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
    await migrar()
    const sql = db()
    const { casas = [] } = await req.json()
    const feito = []
    for (const c of casas as { locationId: string; usuarios: string[]; modo?: Modo }[]) {
      await sql.begin(async tx => {
        await tx`delete from equipe where location_id = ${c.locationId}`
        if (c.usuarios.length) {
          await tx`insert into equipe ${tx(c.usuarios.map(u => ({ location_id: c.locationId, usuario_id: u })))}`
        }
      })
      if (c.modo) await definirModo(c.locationId, c.modo)
      feito.push({ casa: c.locationId, pessoas: c.usuarios.length, modo: c.modo ?? null })
    }
    return Response.json({ ok: true, feito })
  } catch (e: any) {
    return Response.json({ ok: false, erro: String(e?.message ?? e).slice(0, 300) }, { status: 500 })
  }
}
