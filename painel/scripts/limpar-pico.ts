/**
 * Limpa um cadastro em massa. Quando o WhatsApp de uma casa é reconectado, as conversas antigas do celular
 * viram contatos novos no GHL e cada um entra no workflow "Novo Lead" (card em NOVO LEAD + rodízio).
 * O script acha sozinho o pico de contatos criados quase ao mesmo tempo e, dos cards deles que continuam em
 * NOVO LEAD, tira o contato do workflow "Novo Lead", apaga o card e apaga a atribuição do rodízio no painel.
 * O contato e a conversa continuam no GHL (apagado, o contato pode voltar na próxima sincronização do WhatsApp
 * e disparar o workflow de novo). Card do pico que alguém já mexeu fica como está.
 *
 *   npm run limpar-pico -- --casa=fontana [--dias=3] [--intervalo=120] [--de=<ISO> --ate=<ISO>] [--workflow=<id>] [--aplicar]
 *
 * --intervalo: segundos sem contato novo que encerram o pico. --de/--ate: janela fixa (criação do contato).
 * Sem --aplicar é simulação: não grava nada e salva a lista em limpeza-<casa>.csv. Pode ser repetido.
 */
import { writeFileSync } from 'node:fs'
import { casas } from '../lib/casas'
import { chaveEtapa } from '../lib/etapas'
import { db } from '../lib/db'
import { dataHora } from '../lib/util'

const API = 'https://services.leadconnectorhq.com'
const MIN = 60_000, DIA = 86_400_000
const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3)
const aplicar = process.argv.includes('--aplicar')
const temBanco = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL)

