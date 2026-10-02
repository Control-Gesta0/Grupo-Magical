/**
 * Redistribui os cards abertos de uma pessoa entre outras da mesma casa (rodízio por etapa),
 * trocando o dono da oportunidade E do contato (é o dono do contato que enxerga a conversa).
 *
 *   npm run transferir -- --casa=chateau-do-lago/vendas --de=<userId> --para=<id1,id2,...> \
 *     --etapas=qualificacao,follow_up,agendamento,orcamento,fechamento [--aplicar]
 *
 * Sem --aplicar é simulação: não grava nada e salva a lista em transferencia-<casa>.csv.
 */
import { writeFileSync } from 'node:fs'
import { casas } from '../lib/casas'
import { chaveEtapa } from '../lib/etapas'

const API = 'https://services.leadconnectorhq.com'
const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1]
const aplicar = process.argv.includes('--aplicar')

async function ghl(metodo: string, caminho: string, token: string, corpo?: unknown): Promise<any> {
  for (let t = 0; ; t++) {
    const r = await fetch(API + caminho, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`, Version: '2021-07-28', Accept: 'application/json',
        'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (painel-magical)',
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
    if (r.ok) return r.json()
    if ((r.status === 429 || r.status >= 500) && t < 4) { await new Promise(s => setTimeout(s, 1500 * (t + 1))); continue }
    throw new Error(`${metodo} ${caminho} → ${r.status} ${(await r.text()).slice(0, 200)}`)
  }
}

async function main() {
  const [slug, base] = (arg('casa') ?? '').split('/')
  const casa = casas().find(c => c.casa === slug && c.base === (base || 'vendas'))
  const de = arg('de'), para = (arg('para') ?? '').split(',').filter(Boolean)
  const etapas = new Set((arg('etapas') ?? '').split(',').filter(Boolean))
  if (!casa || !de || !para.length || !etapas.size) throw new Error('faltam --casa, --de, --para ou --etapas')
  const { token, locationId: lid } = casa

  const { users } = await ghl('GET', `/users/?locationId=${lid}`, token)
  const nome = (id: string) => users.find((u: any) => u.id === id)?.name ?? id
  for (const id of para) if (!users.some((u: any) => u.id === id)) throw new Error(`${id} não é usuário de ${casa.nome}`)

  const { pipelines } = await ghl('GET', `/opportunities/pipelines?locationId=${lid}`, token)
  const etapaDe = new Map<string, string>()
  for (const p of pipelines) for (const s of p.stages) etapaDe.set(s.id, s.name)

  const cards: any[] = []
  let url: string | null = `/opportunities/search?location_id=${lid}&assigned_to=${de}&status=open&limit=100`
  while (url) {
    const r: any = await ghl('GET', url, token)
    cards.push(...r.opportunities)
    const m = r.meta ?? {}
    url = m.nextPage && m.startAfterId
      ? `/opportunities/search?location_id=${lid}&assigned_to=${de}&status=open&limit=100&startAfter=${m.startAfter}&startAfterId=${m.startAfterId}`
      : null
  }
  const alvo = cards.filter(o => o.assignedTo === de && etapas.has(chaveEtapa(etapaDe.get(o.pipelineStageId)) ?? ''))

  // rodízio dentro de cada etapa, do card mais recente para o mais antigo, para cada pessoa receber um mix igual
  const porEtapa = new Map<string, any[]>()
  for (const o of alvo) {
    const e = etapaDe.get(o.pipelineStageId)!
    porEtapa.set(e, [...(porEtapa.get(e) ?? []), o])
  }
  const plano: { o: any; etapa: string; novo: string }[] = []
  let i = 0
  for (const [etapa, lista] of porEtapa) {
    lista.sort((a, b) => (b.lastStageChangeAt ?? '').localeCompare(a.lastStageChangeAt ?? ''))
    for (const o of lista) plano.push({ o, etapa, novo: para[i++ % para.length] })
  }

  console.log(`${casa.nome}: ${cards.length} cards abertos de ${nome(de)}, ${plano.length} nas etapas escolhidas\n`)
  const resumo = new Map<string, Map<string, number>>()
  for (const p of plano) {
    const m = resumo.get(p.etapa) ?? new Map(); m.set(p.novo, (m.get(p.novo) ?? 0) + 1); resumo.set(p.etapa, m)
  }
  for (const [etapa, m] of resumo) console.log(etapa.padEnd(32), [...m].map(([u, n]) => `${nome(u)}: ${n}`).join(' · '))

  const csv = ['oportunidade_id;oportunidade;contato_id;etapa;dono_anterior;novo_dono', ...plano.map(p => [p.o.id, p.o.name, p.o.contactId, p.etapa, de, p.novo].join(';'))]
  writeFileSync(`transferencia-${casa.casa}.csv`, csv.join('\n'))
  if (!aplicar) { console.log(`\nSIMULAÇÃO: nada foi alterado. Lista em transferencia-${casa.casa}.csv`); return }

  let feitos = 0, contatos = 0
  for (const p of plano) {
    await ghl('PUT', `/opportunities/${p.o.id}`, token, { assignedTo: p.novo })
    if (p.o.contactId) {
      const { contact } = await ghl('GET', `/contacts/${p.o.contactId}`, token)
      if (!contact.assignedTo || contact.assignedTo === de) {
        await ghl('PUT', `/contacts/${p.o.contactId}`, token, { assignedTo: p.novo }); contatos++
      }
    }
    if (++feitos % 50 === 0) console.log(`${feitos}/${plano.length}`)
  }
  console.log(`\nAPLICADO: ${feitos} cards e ${contatos} contatos transferidos.`)
}
main().catch(e => { console.error(e.message); process.exit(1) })
