import { casas } from '@/lib/casas'
import { ghl } from '@/lib/ghl'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Simulação (só leitura, protegida pelo CRON_SECRET): contatos cujo dono é diferente do dono dos cards abertos.
// GET ?casa=<locationId>. Regra proposta: se todos os cards abertos do contato têm o mesmo dono, o contato passa a ele;
// se os cards abertos têm donos diferentes, é conflito e não se mexe.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }
  const casa = casas().find(c => c.locationId === new URL(req.url).searchParams.get('casa'))
  if (!casa) return Response.json({ erro: 'casa não encontrada' }, { status: 404 })
  const { locationId: lid, token } = casa
  try {
    const { users = [] } = await ghl<{ users: any[] }>(`/users/?locationId=${lid}`, token)
    const nome = (id: string | null) => (id ? users.find(u => u.id === id)?.name ?? `(fora da casa)` : '(sem dono)')

    // cards abertos, por contato
    const donosDoCard = new Map<string, Set<string>>()
    let url: string | null = `/opportunities/search?location_id=${lid}&status=open&limit=100`
    while (url) {
      const r: any = await ghl(url, token)
      for (const o of r.opportunities ?? []) {
        if (!o.contactId || !o.assignedTo) continue
        if (!donosDoCard.has(o.contactId)) donosDoCard.set(o.contactId, new Set())
        donosDoCard.get(o.contactId)!.add(o.assignedTo)
      }
      const m = r.meta ?? {}
      url = m.nextPage && m.startAfterId
        ? `/opportunities/search?location_id=${lid}&status=open&limit=100&startAfter=${m.startAfter}&startAfterId=${m.startAfterId}` : null
    }

    // dono de cada contato
    const donoDoContato = new Map<string, string | null>()
    let depois: string | null = ''
    for (let pagina = 0; depois !== null && pagina < 400; pagina++) {
      const r: any = await ghl(`/contacts/?locationId=${lid}&limit=100${depois}`, token)
      for (const c of r.contacts ?? []) donoDoContato.set(c.id, c.assignedTo ?? null)
      const m = r.meta ?? {}
      depois = (r.contacts?.length ?? 0) === 100 && m.startAfterId ? `&startAfterId=${m.startAfterId}&startAfter=${m.startAfter}` : null
    }

    let ok = 0, conflitos = 0
    const trocas = new Map<string, number>()
    const exemplos: string[] = []
    for (const [contato, donos] of donosDoCard) {
      if (donos.size > 1) { conflitos++; continue }
      const dono = [...donos][0]
      const atual = donoDoContato.has(contato) ? donoDoContato.get(contato)! : undefined
      if (atual === dono) { ok++; continue }
      const chave = `${atual === undefined ? '(contato não lido)' : nome(atual)} → ${nome(dono)}`
      trocas.set(chave, (trocas.get(chave) ?? 0) + 1)
      if (exemplos.length < 5) exemplos.push(contato)
    }
    return Response.json({
      casa: casa.nome, contatosComCardAberto: donosDoCard.size, contatosLidos: donoDoContato.size, jaCertos: ok, conflitos,
      aTrocar: [...trocas.values()].reduce((s, n) => s + n, 0),
      trocas: Object.fromEntries([...trocas].sort((a, b) => b[1] - a[1])), exemplos,
    })
  } catch (e: any) {
    return Response.json({ erro: String(e?.message ?? e).slice(0, 300) }, { status: 500 })
  }
}
