import { db, migrar } from './db'
import { ghl, ghlGravar } from './ghl'
import { chaveEtapa } from './etapas'
import type { Casa } from './casas'

export type Modo = 'desligado' | 'simulacao' | 'ativo'

export async function modoDaCasa(lid: string): Promise<Modo> {
  await migrar()
  const [r] = await db()<{ modo: Modo }[]>`select modo from rodizio_config where location_id = ${lid}`
  return r?.modo ?? 'desligado'
}

export async function definirModo(lid: string, modo: Modo) {
  await migrar()
  await db()`insert into rodizio_config (location_id, modo) values (${lid}, ${modo})
    on conflict (location_id) do update set modo = excluded.modo`
}

export interface Membro {
  usuario_id: string
  nome: string | null
  ativo: boolean
  recebidos_7d: number
  ultimo: Date | null
  tem_acesso: boolean
}

/** Equipe do rodízio com o que cada um recebeu pelo painel nos últimos 7 dias (no modo atual). */
export async function equipeDaCasa(lid: string, simulada: boolean): Promise<Membro[]> {
  await migrar()
  return db()<Membro[]>`
    select e.usuario_id, u.nome, e.ativo,
      (select count(*) from atribuicoes a where a.location_id = e.location_id and a.usuario_id = e.usuario_id
         and a.simulada = ${simulada} and a.origem <> 'manual' and a.em > now() - interval '7 days')::int as recebidos_7d,
      (select max(em) from atribuicoes a where a.location_id = e.location_id and a.usuario_id = e.usuario_id and a.simulada = ${simulada}
         and a.origem <> 'manual') as ultimo,
      exists (select 1 from usuario_casa uc where uc.location_id = e.location_id and uc.usuario_id = e.usuario_id) as tem_acesso
    from equipe e left join usuarios u on u.id = e.usuario_id
    where e.location_id = ${lid}
    order by e.ativo desc, u.nome`
}

export async function incluirNaEquipe(lid: string, usuarioId: string) {
  await migrar()
  await db()`insert into equipe (location_id, usuario_id) values (${lid}, ${usuarioId})
    on conflict (location_id, usuario_id) do update set ativo = true`
}

export async function definirAtivo(lid: string, usuarioId: string, ativo: boolean) {
  await db()`update equipe set ativo = ${ativo} where location_id = ${lid} and usuario_id = ${usuarioId}`
}

export async function tirarDaEquipe(lid: string, usuarioId: string) {
  await db()`delete from equipe where location_id = ${lid} and usuario_id = ${usuarioId}`
}

/** Quem recebeu lead nos últimos 30 dias (pela sincronização) e ainda tem acesso à casa: ponto de partida da equipe. */
export async function sugerirEquipe(lid: string): Promise<string[]> {
  await migrar()
  const rs = await db()<{ dono_id: string }[]>`
    select o.dono_id from oportunidades o
    join usuario_casa uc on uc.location_id = o.location_id and uc.usuario_id = o.dono_id
    where o.location_id = ${lid} and o.criado_em > now() - interval '30 days'
    group by 1 having count(*) >= 5`
  return rs.map(r => r.dono_id)
}

/**
 * Escolhe e grava o dono de um contato recém-criado. Rodízio igual: vai para quem está ativo e recebeu
 * há mais tempo (ou nunca recebeu). Em simulação só registra a escolha, sem tocar no GHL.
 * Chamado pelo webhook do workflow "Novo Lead" de cada casa, depois de "Criar ou atualizar oportunidade".
 */
