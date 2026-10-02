import { after } from 'next/server'
import { db, migrar } from './db'
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
  status: 'simulada' | 'rodando' | 'parcial' | 'concluida' | 'erro' | 'cancelada'
  plano: { total: number; porEtapa: Record<string, Record<string, number>> } | null
  total: number | null
  feitos: number
  erro: string | null
  criado_por: string | null
  criado_em: Date
}

const casaPorLid = (lid: string) => {
  const c = casas().find(x => x.locationId === lid)
  if (!c) throw new Error('casa não encontrada')
  return c
}

/** Passo 1: calcula quem recebe o quê, sem gravar no GHL. */
export async function simularTransferencia(p: {
  lid: string; de: string; para: string; destinoCasa: string | null; incluirDescartados: boolean; usuario: string
}) {
  await migrar()
  if (!p.de || !p.para || p.de === p.para) throw new Error('escolha de quem saem os cards e para quem vão')
  // clicar duas vezes em Simular não cria duas simulações iguais
  await db()`update transferencias set status = 'cancelada'
    where location_id = ${p.lid} and de = ${p.de} and para = ${p.para} and status = 'simulada'`
  const plano = await transferirCards(casaPorLid(p.lid), { de: p.de, para: p.para, incluirDescartados: p.incluirDescartados, simular: true })
  const [t] = await db()<{ id: number }[]>`
    insert into transferencias (location_id, de, para, destino_casa, incluir_descartados, status, plano, total, criado_por)
    values (${p.lid}, ${p.de}, ${p.para}, ${p.destinoCasa}, ${p.incluirDescartados}, 'simulada',
            ${db().json(plano as any)}, ${plano.total}, ${p.usuario})
    returning id`
  return t.id
}

/** Passo 2: muda a equipe na hora e move os cards em segundo plano (continua se passar do tempo da função). */
export async function executarTransferencia(id: number) {
  const sql = db()
  const [t] = await sql<Transferencia[]>`select * from transferencias where id = ${id}`
  if (!t || !['simulada', 'parcial', 'erro'].includes(t.status)) return
  // mudar de casa tira a pessoa do rodízio da casa antiga e coloca no da nova; só mover cards não mexe na equipe
  if (t.status === 'simulada' && t.destino_casa) {
    await tirarDaEquipe(t.location_id, t.de)
    await incluirNaEquipe(t.destino_casa, t.de)
  }
  await sql`update transferencias set status = 'rodando', erro = null, atualizado_em = now() where id = ${id}`
  after(async () => {
    try {
      const r = await transferirCards(casaPorLid(t.location_id), {
        de: t.de, para: t.para, incluirDescartados: t.incluir_descartados, simular: false,
        ate: Date.now() + 240_000,
        aoProgredir: async feitos => { await sql`update transferencias set feitos = ${t.feitos + feitos}, atualizado_em = now() where id = ${id}` },
      })
      await sql`update transferencias set status = ${r.completo ? 'concluida' : 'parcial'}, atualizado_em = now() where id = ${id}`
    } catch (e: any) {
      await sql`update transferencias set status = 'erro', erro = ${String(e?.message ?? e).slice(0, 500)}, atualizado_em = now() where id = ${id}`
    }
  })
}

export async function cancelarSimulacao(id: number) {
  await db()`update transferencias set status = 'cancelada' where id = ${id} and status = 'simulada'`
}

export async function transferenciasDaCasa(lid: string): Promise<Transferencia[]> {
  await migrar()
  return db()<Transferencia[]>`
    select t.*, ud.nome as de_nome, up.nome as para_nome, cd.nome as destino_nome
    from transferencias t
    left join usuarios ud on ud.id = t.de
    left join usuarios up on up.id = t.para
    left join casas cd on cd.location_id = t.destino_casa
    where (t.location_id = ${lid} or t.destino_casa = ${lid}) and t.status <> 'cancelada'
    order by t.id desc limit 10`
}
