import { executarTransferencia, lerTransferencia } from '@/lib/transferencias'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Confirma (ou continua) uma transferência já simulada, como o botão da aba Transferências.
// Protegido pelo CRON_SECRET. POST ?id=<transferência>. GET ?id= mostra o progresso.
async function autorizado(req: Request) {
  return !!process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
}

export async function POST(req: Request) {
  if (!(await autorizado(req))) return Response.json({ erro: 'não autorizado' }, { status: 401 })
  const id = Number(new URL(req.url).searchParams.get('id'))
  await executarTransferencia(id)
  return Response.json({ ok: true, id })
}

export async function GET(req: Request) {
  if (!(await autorizado(req))) return Response.json({ erro: 'não autorizado' }, { status: 401 })
  const id = Number(new URL(req.url).searchParams.get('id'))
  const t = await lerTransferencia(id)
  return Response.json(t ? { id: t.id, status: t.status, total: t.total, feitos: t.feitos, erro: t.erro, atualizado_em: new Date(t.atualizado_em) } : { erro: 'não encontrada' })
}
