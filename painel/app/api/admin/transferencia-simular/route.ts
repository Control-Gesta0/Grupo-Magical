import { db } from '@/lib/db'
import { simularTransferencia } from '@/lib/transferencias'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Cria uma SIMULAÇÃO de transferência (não grava no CRM), que aparece na aba Transferências para confirmar.
// Protegido pelo CRON_SECRET. POST ?casa=&de=&para=rodizio|lista|<usuario>&destinos=a,b&etapa=follow_up&descartados=1
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }
  const q = new URL(req.url).searchParams
  try {
    const id = await simularTransferencia({
      lid: q.get('casa') ?? '', de: q.get('de') ?? '', para: q.get('para') ?? '', destinoCasa: null,
      incluirDescartados: q.get('descartados') === '1', etapa: q.get('etapa'),
      destinos: (q.get('destinos') ?? '').split(',').filter(Boolean), usuario: 'Control Gestão',
    })
    const [t] = await db()`select plano, total from transferencias where id = ${id}`
    return Response.json({ ok: true, id, total: t?.total, plano: t?.plano })
  } catch (e: any) {
    return Response.json({ erro: String(e?.message ?? e).slice(0, 300) }, { status: 500 })
  }
}
