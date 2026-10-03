import { db, migrar } from './db'
import { ghl } from './ghl'
import { chaveEtapa } from './etapas'
import type { Casa } from './casas'
import { atribuirContato, modoDaCasa } from './rodizio'

const DIA = 86_400_000

export interface ResultadoSync {
  casa: string
  base: string
  oportunidades: number
  agendamentos: number
  historicosLidos: number
  historicosPendentes: number
  reparados: number
  segundos: number
}

async function emLotes<T>(itens: T[], tamanho: number, fn: (lote: T[]) => Promise<unknown>) {
  for (let i = 0; i < itens.length; i += tamanho) await fn(itens.slice(i, i + tamanho))
}

/**
 * Sincroniza uma conta inteira. Roda a cada hora pelo cron (uma conta por chamada)
 * e também pela linha de comando (scripts/sync.ts) para a carga inicial.
 * `ate` é o relógio limite: o histórico de etapas é lido até lá e continua na próxima rodada.
 */
export async function sincronizarCasa(casa: Casa, ate: number): Promise<ResultadoSync> {
  await migrar()
  const sql = db()
  const t0 = Date.now()
  const agora = new Date()
  const { locationId: lid, token } = casa
  const [{ id: syncId }] = await sql`
    insert into sincronizacoes (location_id, inicio) values (${lid}, ${agora}) returning id`

  try {
    await sql`
      insert into casas (location_id, casa, base, nome) values (${lid}, ${casa.casa}, ${casa.base}, ${casa.nome})
      on conflict (location_id) do update set casa = excluded.casa, base = excluded.base, nome = excluded.nome`

    // usuários: o mesmo usuário tem o mesmo ID em todas as subcontas
    const { users = [] } = await ghl<{ users: any[] }>(`/users/?locationId=${lid}`, token)
    if (users.length) {
      await sql`insert into usuarios ${sql(users.map(u => ({ id: u.id, nome: u.name ?? [u.firstName, u.lastName].filter(Boolean).join(' '), email: u.email ?? null })))}
        on conflict (id) do update set nome = excluded.nome, email = excluded.email`
    }
    await sql.begin(async tx => {
      await tx`delete from usuario_casa where location_id = ${lid}`
      if (users.length) await tx`insert into usuario_casa ${tx(users.map(u => ({ usuario_id: u.id, location_id: lid })))}`
    })

    // oportunidades: carga completa (a API não filtra por data de atualização)
    const opps: any[] = []
    let url: string | null = `/opportunities/search?location_id=${lid}&limit=100`
    while (url) {
      const r: any = await ghl(url, token)
      opps.push(...(r.opportunities ?? []))
      const m = r.meta ?? {}
      url = m.nextPage && m.startAfterId
        ? `/opportunities/search?location_id=${lid}&limit=100&startAfter=${m.startAfter}&startAfterId=${m.startAfterId}`
        : null
    }

    // etapas: o funil principal é o que tem mais oportunidades (descarta "LEADS ANTIGOS")
    const { pipelines = [] } = await ghl<{ pipelines: any[] }>(`/opportunities/pipelines?locationId=${lid}`, token)
    const porFunil = new Map<string, number>()
    for (const o of opps) porFunil.set(o.pipelineId, (porFunil.get(o.pipelineId) ?? 0) + 1)
    const principal = [...pipelines].sort((a, b) => (porFunil.get(b.id) ?? 0) - (porFunil.get(a.id) ?? 0))[0]?.id
    const etapas = pipelines.flatMap(p => p.stages.map((s: any) => ({
      id: s.id, location_id: lid, pipeline_id: p.id, pipeline_nome: p.name, principal: p.id === principal,
      nome: s.name, chave: chaveEtapa(s.name), posicao: s.position ?? null,
    })))
    await sql.begin(async tx => {
      await tx`delete from etapas where location_id = ${lid}`
      if (etapas.length) await tx`insert into etapas ${tx(etapas)}`
    })

    const linhas = opps.map(o => ({
      id: o.id, location_id: lid, pipeline_id: o.pipelineId, etapa_id: o.pipelineStageId ?? null,
      status: o.status ?? null, dono_id: o.assignedTo || null, contato_id: o.contactId ?? null,
      nome: o.name ?? null, valor: o.monetaryValue ?? null, criado_em: o.createdAt ?? null,
      ultima_mudanca_etapa: o.lastStageChangeAt ?? null, visto_em: agora,
    }))
    await emLotes(linhas, 500, lote => sql`
      insert into oportunidades ${sql(lote)}
      on conflict (id) do update set location_id = excluded.location_id, pipeline_id = excluded.pipeline_id,
        etapa_id = excluded.etapa_id, status = excluded.status, dono_id = excluded.dono_id,
        contato_id = excluded.contato_id, nome = excluded.nome, valor = excluded.valor,
        criado_em = excluded.criado_em, ultima_mudanca_etapa = excluded.ultima_mudanca_etapa,
        visto_em = excluded.visto_em`)
    await sql`delete from oportunidades where location_id = ${lid} and visto_em < ${agora}`

    // rede de segurança do rodízio: lead novo que ficou sem dono (webhook falhou) recebe alguém da equipe
    let reparados = 0
    if (await modoDaCasa(lid) === 'ativo') {
      const semDono = new Set(opps
        .filter(o => o.status === 'open' && !o.assignedTo && o.contactId && Date.now() - Date.parse(o.createdAt) < 48 * 3600_000)
        .map(o => o.contactId as string))
      for (const contato of semDono) {
        try {
          if ((await atribuirContato(casa, contato, 'reparo')).ok) reparados++
        } catch { /* tenta de novo na próxima hora */ }
      }
    }

    // agendamentos: as visitas ficam nas agendas pessoais, então lê por usuário (janela de -60 a +60 dias)
    const ini = Date.now() - 60 * DIA, fim = Date.now() + 60 * DIA
    const eventos = new Map<string, any>()
    for (const u of users) {
      const r = await ghl<{ events?: any[] }>(
        `/calendars/events?locationId=${lid}&userId=${u.id}&startTime=${ini}&endTime=${fim}`, token, '2021-04-15')
      for (const e of r.events ?? []) if (!e.deleted) eventos.set(e.id, e)
    }
    const ags = [...eventos.values()].map(e => ({
      id: e.id, location_id: lid, calendario_id: e.calendarId ?? null, contato_id: e.contactId ?? null,
      dono_id: e.assignedUserId ?? null, inicio: e.startTime ?? null, criado_em: e.dateAdded ?? null,
      status: e.appointmentStatus ?? null, titulo: e.title ?? null, visto_em: agora,
      criado_por: e.createdBy?.userId ?? null,
    }))
    await emLotes(ags, 500, lote => sql`
      insert into agendamentos ${sql(lote)}
      on conflict (id) do update set calendario_id = excluded.calendario_id, contato_id = excluded.contato_id,
        dono_id = excluded.dono_id, inicio = excluded.inicio, criado_em = excluded.criado_em,
        status = excluded.status, titulo = excluded.titulo, visto_em = excluded.visto_em,
        criado_por = excluded.criado_por`)
    await sql`delete from agendamentos where location_id = ${lid} and visto_em < ${agora}
      and inicio between ${new Date(ini)} and ${new Date(fim)}`

    // histórico de etapas: vem das atividades da conversa; lê primeiro o que mudou mais recentemente
    let lidos = 0
    const pendentes = await sql<{ id: string; contato_id: string; dono_id: string | null }[]>`
      select id, contato_id, dono_id from oportunidades
      where location_id = ${lid} and contato_id is not null
        and (historico_lido_em is null or ultima_mudanca_etapa > historico_lido_em)
      order by ultima_mudanca_etapa desc nulls last, criado_em desc`
    const fila = [...pendentes]
    const trabalhador = async () => {
      while (fila.length && Date.now() < ate) {
        const op = fila.shift()!
        await lerHistorico(lid, token, op.id, op.contato_id, op.dono_id)
        lidos++
      }
    }
    await Promise.all([trabalhador(), trabalhador(), trabalhador()])

    const resultado: ResultadoSync = {
      casa: casa.casa, base: casa.base, oportunidades: opps.length, agendamentos: ags.length,
      historicosLidos: lidos, historicosPendentes: pendentes.length - lidos, reparados,
      segundos: Math.round((Date.now() - t0) / 1000),
    }
    await sql`update sincronizacoes set fim = now(), ok = true, detalhe = ${sql.json(resultado as any)} where id = ${syncId}`
    return resultado
  } catch (e: any) {
    await sql`update sincronizacoes set fim = now(), ok = false, detalhe = ${sql.json({ erro: String(e?.message ?? e) })} where id = ${syncId}`
    throw e
  }
}

