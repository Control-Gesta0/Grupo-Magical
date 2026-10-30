import { ghl } from './ghl'
import { chaveEtapa } from './etapas'
import type { Casa } from './casas'
import { atribuirContato } from './rodizio'
import { alinhar } from './alinhamento'
import { modoDaCasa, salvarAcesso, salvarCasa, salvarEtapas, salvarSync, salvarUsuarios, type Etapa } from './dados'
import { montarFatos, movimentoDoCrm, type Movimento } from './fatos'
import { cmd, hgetall, hgetallJson, hsetMuitos, k, pipeline } from './kv'

export interface ResultadoSync {
  casa: string
  base: string
  oportunidades: number
  historicosLidos: number
  historicosPendentes: number
  reparados: number
  alinhados: number
  segundos: number
}

/**
 * Sincroniza uma conta inteira. Roda pelo cron (uma conta por chamada) e também pela linha de comando
 * (scripts/sync.ts). `ate` é o relógio limite: o histórico de etapas é lido até lá e continua na próxima rodada.
 */
export async function sincronizarCasa(casa: Casa, ate: number): Promise<ResultadoSync> {
  const t0 = Date.now()
  const { locationId: lid, token } = casa
  try {
    await salvarCasa({ location_id: lid, casa: casa.casa, base: casa.base, nome: casa.nome })

    // usuários: o mesmo usuário tem o mesmo ID em todas as subcontas
    const { users = [] } = await ghl<{ users: any[] }>(`/users/?locationId=${lid}`, token)
    if (users.length) {
      await salvarUsuarios(users.map(u => ({ id: u.id, nome: u.name ?? [u.firstName, u.lastName].filter(Boolean).join(' '), email: u.email ?? null })))
    }
    const acesso = users.map(u => u.id as string)
    await salvarAcesso(lid, acesso)

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
    const etapas: Etapa[] = pipelines.flatMap(p => p.stages.map((s: any) => ({
      id: s.id, pipeline_id: p.id, pipeline_nome: p.name, principal: p.id === principal,
      nome: s.name, chave: chaveEtapa(s.name), posicao: s.position ?? null,
    })))
    // a mesma etapa pode vir repetida dentro da conta (funil duplicado): grava uma vez só
    await salvarEtapas(lid, [...new Map(etapas.map(e => [e.id, e])).values()])

    // rede de segurança do rodízio: lead novo que ficou sem dono (webhook falhou) recebe alguém da equipe
    let reparados = 0, alinhados = 0
    const ativo = await modoDaCasa(lid) === 'ativo'
    if (ativo) {
      const semDono = new Set(opps
        .filter(o => o.status === 'open' && !o.assignedTo && o.contactId && Date.now() - Date.parse(o.createdAt) < 48 * 3600_000)
        .map(o => o.contactId as string))
      for (const contato of semDono) {
        try {
          if ((await atribuirContato(casa, contato, 'reparo')).ok) reparados++
        } catch { /* tenta de novo na próxima rodada */ }
      }
    }

    // contato acompanha o dono do card: confere os cards mexidos nas últimas 3 horas (ex.: dono trocado à mão no CRM)
    if (ativo) {
      try {
        const recentes = opps.filter(o => o.contactId && Date.now() - Date.parse(o.updatedAt ?? o.lastStatusChangeAt ?? 0) < 3 * 3600_000)
        alinhados = (await alinhar(casa, {
          cards: opps, usuariosDaCasa: new Set(acesso), contatos: recentes.map(o => o.contactId),
          aplicar: true, origem: 'automatico',
        })).alinhados
      } catch { /* tenta de novo na próxima rodada */ }
    }

    // histórico de etapas: vem das atividades da conversa; lê primeiro o que mudou mais recentemente
    const [movs, lidoBruto] = await Promise.all([hgetallJson<Movimento[]>(k('mov', lid)), hgetall(k('lido', lid))])
    const lido: Record<string, number> = Object.fromEntries(Object.entries(lidoBruto).map(([id, v]) => [id, Number(v)]))
    const pendentes = opps
      .filter(o => o.contactId && (!lido[o.id] || (o.lastStageChangeAt && Date.parse(o.lastStageChangeAt) > lido[o.id])))
      .sort((a, b) => (b.lastStageChangeAt ?? '').localeCompare(a.lastStageChangeAt ?? '') || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    const fila = [...pendentes]
    const novosMovs: [string, string][] = []
    const novosLidos: [string, string][] = []
    let lidos = 0
    const gravar = async () => {
      const m = novosMovs.splice(0), l = novosLidos.splice(0)
      if (m.length) await hsetMuitos(k('mov', lid), m, 100)
      if (l.length) await hsetMuitos(k('lido', lid), l)
    }
    const trabalhador = async () => {
      while (fila.length && Date.now() < ate) {
        const op = fila.shift()!
        const lidoEm = Date.now()
        const lista = await lerHistorico(lid, token, op.id, op.contactId, op.assignedTo || null)
        // a mesma movimentação lida de novo mantém o dono de quando foi lida pela primeira vez
        const atuais = movs[op.id] ?? []
        const ids = new Set(atuais.map(x => x.id))
        const juntos = [...atuais, ...lista.filter(x => !ids.has(x.id))]
        movs[op.id] = juntos
        lido[op.id] = lidoEm
        if (juntos.length) novosMovs.push([op.id, JSON.stringify(juntos)])
        novosLidos.push([op.id, String(lidoEm)])
        if (++lidos % 50 === 0) await gravar()
      }
    }
    await Promise.all([trabalhador(), trabalhador(), trabalhador()])
    await gravar()

    // card apagado no CRM: tira o histórico dele
    const existentes = new Set(opps.map(o => o.id))
    const sobras = Object.keys(movs).filter(id => !existentes.has(id))
    const sobrasLido = Object.keys(lido).filter(id => !existentes.has(id))
    for (let i = 0; i < sobras.length; i += 500) await cmd('HDEL', k('mov', lid), ...sobras.slice(i, i + 500))
    for (let i = 0; i < sobrasLido.length; i += 500) await cmd('HDEL', k('lido', lid), ...sobrasLido.slice(i, i + 500))

    const fatos = montarFatos({ opps, etapas, acesso, movs, lido })
    await pipeline([['SET', k('fatos', lid), JSON.stringify(fatos)], ['HSET', k('fatos-v'), lid, fatos.v]])

    const resultado: ResultadoSync = {
      casa: casa.casa, base: casa.base, oportunidades: opps.length,
      historicosLidos: lidos, historicosPendentes: pendentes.length - lidos, reparados, alinhados,
      segundos: Math.round((Date.now() - t0) / 1000),
    }
    await salvarSync(lid, { inicio: t0, fim: Date.now(), ok: true, detalhe: resultado })
    return resultado
  } catch (e: any) {
    await salvarSync(lid, { inicio: t0, fim: Date.now(), ok: false, detalhe: { erro: String(e?.message ?? e) } }).catch(() => {})
    throw e
  }
}

// dono: quem era dono do card quando a mudança foi lida (até 1 hora depois dela). Assim uma transferência
// posterior não leva junto os agendamentos e fechamentos que a pessoa anterior fez.
async function lerHistorico(lid: string, token: string, oppId: string, contatoId: string, donoAtual: string | null) {
  const { conversations = [] } = await ghl<{ conversations: any[] }>(
    `/conversations/search?locationId=${lid}&contactId=${contatoId}`, token)
  const movs: Movimento[] = []
  for (const conv of conversations) {
    let ultimo: string | null = null
    for (let pagina = 0; pagina < 30; pagina++) {
      const r: any = await ghl(`/conversations/${conv.id}/messages?limit=100${ultimo ? `&lastMessageId=${ultimo}` : ''}`, token)
      const mm = r.messages ?? {}
      for (const m of mm.messages ?? []) {
        if (m.messageType !== 'TYPE_ACTIVITY_OPPORTUNITY' || m.activity?.data?.id !== oppId) continue
        movs.push(movimentoDoCrm(m, donoAtual))
      }
      if (!mm.nextPage || !mm.lastMessageId) break
      ultimo = mm.lastMessageId
    }
  }
  return movs
}
