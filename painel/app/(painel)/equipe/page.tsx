import { revalidatePath } from 'next/cache'
import { db, migrar } from '@/lib/db'
import {
  definirAtivo, definirModo, equipeDaCasa, incluirNaEquipe, modoDaCasa, sugerirEquipe, tirarDaEquipe, type Modo,
} from '@/lib/rodizio'
import { dataHora, pct } from '@/lib/util'

const MODOS: Record<Modo, string> = {
  desligado: 'Desligado (o workflow do CRM atribui)',
  simulacao: 'Simulação (o painel só registra quem receberia)',
  ativo: 'Ativo (o painel atribui de verdade)',
}

export default async function Equipe({ searchParams }: { searchParams: Promise<{ casa?: string }> }) {
  await migrar()
  const sql = db()
  const lista = await sql<{ location_id: string; nome: string }[]>`select location_id, nome from casas where base = 'vendas' order by nome`
  const lid = (await searchParams).casa ?? lista[0]?.location_id
  const atual = lista.find(c => c.location_id === lid)
  if (!atual) return <div className="aviso">Nenhuma casa sincronizada ainda.</div>

  const modo = await modoDaCasa(lid)
  const [equipe, comAcesso] = await Promise.all([
    equipeDaCasa(lid, modo !== 'ativo'),
    sql<{ id: string; nome: string }[]>`
      select u.id, u.nome from usuario_casa uc join usuarios u on u.id = uc.usuario_id
      where uc.location_id = ${lid} order by u.nome`,
  ])
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
                <td>{m.nome ?? m.usuario_id}{!m.tem_acesso && <> <span className="alerta">sem acesso a esta conta no CRM</span></>}</td>
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
    </>
  )
}
