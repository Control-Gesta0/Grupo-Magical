import { casas } from '@/lib/casas'
import { varrerCasa } from '@/lib/alinhamento'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Contato acompanha o dono dos cards abertos (varredura completa da casa). Protegido pelo CRON_SECRET.
// GET ?casa=<locationId> simula; POST ?casa=<locationId> aplica e registra em "alinhamentos".
async function rodar(req: Request, aplicar: boolean) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }
  const casa = casas().find(c => c.locationId === new URL(req.url).searchParams.get('casa'))
  if (!casa) return Response.json({ erro: 'casa não encontrada' }, { status: 404 })
  try {
    const r = await varrerCasa(casa, aplicar)
    const resumo: Record<string, number> = {}
    for (const t of r.trocas) resumo[`${t.de} → ${t.para}`] = (resumo[`${t.de} → ${t.para}`] ?? 0) + 1
    return Response.json({ casa: casa.nome, aplicado: aplicar, contatos: r.contatos, alinhados: r.alinhados,
      conflitos: r.conflitos, foraDaCasa: r.foraDaCasa, protegidos: r.protegidos, trocas: resumo })
  } catch (e: any) {
    return Response.json({ erro: String(e?.message ?? e).slice(0, 300) }, { status: 500 })
  }
}

export const GET = (req: Request) => rodar(req, false)
export const POST = (req: Request) => rodar(req, true)
