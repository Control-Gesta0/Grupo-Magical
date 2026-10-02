import { casas } from '@/lib/casas'
import { sincronizarCasa } from '@/lib/sync'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// O cron chama /api/sync?i=N, uma conta por chamada, cada uma no seu minuto (vercel.json).
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }
  const i = Number(new URL(req.url).searchParams.get('i'))
  let lista
  try {
    lista = casas()
  } catch (e: any) {
    return Response.json({ ok: false, erro: e.message }, { status: 500 })
  }
  const c = lista[i]
  if (!Number.isInteger(i) || !c) return Response.json({ ok: true, ignorado: `sem conta no índice ${i}` })
  try {
    // deixa folga para fechar a função antes dos 300s
    return Response.json({ ok: true, ...(await sincronizarCasa(c, Date.now() + 230_000)) })
  } catch (e: any) {
    return Response.json({ ok: false, casa: c.casa, erro: e.message }, { status: 500 })
  }
}