// dono_na_hora: quem era dono do card quando a mudança foi lida (até 1 hora depois dela). Assim uma
// transferência posterior não leva junto os agendamentos e fechamentos que a pessoa anterior fez.
async function lerHistorico(lid: string, token: string, oppId: string, contatoId: string, donoAtual: string | null) {
  const sql = db()
  const lidoEm = new Date()
  const { conversations = [] } = await ghl<{ conversations: any[] }>(
    `/conversations/search?locationId=${lid}&contactId=${contatoId}`, token)
  const movs: any[] = []
  for (const conv of conversations) {
    let ultimo: string | null = null
    for (let pagina = 0; pagina < 30; pagina++) {
      const r: any = await ghl(`/conversations/${conv.id}/messages?limit=100${ultimo ? `&lastMessageId=${ultimo}` : ''}`, token)
      const mm = r.messages ?? {}
      for (const m of mm.messages ?? []) {
        const a = m.activity
        if (m.messageType !== 'TYPE_ACTIVITY_OPPORTUNITY' || a?.data?.id !== oppId) continue
        movs.push({
          id: m.id, oportunidade_id: oppId, location_id: lid, em: m.dateAdded, tipo: a.type ?? null,
          etapa_de: a.data.stage?.oldStageName ?? null, etapa_para: a.data.stage?.newStageName ?? null,
          chave_para: chaveEtapa(a.data.stage?.newStageName), status: a.data.status ?? null,
          dono_na_hora: donoAtual,
        })
      }
      if (!mm.nextPage || !mm.lastMessageId) break
      ultimo = mm.lastMessageId
    }
  }
  if (movs.length) await sql`insert into movimentos ${sql(movs)} on conflict (id) do nothing`
  await sql`update oportunidades set historico_lido_em = ${lidoEm} where id = ${oppId}`
}
