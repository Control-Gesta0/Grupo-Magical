import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { usuarioAtual } from '@/lib/auth'
import { db, migrar } from '@/lib/db'
import {
  definirAtivo, definirModo, equipeDaCasa, incluirNaEquipe, modoDaCasa, sugerirEquipe, tirarDaEquipe, type Modo,
} from '@/lib/rodizio'
import { cancelarSimulacao, executarTransferencia, simularTransferencia, transferenciasDaCasa } from '@/lib/transferencias'
import { dataHora, pct } from '@/lib/util'

export const maxDuration = 300

const MODOS: Record<Modo, string> = {
  desligado: 'Desligado (o workflow do GHL atribui)',
  simulacao: 'Simulação (o painel só registra quem receberia)',
  ativo: 'Ativo (o painel atribui de verdade)',
}
const STATUS: Record<string, string> = {
  simulada: 'aguardando confirmação', rodando: 'transferindo…', parcial: 'parou no meio, falta continuar',
  concluida: 'concluída', erro: 'erro',
}

export default async function Equipe({ searchParams }: { searchParams: Promise<{ casa?: string }> }) {
  await migrar()
  const sql = db()
  const lista = await sql<{ location_id: string; nome: string }[]>`select location_id, nome from casas where base = 'vendas' order by nome`
  const lid = (await searchParams).casa ?? lista[0]?.location_id
  const atual = lista.find(c => c.location_id === lid)
  if (!atual) return <div className="aviso">Nenhuma casa sincronizada ainda.</div>
  const volta = `/equipe?casa=${lid}`

  const modo = await modoDaCasa(lid)
  const [equipe, transferencias, comAcesso] = await Promise.all([
    equipeDaCasa(lid, modo !== 'ativo'),
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
  const naEquipe = new Set(equipe.map(m => m.usuario_id))
  const totalRecebido = equipe.reduce((s, m) => s + m.recebidos_7d, 0)

  async function mudarModo(f: FormData) {
    'use server'
    await definirModo(lid!, String(f.get('modo')) as Modo); revalidatePath('/equipe')
  }
  async function incluir(f: FormData) {
    'use server'
    await incluirNaEquipe(lid!, String(f.get('usuario'))); revalidatePath('/equipe')
  }
  async function sugerir() {
    'use server'
    for (const u of await sugerirEquipe(lid!)) await incluirNaEquipe(lid!, u)
    revalidatePath('/equipe')
  }
  async function alternar(f: FormData) {
    'use server'
    await definirAtivo(lid!, String(f.get('usuario')), f.get('ativo') === '1'); revalidatePath('/equipe')
  }
  async function remover(f: FormData) {
    'use server'
    await tirarDaEquipe(lid!, String(f.get('usuario'))); revalidatePath('/equipe')
  }
  async function simular(f: FormData) {
    'use server'
    const u = await usuarioAtual()
    await simularTransferencia({
      lid: lid!, de: String(f.get('de')), para: String(f.get('para')),
      destinoCasa: String(f.get('destino') || '') || null, incluirDescartados: f.get('descartados') === '1',
      usuario: u?.nome ?? '?',
    })
    redirect(volta)
  }
  async function confirmar(f: FormData) {
    'use server'
    await executarTransferencia(Number(f.get('id'))); redirect(volta)
  }
  async function cancelar(f: FormData) {
    'use server'
    await cancelarSimulacao(Number(f.get('id'))); redirect(volta)
  }

  return (
    <>
      <form className="filtros" action="/equipe">
        <select name="casa" defaultValue={lid}>
          {lista.map(c => <option key={c.location_id} value={c.location_id}>{c.nome}</option>)}
        </select>
        <button type="submit">Ver</button>
      </form>

      <h2 style={{ fontSize: 20 }}>Equipe e rodízio · {atual.nome}</h2>
      <form action={mudarModo} className="filtros">
        <span className="suave">Rodízio pelo painel:</span>
        <select name="modo" defaultValue={modo}>
          {Object.entries(MODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="submit">Salvar</button>
      </form>
      {modo === 'ativo' && (
        <div className="aviso">O painel está atribuindo os leads novos desta casa. A ação “Atribuir usuário” do workflow precisa estar desligada.</div>
      )}

      <h2>Quem está no rodízio</h2>
      <div className="tabela">
        <table>
          <thead><tr><th>Pessoa</th><th>No rodízio</th><th>{modo === 'ativo' ? 'Recebeu' : 'Receberia'} (7 dias)</th><th>Último</th><th></th></tr></thead>
          <tbody>
            {equipe.length === 0 && <tr><td colSpan={5} className="suave">Ninguém na equipe ainda.</td></tr>}
            {equipe.map(m => (
              <tr key={m.usuario_id}>
                <td>{m.nome ?? m.usuario_id}{!m.tem_acesso && <> <span className="alerta">sem acesso a esta conta no GHL</span></>}</td>
                <td>
                  <form action={alternar}>
                    <input type="hidden" name="usuario" value={m.usuario_id} />
                    <input type="hidden" name="ativo" value={m.ativo ? '0' : '1'} />
                    <button type="submit">{m.ativo ? 'Ativo · pausar' : 'Pausado · ativar'}</button>
                  </form>
                </td>
                <td>{m.recebidos_7d} <span className="suave">({pct(m.recebidos_7d, totalRecebido)})</span></td>
                <td>{dataHora(m.ultimo)}</td>
                <td>
                  <form action={remover}>
                    <input type="hidden" name="usuario" value={m.usuario_id} />
                    <button type="submit">Tirar da equipe</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="filtros">
        <form action={incluir} className="filtros">
          <select name="usuario">
            {comAcesso.filter(u => !naEquipe.has(u.id)).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
          <button type="submit">Incluir na equipe</button>
        </form>
        {equipe.length === 0 && (
          <form action={sugerir}><button type="submit">Montar com quem recebeu lead nos últimos 30 dias</button></form>
        )}
      </div>
      <p className="nota">Pausar tira a pessoa do rodízio sem mexer nos cards dela (férias, folga). Quem está pausado não recebe lead novo.</p>

      <h2>Transferir pessoa ou cards</h2>
      <form action={simular} className="cartao" style={{ display: 'grid', gap: 10, maxWidth: 640 }}>
        <label>Cards de <select name="de" required>
          {comAcesso.concat(orfaos).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select></label>
        <label>Vão para <select name="para" required>
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
        ficam com a pessoa como histórico. O acesso à conta da casa nova continua sendo dado no GHL.
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
                    <td className="txt">{Object.entries(m).map(([u, n]) => `${equipe.find(x => x.usuario_id === u)?.nome ?? comAcesso.find(x => x.id === u)?.nome ?? u}: ${n}`).join(' · ')}</td></tr>
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