async function ghl(metodo: 'GET' | 'DELETE', caminho: string, token: string): Promise<any> {
  for (let t = 0; ; t++) {
    const r = await fetch(API + caminho, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`, Version: '2021-07-28', Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (painel-magical)',
      },
    })
    if (r.ok) return r.json().catch(() => ({}))
    if (metodo === 'DELETE' && r.status === 404) return {} // já apagado numa rodada anterior
    if ((r.status === 429 || r.status >= 500) && t < 4) { await new Promise(s => setTimeout(s, 1500 * (t + 1))); continue }
    throw new Error(`${metodo} ${caminho} → ${r.status} ${(await r.text()).slice(0, 200)}`)
  }
}

/** Quatro chamadas ao mesmo tempo; erro em um item não para os outros. Devolve quantos falharam. */
async function emParalelo<T>(itens: T[], fn: (x: T) => Promise<unknown>): Promise<number> {
  const fila = [...itens]
  let feitos = 0, erros = 0
  const trabalhador = async () => {
    while (fila.length) {
      const x = fila.shift()!
      try { await fn(x) } catch (e: any) { if (++erros <= 3) console.error(`  ${e.message}`) }
      if (++feitos % 100 === 0) console.log(`  ${feitos}/${itens.length}`)
    }
  }
  await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()])
  return erros
}

async function main() {
  const [busca = '', base = 'vendas'] = (arg('casa') ?? '').toLowerCase().split('/')
  const daBase = casas().filter(c => c.base === base)
  const exata = daBase.filter(c => c.casa === busca)
  const achadas = exata.length ? exata : daBase.filter(c => busca && `${c.casa} ${c.nome}`.toLowerCase().includes(busca))
  if (achadas.length !== 1) {
    throw new Error(`--casa=${busca}: ${achadas.length ? `mais de uma casa (${achadas.map(c => c.casa).join(', ')})` : 'nenhuma casa'}`)
  }
  const casa = achadas[0]
  const { token, locationId: lid } = casa

  const { users = [] } = await ghl('GET', `/users/?locationId=${lid}`, token)
  const nomeUsuario = (id?: string) => (id && users.find((u: any) => u.id === id)?.name) || 'sem dono'
  const { pipelines = [] } = await ghl('GET', `/opportunities/pipelines?locationId=${lid}`, token)
  const nomeEtapa = new Map<string, string>()
  for (const p of pipelines) for (const s of p.stages) nomeEtapa.set(s.id, s.name)
  const emNovoLead = (o: any) => chaveEtapa(nomeEtapa.get(o.pipelineStageId)) === 'novo_lead'

  const opps: any[] = []
  let url: string | null = `/opportunities/search?location_id=${lid}&limit=100`
  while (url) {
    const r: any = await ghl('GET', url, token)
    opps.push(...(r.opportunities ?? []))
    const m = r.meta ?? {}
    url = m.nextPage && m.startAfterId
      ? `/opportunities/search?location_id=${lid}&limit=100&startAfter=${m.startAfter}&startAfterId=${m.startAfterId}`
      : null
  }
  const criado = (o: any) => Date.parse(o.createdAt)

  // o cadastro em massa aparece na criação do CONTATO (todos no mesmo minuto); o card pode sair minutos depois,
  // porque o workflow processa a fila aos poucos, e no meio dela pode cair um lead de verdade
  const dias = Number(arg('dias') ?? 3), intervalo = Number(arg('intervalo') ?? 120) * 1000
  const recentes = [...new Set(opps.filter(o => o.contactId && criado(o) > Date.now() - dias * DIA).map(o => o.contactId as string))]
  console.log(`Lendo a data de criação de ${recentes.length} contatos com card nos últimos ${dias} dias...`)
  const criadoContato = new Map<string, number>()
  const errosLeitura = await emParalelo(recentes, async c => {
    const { contact } = await ghl('GET', `/contacts/${c}`, token)
    if (contact?.dateAdded) criadoContato.set(c, Date.parse(contact.dateAdded))
  })
  if (errosLeitura) console.log(`  ${errosLeitura} contatos não puderam ser lidos e ficaram de fora`)

  // o pico: contatos criados com menos de --intervalo segundos entre um e outro; vale o maior grupo do período
  let ini: number, fim: number, outros: number[][] = []
  if (arg('de') && arg('ate')) {
    ini = Date.parse(arg('de')!); fim = Date.parse(arg('ate')!)
    if (Number.isNaN(ini) || Number.isNaN(fim)) throw new Error('--de/--ate precisam ser datas ISO (ex.: 2026-10-09T14:46:00Z)')
  } else {
    const grupos: number[][] = []
    for (const t of [...criadoContato.values()].sort((a, b) => a - b)) {
      const g = grupos.at(-1)
      if (g && t - g.at(-1)! <= intervalo) g.push(t)
      else grupos.push([t])
    }
    grupos.sort((a, b) => b.length - a.length)
    const maior = grupos[0] ?? []
    if (maior.length < 50) throw new Error(`nenhum cadastro em massa nos últimos ${dias} dias (maior grupo: ${maior.length} contatos)`)
    ini = maior[0]; fim = maior.at(-1)!
    outros = grupos.slice(1).filter(g => g.length >= 50)
  }

  const contatosDoPico = new Set([...criadoContato].filter(([, t]) => t >= ini && t <= fim).map(([c]) => c))
  const noPico = opps.filter(o => contatosDoPico.has(o.contactId))
  const apagar = noPico.filter(o => o.status === 'open' && emNovoLead(o))
  const manter = noPico.filter(o => !apagar.includes(o))
  // card antigo que o "Criar ou atualizar oportunidade" pode ter puxado de volta para NOVO LEAD depois do pico
  const voltaram = opps.filter(o => !contatosDoPico.has(o.contactId) && criado(o) < ini && emNovoLead(o) && o.lastStageChangeAt
    && Date.parse(o.lastStageChangeAt) >= ini && Date.parse(o.lastStageChangeAt) <= fim + 120 * MIN)

  const porDono = new Map<string, number>()
  for (const o of apagar) porDono.set(nomeUsuario(o.assignedTo), (porDono.get(nomeUsuario(o.assignedTo)) ?? 0) + 1)
  const cardsDe = noPico.map(criado).sort((a, b) => a - b)
  console.log(`${casa.nome}: ${contatosDoPico.size} contatos criados de uma vez entre ${dataHora(new Date(ini))} e ${dataHora(new Date(fim))}`)
  if (cardsDe.length) console.log(`Os cards deles foram criados entre ${dataHora(new Date(cardsDe[0]))} e ${dataHora(new Date(cardsDe.at(-1)!))}`)
  for (const g of outros) console.log(`Outro grupo grande: ${g.length} contatos entre ${dataHora(new Date(g[0]))} e ${dataHora(new Date(g.at(-1)!))} (use --de/--ate ou um --intervalo maior se for do mesmo cadastro)`)
  console.log(`\nApagar (continuam em NOVO LEAD): ${apagar.length}`)
  console.log(`  ${[...porDono].sort((a, b) => b[1] - a[1]).map(([n, q]) => `${n}: ${q}`).join(' · ')}`)
  console.log(`Manter (alguém já mexeu no card): ${manter.length}`)
  console.log(`Revisar (cards antigos que voltaram para NOVO LEAD durante o pico): ${voltaram.length}`)
  console.log(`Para repetir com a mesma janela: --de=${new Date(ini).toISOString()} --ate=${new Date(fim).toISOString()}`)

  const { workflows = [] } = await ghl('GET', `/workflows/?locationId=${lid}`, token)
  const candidatos = workflows.filter((w: any) => /novo lead/i.test(w.name ?? ''))
  const wf = arg('workflow')
    ? workflows.find((w: any) => w.id === arg('workflow'))
    : candidatos.length === 1 ? candidatos[0] : null
  console.log(wf
    ? `Workflow de onde os contatos saem: ${wf.name}`
    : `Workflow "Novo Lead" não identificado (${candidatos.map((w: any) => `${w.name} = ${w.id}`).join('; ') || 'nenhum com esse nome'}); passe --workflow=<id>`)

  const contatos = [...new Set(apagar.map(o => o.contactId).filter(Boolean))] as string[]
  const desdeAtribuicao = new Date(ini - 5 * MIN)
  if (temBanco && contatos.length) {
    const [{ n }] = await db()`select count(*)::int as n from atribuicoes
      where location_id = ${lid} and contato_id in ${db()(contatos)} and em >= ${desdeAtribuicao}`
    console.log(`Atribuições do rodízio no painel para esses contatos: ${n}`)
  }

  const linha = (acao: string, o: any) => [acao, o.id, o.createdAt, nomeEtapa.get(o.pipelineStageId) ?? '', o.status,
    nomeUsuario(o.assignedTo), o.contactId ?? '', String(o.name ?? '').replace(/[;\n]/g, ' ')].join(';')
  const csv = ['acao;oportunidade_id;criado_em;etapa;status;dono;contato_id;nome',
    ...apagar.map(o => linha('apagar', o)), ...manter.map(o => linha('manter', o)), ...voltaram.map(o => linha('revisar', o))]
  writeFileSync(`limpeza-${casa.casa}.csv`, csv.join('\n'))

  if (!aplicar) {
    console.log(`\nSIMULAÇÃO: nada foi alterado. Lista em limpeza-${casa.casa}.csv`)
    if (temBanco) await db().end()
    return
  }
  if (!wf) throw new Error('sem o workflow "Novo Lead" os follow-ups continuariam rodando; passe --workflow=<id>')

  // primeiro tira do workflow (para nenhum follow-up sair), depois apaga o card
  console.log(`\nTirando ${contatos.length} contatos do workflow ${wf.name}...`)
  const errosWf = await emParalelo(contatos, c => ghl('DELETE', `/contacts/${c}/workflow/${wf.id}`, token))
  console.log(`Apagando ${apagar.length} cards...`)
  const errosCard = await emParalelo(apagar, o => ghl('DELETE', `/opportunities/${o.id}`, token))
  let atribuicoes = 0
  if (temBanco && contatos.length) {
    atribuicoes = (await db()`delete from atribuicoes
      where location_id = ${lid} and contato_id in ${db()(contatos)} and em >= ${desdeAtribuicao}`).count
    await db().end()
  }
  console.log(`\nAPLICADO: ${apagar.length - errosCard} cards apagados, ${contatos.length - errosWf} contatos fora do workflow` +
    (temBanco ? `, ${atribuicoes} atribuições apagadas no painel` : ' (sem DATABASE_URL: atribuições do painel ficaram)') +
    (errosCard || errosWf ? `. Falhas: ${errosCard} cards, ${errosWf} workflow (rode de novo com a mesma janela)` : ''))
}
main().catch(async e => { console.error(e.message); if (temBanco) await db().end().catch(() => {}); process.exit(1) })
