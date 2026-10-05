import Link from 'next/link'
import { redirect } from 'next/navigation'
import { usuarioAtual } from '@/lib/auth'
import { db, migrar } from '@/lib/db'
import { cancelarSimulacao, executarTransferencia, simularTransferencia, transferenciasDaCasa } from '@/lib/transferencias'
import { dataHora } from '@/lib/util'

export const maxDuration = 300

const STATUS: Record<string, string> = {
  simulada: 'aguardando confirmação', rodando: 'transferindo…', parcial: 'parou no meio, falta continuar',
  concluida: 'concluída', erro: 'erro',
}

/** Só para perfil admin: gerentes veem Dia, Mês, Período e Equipe, mas não transferem cards. */
async function exigirAdmin() {
  const u = await usuarioAtual()
  if (!u?.admin) redirect('/equipe')
  return u
}

export default async function Transferencias({ searchParams }: { searchParams: Promise<{ casa?: string }> }) {
  await exigirAdmin()
  await migrar()
  const sql = db()
  const lista = await sql<{ location_id: string; nome: string }[]>`select location_id, nome from casas where base = 'vendas' order by nome`
  const lid = (await searchParams).casa ?? lista[0]?.location_id
  const atual = lista.find(c => c.location_id === lid)
  if (!atual) return <div className="aviso">Nenhuma casa sincronizada ainda.</div>
  const volta = `/transferencias?casa=${lid}`

  const [transferencias, comAcesso] = await Promise.all([
    transferenciasDaCasa(lid),
    sql<{ id: string; nome: string }[]>`
      select u.id, u.nome from usuario_casa uc join usuarios u on u.id = uc.usuario_id
      where uc.location_id = ${lid} order by u.nome`,
  ])
  // donos de cards abertos que não têm mais acesso à casa (órfãos), para poder transferir os cards deles
  const orfaos = await sql<{ id: string; nome: string }[]>`
    select distinct o.dono_id as id, coalesce(u.nome, 'Usuário removido') || ' (sem acesso)' as nome
    from oportunidades o left join usuarios u on u.id = o.dono_id
    where o.location_id = ${lid} and o.status = 'open' and o.dono_id is not null
      and not exists (select 1 from usuario_casa uc where uc.location_id = o.location_id and uc.usuario_id = o.dono_id)
    order by 2`

  async function simular(f: FormData) {
    'use server'
    const u = await exigirAdmin()
    await simularTransferencia({
      lid: lid!, de: String(f.get('de')), para: String(f.get('para')),
      destinoCasa: String(f.get('destino') || '') || null, incluirDescartados: f.get('descartados') === '1',
      usuario: u?.nome ?? '?',
    })
    redirect(volta)
  }
  async function confirmar(f: FormData) {
    'use server'
    await exigirAdmin()
    await executarTransferencia(Number(f.get('id'))); redirect(volta)
  }
  async function cancelar(f: FormData) {
    'use server'
    await exigirAdmin()
    await cancelarSimulacao(Number(f.get('id'))); redirect(volta)
  }

  return (
    <>
      <form className="filtros" action="/transferencias">
        <select name="casa" defaultValue={lid}>
          {lista.map(c => <option key={c.location_id} value={c.location_id}>{c.nome}</option>)}
        </select>
        <button type="submit">Ver</button>
      </form>

      <h2 style={{ fontSize: 20 }}>Transferências · {atual.nome}</h2>
      <h2>Transferir pessoa ou cards</h2>
      <form action={simular} className="cartao" style={{ display: 'grid', gap: 10, maxWidth: 640 }}>
        <label>Cards de <select name="de" required defaultValue="">
          <option value="" disabled>Escolha a pessoa</option>
          {comAcesso.concat(orfaos).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select></label>
        <label>Vão para <select name="para" required defaultValue="">
          <option value="" disabled>Escolha para quem</option>
          <option value="rodizio">O rodízio da equipe desta casa (divide igualmente)</option>
          {comAcesso.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select></label>
        <label>A pessoa passa a atender em <select name="destino">
          <option value="">Continua nesta casa (só move os cards)</option>
          {lista.filter(c => c.location_id !== lid).map(c => <option key={c.location_id} value={c.location_id}>{c.nome}</option>)}
        </select></label>
        <label><input type="checkbox" name="descartados" value="1" defaultChecked /> Incluir cards em Lead Descartado</label>
        <button type="submit">Simular (não muda nada ainda)</button>
      </form>
      <p className="nota">
        A transferência troca o dono do card e do contato, para quem recebe ver a conversa. Cards fechados (ganhos e perdidos)
        ficam com a pessoa como histórico. O acesso à conta da casa nova continua sendo dado no CRM.
      </p>

      {transferencias.length > 0 && <h2>Transferências</h2>}
      {transferencias.map(t => (
        <div key={t.id} className="cartao" style={{ marginBottom: 12 }}>
          <div>
            <strong>{t.de_nome ?? t.de}</strong> → {t.para === 'rodizio' ? 'rodízio da equipe' : (t.para_nome ?? t.para)}
            {t.destino_nome && <> · passa para <strong>{t.destino_nome}</strong></>}
            <span className="suave"> · {dataHora(t.criado_em)} por {t.criado_por}</span>
          </div>
          <div className={t.status === 'erro' ? 'erro' : 'suave'}>
            {STATUS[t.status] ?? t.status}{t.status !== 'simulada' && ` · ${t.feitos} de ${t.total} cards`}{t.erro && ` · ${t.erro}`}
          </div>
          {t.plano && t.status === 'simulada' && (
            <table style={{ marginTop: 8 }}>
              <tbody>
                {Object.entries(t.plano.porEtapa).map(([etapa, m]) => (
                  <tr key={etapa}><td className="txt">{etapa.replace(/^\d+\.\s*/, '')}</td>
                    <td className="txt">{Object.entries(m).map(([u, n]) => `${comAcesso.find(x => x.id === u)?.nome ?? u}: ${n}`).join(' · ')}</td></tr>
                ))}
                <tr><td>Total</td><td className="txt">{t.plano.total} cards</td></tr>
              </tbody>
            </table>
          )}
          {['simulada', 'parcial', 'erro'].includes(t.status) && (
            <div className="filtros" style={{ marginTop: 8, marginBottom: 0 }}>
              <form action={confirmar}><input type="hidden" name="id" value={t.id} />
                <button type="submit">{t.status === 'simulada' ? 'Confirmar transferência' : 'Continuar'}</button></form>
              {t.status === 'simulada' && (
                <form action={cancelar}><input type="hidden" name="id" value={t.id} /><button type="submit">Cancelar</button></form>
              )}
            </div>
          )}
        </div>
      ))}
      {transferencias.some(t => t.status === 'rodando') && <p className="nota"><Link href={volta}>Atualizar progresso</Link></p>}
    </>
  )
}
