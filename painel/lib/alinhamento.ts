import { equipeSalva, registrarAlinhamento } from './dados'
import { ghl, ghlGravar } from './ghl'
import type { Casa } from './casas'

/**
 * Regra da Magical: o dono do contato é o mesmo dos cards abertos dele (a vendedora só vê a conversa se for dona
 * do contato). Quando alguém troca só o dono do card no CRM, o contato fica para trás; aqui ele acompanha.
 * Só mexe quando todos os cards abertos do contato têm a mesma dona e ela ainda tem acesso à casa.
 * Cards de donas diferentes (conflito) ou com quem saiu da casa ficam para a gerência decidir.
 * Também não tira o contato de quem tem acesso à casa e não está no rodízio (agentes de IA, gerentes):
 * só move contato sem dono, de quem saiu da casa ou de outra pessoa do rodízio.
 */
export interface Resumo { contatos: number; alinhados: number; conflitos: number; foraDaCasa: number; protegidos: number }

/** Dono único dos cards abertos de cada contato (null = conflito). */
function donosPorContato(cards: { contactId?: string; assignedTo?: string; status?: string }[]) {
  const m = new Map<string, Set<string>>()
  for (const o of cards) {
    if (o.status !== 'open' || !o.contactId || !o.assignedTo) continue
    if (!m.has(o.contactId)) m.set(o.contactId, new Set())
    m.get(o.contactId)!.add(o.assignedTo)
  }
  return m
}

/**
 * Alinha os contatos indicados (ou todos, se `contatos` não vier) usando os cards abertos já lidos.
 * `donoAtual` evita uma leitura por contato quando o dono já é conhecido (varredura completa).
 */
export async function alinhar(casa: Casa, p: {
  cards: any[]; usuariosDaCasa: Set<string>; contatos?: Iterable<string>; donoAtual?: Map<string, string | null>
  aplicar: boolean; origem: string
}): Promise<Resumo & { trocas: { contato: string; de: string | null; para: string }[] }> {
  const donos = donosPorContato(p.cards)
  const alvo = p.contatos ? [...new Set(p.contatos)].filter(c => donos.has(c)) : [...donos.keys()]
  const rodizio = new Set(Object.keys(await equipeSalva(casa.locationId)))
  const r = { contatos: alvo.length, alinhados: 0, conflitos: 0, foraDaCasa: 0, protegidos: 0, trocas: [] as { contato: string; de: string | null; para: string }[] }
  for (const contato of alvo) {
    const ds = donos.get(contato)!
    if (ds.size > 1) { r.conflitos++; continue }
    const dono = [...ds][0]
    if (!p.usuariosDaCasa.has(dono)) { r.foraDaCasa++; continue }
    const atual = p.donoAtual?.has(contato)
      ? p.donoAtual.get(contato)!
      : (await ghl<{ contact: any }>(`/contacts/${contato}`, casa.token)).contact?.assignedTo ?? null
    if (atual === dono) continue
    // contato com alguém da casa que não está no rodízio (IA, gerente): não mexe
    if (atual && p.usuariosDaCasa.has(atual) && !rodizio.has(atual)) { r.protegidos++; continue }
    if (p.aplicar) {
      await ghlGravar('PUT', `/contacts/${contato}`, casa.token, { assignedTo: dono })
      await registrarAlinhamento(casa.locationId, { contato_id: contato, de: atual, para: dono, origem: p.origem })
    }
    r.alinhados++
    r.trocas.push({ contato, de: atual, para: dono })
  }
  return r
}

/** Varredura completa da casa: lê todos os cards abertos e o dono de todos os contatos direto do CRM. */
export async function varrerCasa(casa: Casa, aplicar: boolean) {
  const { locationId: lid, token } = casa
  const { users = [] } = await ghl<{ users: any[] }>(`/users/?locationId=${lid}`, token)
  const cards: any[] = []
  let url: string | null = `/opportunities/search?location_id=${lid}&status=open&limit=100`
  while (url) {
    const r: any = await ghl(url, token)
    cards.push(...(r.opportunities ?? []))
    const m = r.meta ?? {}
    url = m.nextPage && m.startAfterId
      ? `/opportunities/search?location_id=${lid}&status=open&limit=100&startAfter=${m.startAfter}&startAfterId=${m.startAfterId}` : null
  }
  const donoAtual = new Map<string, string | null>()
  let depois: string | null = ''
  for (let pagina = 0; depois !== null && pagina < 400; pagina++) {
    const r: any = await ghl(`/contacts/?locationId=${lid}&limit=100${depois}`, token)
    for (const c of r.contacts ?? []) donoAtual.set(c.id, c.assignedTo ?? null)
    const m = r.meta ?? {}
    depois = (r.contacts?.length ?? 0) === 100 && m.startAfterId ? `&startAfterId=${m.startAfterId}&startAfter=${m.startAfter}` : null
  }
  const nome = (id: string | null) => (id ? users.find(u => u.id === id)?.name ?? id : '(sem dono)')
  const r = await alinhar(casa, {
    cards: cards.map(o => ({ ...o, status: 'open' })), usuariosDaCasa: new Set(users.map(u => u.id)),
    donoAtual, aplicar, origem: 'varredura',
  })
  return { ...r, trocas: r.trocas.map(t => ({ ...t, de: nome(t.de), para: nome(t.para) })) }
}
