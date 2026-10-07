import { casas } from '@/lib/casas'
import { ghl } from '@/lib/ghl'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

// campos comuns de toda mensagem; o que sobrar é o que o GHL gravou sobre o envio (erro, template, provedor)
const COMUNS = new Set(['id', 'body', 'locationId', 'contactId', 'conversationId', 'dateAdded', 'dateUpdated',
  'attachments', 'type', 'messageType', 'direction', 'status', 'source', 'userId', 'altId', 'contentType'])

// Diagnóstico (protegido pelo CRON_SECRET), só leitura: mensagens de WhatsApp que falharam numa casa e o motivo.
// GET ?casa=<locationId ou slug>&dias=3   ou   ?casa=...&contato=<contactId> para olhar um contato só
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }
  const q = new URL(req.url).searchParams
  const alvo = q.get('casa') ?? ''
  let lista
  try {
    lista = casas()
  } catch (e: any) {
    return Response.json({ erro: e.message }, { status: 500 })
  }
  const c = lista.find(x => x.locationId === alvo || x.casa === alvo)
  if (!c) return Response.json({ erro: 'casa não encontrada', casas: lista.map(x => x.casa) }, { status: 404 })
  const dias = Number(q.get('dias') ?? 3)
  const desde = Date.now() - dias * 86_400_000
  const contato = q.get('contato')
  const limite = Date.now() + 100_000

  try {
    const { conversations = [] } = await ghl<{ conversations: any[] }>(contato
      ? `/conversations/search?locationId=${c.locationId}&contactId=${contato}`
      : `/conversations/search?locationId=${c.locationId}&limit=100&sort=desc&sortBy=last_message_date`, c.token)
    const recentes = conversations.filter(v => contato || Number(v.lastMessageDate ?? 0) >= desde)

    const porStatus: Record<string, number> = {}
    const falhas: any[] = []
    let lidas = 0
    for (const conv of recentes) {
      if (Date.now() > limite) break
      const r: any = await ghl(`/conversations/${conv.id}/messages?limit=100`, c.token)
      lidas++
      for (const m of r.messages?.messages ?? []) {
        if (m.messageType !== 'TYPE_WHATSAPP' || (!contato && new Date(m.dateAdded).getTime() < desde)) continue
        const chave = `${m.direction}:${m.status}`
        porStatus[chave] = (porStatus[chave] ?? 0) + 1
        if (m.direction !== 'outbound' || !['failed', 'undelivered'].includes(m.status)) continue
        const extras = Object.fromEntries(Object.entries(m).filter(([k]) => !COMUNS.has(k)))
        falhas.push({
          em: m.dateAdded, status: m.status, origem: m.source ?? null, usuario: m.userId ?? null,
          contato: conv.fullName || conv.contactName || null, conversa: conv.id,
          texto: String(m.body ?? '').slice(0, 80), extras,
        })
      }
    }
    falhas.sort((a, b) => String(b.em).localeCompare(String(a.em)))
    return Response.json({
      casa: c.casa, dias, conversasNoPeriodo: recentes.length, conversasLidas: lidas,
      porStatus, totalFalhas: falhas.length, falhas: falhas.slice(0, 40),
    })
  } catch (e: any) {
    return Response.json({ casa: c.casa, erro: e.message }, { status: 500 })
  }
}