export async function atribuirContato(casa: Casa, contatoId: string, origem = 'webhook') {
  const lid = casa.locationId
  const modo = await modoDaCasa(lid)
  if (modo === 'desligado') return { ok: true, ignorado: 'rodízio desligado nesta casa' }
  const simulada = modo === 'simulacao'
  const sql = db()

  // o GHL pode reenviar o mesmo contato: devolve a escolha já feita
  const [ja] = await sql<{ usuario_id: string }[]>`
    select usuario_id from atribuicoes where location_id = ${lid} and contato_id = ${contatoId} and simulada = ${simulada}
      and origem = ${origem} and em > now() - interval '1 day' limit 1`
  if (ja) return { ok: true, repetido: true, usuario_id: ja.usuario_id, simulada }

  // contato que o painel já atribuiu (ex.: o card ainda não existia na hora): reaproveita a escolha, sem girar a fila
  const [anterior] = simulada ? [] : await sql<{ usuario_id: string }[]>`
    select usuario_id from atribuicoes where location_id = ${lid} and contato_id = ${contatoId} and not simulada
      and usuario_id is not null and em > now() - interval '2 days' order by id limit 1`

  // contato cadastrado à mão por alguém da casa (computador ou celular): fica com quem cadastrou, ou com o dono
  // escolhido no cadastro, sem passar pela fila e sem tirar a vez de ninguém no rodízio
  let manual: string | null = null
  if (!anterior) {
    const { contact } = await ghl<{ contact: any }>(`/contacts/${contatoId}`, casa.token)
    const cb = contact?.createdBy
    if (cb && (cb.source === 'WEB_USER' || cb.source === 'MOBILE_USER') && cb.sourceId) {
      const [naEquipe] = await sql`select 1 from equipe where location_id = ${lid} and usuario_id = ${cb.sourceId}`
      manual = contact.assignedTo || (naEquipe ? cb.sourceId : null)
      if (manual) {
        await sql`insert into atribuicoes (location_id, contato_id, usuario_id, origem, simulada, detalhe)
          values (${lid}, ${contatoId}, ${manual}, 'manual', ${simulada}, ${sql.json({ criadoPor: cb.sourceId })})`
      }
    }
  }

  const escolhido = anterior ? anterior.usuario_id : manual ?? await sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext(${lid}))`
    const [e] = await tx<{ usuario_id: string }[]>`
      select e.usuario_id from equipe e
      left join lateral (select max(em) as ultimo from atribuicoes a
        where a.location_id = e.location_id and a.usuario_id = e.usuario_id and a.simulada = ${simulada}
          and a.origem <> 'manual') a on true
      where e.location_id = ${lid} and e.ativo
      order by a.ultimo nulls first, e.desde, e.usuario_id
      limit 1`
    if (!e) return null
    await tx`insert into atribuicoes (location_id, contato_id, usuario_id, origem, simulada)
      values (${lid}, ${contatoId}, ${e.usuario_id}, ${origem}, ${simulada})`
    return e.usuario_id
  })
  if (!escolhido) return { ok: false, erro: 'nenhuma pessoa ativa na equipe desta casa' }
  if (simulada) return { ok: true, simulada: true, usuario_id: escolhido, manual: !!manual }

  await ghlGravar('PUT', `/contacts/${contatoId}`, casa.token, { assignedTo: escolhido })
  const membros = new Set((await sql<{ usuario_id: string }[]>`
    select usuario_id from equipe where location_id = ${lid} and ativo`).map(r => r.usuario_id))
  // o card criado no mesmo fluxo pode levar alguns segundos para aparecer na busca do GHL
  let opportunities: any[] = []
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    if (tentativa) await new Promise(r => setTimeout(r, 3000))
    opportunities = (await ghl<{ opportunities: any[] }>(
      `/opportunities/search?location_id=${lid}&contact_id=${contatoId}&status=open`, casa.token)).opportunities ?? []
    if (opportunities.length) break
  }
  // card sem dono, com dono fora da equipe, ou recém-criado neste mesmo fluxo (caso o "Assign to user" ainda esteja ligado)
  const recente = (o: any) => Date.now() - Date.parse(o.createdAt ?? 0) < 15 * 60_000
  const cards = opportunities.filter(o => o.assignedTo !== escolhido
    && (!o.assignedTo || !membros.has(o.assignedTo) || recente(o)))
  for (const o of cards) await ghlGravar('PUT', `/opportunities/${o.id}`, casa.token, { assignedTo: escolhido })
  await sql`update atribuicoes set detalhe = ${sql.json({ cards: cards.map(o => o.id) })}
    where location_id = ${lid} and contato_id = ${contatoId} and simulada = false and origem = ${origem}`
  return { ok: true, usuario_id: escolhido, cards: cards.length, manual: !!manual }
}

export interface PlanoTransferencia {
  total: number
  porEtapa: Record<string, Record<string, number>>
}

/**
 * Passa os cards abertos de `de` para `para` (uma pessoa) ou para o rodízio da equipe ativa.
 * Troca o dono do card e do contato (é o dono do contato que enxerga a conversa), sem tirar contato de terceiros.
 * Idempotente: relê os cards de `de` no GHL, então pode ser repetida para continuar de onde parou.
 */
export async function transferirCards(casa: Casa, opcoes: {
  de: string
  para: string | 'rodizio'
  incluirDescartados: boolean
  simular: boolean
  ate?: number
  aoProgredir?: (feitos: number, total: number) => Promise<void>
}): Promise<PlanoTransferencia & { feitos: number; completo: boolean }> {
  const { token, locationId: lid } = casa
  const { pipelines = [] } = await ghl<{ pipelines: any[] }>(`/opportunities/pipelines?locationId=${lid}`, token)
  const etapa = new Map<string, string>()
  for (const p of pipelines) for (const s of p.stages) etapa.set(s.id, s.name)

  const cards: any[] = []
  let url: string | null = `/opportunities/search?location_id=${lid}&assigned_to=${opcoes.de}&status=open&limit=100`
  while (url) {
    const r: any = await ghl(url, token)
    cards.push(...(r.opportunities ?? []))
    const m = r.meta ?? {}
    url = m.nextPage && m.startAfterId
      ? `/opportunities/search?location_id=${lid}&assigned_to=${opcoes.de}&status=open&limit=100&startAfter=${m.startAfter}&startAfterId=${m.startAfterId}`
      : null
  }
  const alvo = cards.filter(o => o.assignedTo === opcoes.de
    && (opcoes.incluirDescartados || chaveEtapa(etapa.get(o.pipelineStageId)) !== 'descartado'))

  let destinos: string[]
  if (opcoes.para === 'rodizio') {
    destinos = (await db()<{ usuario_id: string }[]>`
      select usuario_id from equipe where location_id = ${lid} and ativo and usuario_id <> ${opcoes.de} order by usuario_id`)
      .map(r => r.usuario_id)
    if (!destinos.length) throw new Error('não há ninguém ativo na equipe para receber os cards')
  } else destinos = [opcoes.para]

  // rodízio dentro de cada etapa, do mais recente ao mais antigo, para cada um receber um mix igual
  const grupos = new Map<string, any[]>()
  for (const o of alvo) {
    const nomeEtapa = etapa.get(o.pipelineStageId) ?? '?'
    grupos.set(nomeEtapa, [...(grupos.get(nomeEtapa) ?? []), o])
  }
  const plano: { o: any; etapa: string; novo: string }[] = []
  let i = 0
  for (const [nomeEtapa, lista] of grupos) {
    lista.sort((a, b) => (b.lastStageChangeAt ?? '').localeCompare(a.lastStageChangeAt ?? ''))
    for (const o of lista) plano.push({ o, etapa: nomeEtapa, novo: destinos[i++ % destinos.length] })
  }
  const porEtapa: PlanoTransferencia['porEtapa'] = {}
  for (const p of plano) {
    porEtapa[p.etapa] ??= {}
    porEtapa[p.etapa][p.novo] = (porEtapa[p.etapa][p.novo] ?? 0) + 1
  }
  if (opcoes.simular) return { total: plano.length, porEtapa, feitos: 0, completo: true }

  let feitos = 0
  const fila = [...plano]
  const trabalhador = async () => {
    while (fila.length && Date.now() < (opcoes.ate ?? Infinity)) {
      const p = fila.shift()!
      await ghlGravar('PUT', `/opportunities/${p.o.id}`, token, { assignedTo: p.novo })
      if (p.o.contactId) {
        const { contact } = await ghl<{ contact: any }>(`/contacts/${p.o.contactId}`, token)
        if (!contact?.assignedTo || contact.assignedTo === opcoes.de) {
          await ghlGravar('PUT', `/contacts/${p.o.contactId}`, token, { assignedTo: p.novo })
        }
      }
      if (++feitos % 25 === 0) await opcoes.aoProgredir?.(feitos, plano.length)
    }
  }
  await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()])
  await opcoes.aoProgredir?.(feitos, plano.length)
  return { total: plano.length, porEtapa, feitos, completo: feitos === plano.length }
}
