import { after } from 'next/server'
import { casaSalva, usuarios } from './dados'
import { cmd, k } from './kv'
import { casas } from './casas'
import { incluirNaEquipe, tirarDaEquipe, transferirCards } from './rodizio'

export interface Transferencia {
  id: number
  location_id: string
  de: string
  de_nome: string | null
  para: string
  para_nome: string | null
  destino_casa: string | null
  destino_nome: string | null
  incluir_descartados: boolean
  etapa: string | null
  destinos: string[] | null
  status: 'simulada' | 'rodando' | 'parcial' | 'concluida' | 'erro' | 'cancelada'
  plano: { total: number; porEtapa: Record<string, Record<string, number>>; mapa?: Record<string, string> } | null
  total: number | null
  feitos: number
  erro: string | null
  criado_por: string | null
  criado_em: Date
}

type Salva = Omit<Transferencia, 'de_nome' | 'para_nome' | 'destino_nome' | 'criado_em'> & { criado_em: number; atualizado_em: number }

export async function lerTransferencia(id: number): Promise<Salva | null> {
  const v = await cmd<string | null>('HGET', k('transf'), id)
  return v ? JSON.parse(v) : null
}

/** Lê, muda e grava (as transferências são poucas e uma de cada vez). */
async function mudar(id: number, m: Partial<Salva>) {
  const t = await lerTransferencia(id)
  if (!t) return
  await cmd('HSET', k('transf'), id, JSON.stringify({ ...t, ...m, atualizado_em: Date.now() }))
}

const casaPorLid = (lid: string) => {
  const c = casas().find(x => x.locationId === lid)
  if (!c) throw new Error('casa não encontrada')
  return c
}

/** Passo 1: calcula quem recebe o quê, sem gravar no GHL. */
export async function simularTransferencia(p: {
  lid: string; de: string; para: string; destinoCasa: string | null; incluirDescartados: boolean; usuario: string
  etapa?: string | null; destinos?: string[] | null
}) {
  if (!p.de || !p.para || p.de === p.para) throw new Error('escolha de quem saem os cards e para quem vão')
  // clicar duas vezes em Simular não cria duas simulações iguais
  for (const t of await todas()) {
    if (t.location_id === p.lid && t.de === p.de && t.para === p.para && t.status === 'simulada') await mudar(t.id, { status: 'cancelada' })
  }
  const etapa = p.etapa || null
  const destinos = p.para === 'lista' ? p.destinos ?? [] : null
  const plano = await transferirCards(casaPorLid(p.lid), {
    de: p.de, para: p.para, incluirDescartados: p.incluirDescartados, etapa, destinos, simular: true,
  })
  const id = await cmd<number>('INCR', k('transf', 'seq'))
  const agora = Date.now()
  const t: Salva = {
    id, location_id: p.lid, de: p.de, para: p.para, destino_casa: p.destinoCasa, incluir_descartados: p.incluirDescartados,
    etapa, destinos, status: 'simulada', plano: { total: plano.total, porEtapa: plano.porEtapa, mapa: plano.mapa },
    total: plano.total, feitos: 0, erro: null, criado_por: p.usuario, criado_em: agora, atualizado_em: agora,
  }
  await cmd('HSET', k('transf'), id, JSON.stringify(t))
  return id
}

/** Passo 2: muda a equipe na hora e move os cards em segundo plano (continua se passar do tempo da função). */
export async function executarTransferencia(id: number) {
  const t = await lerTransferencia(id)
  if (!t || !['simulada', 'parcial', 'erro'].includes(t.status)) return
  // mudar de casa tira a pessoa do rodízio da casa antiga e coloca no da nova; só mover cards não mexe na equipe
  if (t.status === 'simulada' && t.destino_casa) {
    await tirarDaEquipe(t.location_id, t.de)
    await incluirNaEquipe(t.destino_casa, t.de)
  }
  await mudar(id, { status: 'rodando', erro: null })
  after(async () => {
    try {
      const r = await transferirCards(casaPorLid(t.location_id), {
        de: t.de, para: t.para, incluirDescartados: t.incluir_descartados, etapa: t.etapa, destinos: t.destinos, mapa: t.plano?.mapa ?? null, simular: false,
        ate: Date.now() + 240_000,
        aoProgredir: async feitos => { await mudar(id, { feitos: t.feitos + feitos }) },
      })
      await mudar(id, { status: r.completo ? 'concluida' : 'parcial' })
    } catch (e: any) {
      await mudar(id, { status: 'erro', erro: String(e?.message ?? e).slice(0, 500) })
    }
  })
}

export async function cancelarSimulacao(id: number) {
  if ((await lerTransferencia(id))?.status === 'simulada') await mudar(id, { status: 'cancelada' })
}

async function todas(): Promise<Salva[]> {
  const l = await cmd<string[]>('HVALS', k('transf'))
  return l.map(x => JSON.parse(x))
}

export async function transferenciasDaCasa(lid: string): Promise<Transferencia[]> {
  const [ts, nomes] = await Promise.all([todas(), usuarios()])
  const escolhidas = ts.filter(t => (t.location_id === lid || t.destino_casa === lid) && t.status !== 'cancelada')
    .sort((a, b) => b.id - a.id).slice(0, 10)
  return Promise.all(escolhidas.map(async t => ({
    ...t, criado_em: new Date(t.criado_em),
    de_nome: nomes[t.de]?.nome ?? null, para_nome: nomes[t.para]?.nome ?? null,
    destino_nome: t.destino_casa ? (await casaSalva(t.destino_casa))?.nome ?? null : null,
  })))
}
