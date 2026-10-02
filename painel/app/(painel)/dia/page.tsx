import Link from 'next/link'
import { agendaDoDia } from '@/lib/metricas'
import { BASES, dataHora, diaValido, hoje, nomeDia } from '@/lib/util'

export default async function Dia({ searchParams }: { searchParams: Promise<{ data?: string; base?: string }> }) {
  const sp = await searchParams
  const data = diaValido(sp.data)
  const base = sp.base && BASES[sp.base] ? sp.base : 'vendas'
  const { casas, pessoas, sincronizadoAte } = await agendaDoDia(data, base)
  const meta = Number(process.env.META_AGENDAMENTOS_DIA) || 0
  const t = casas.reduce((s, c) => ({
    agendados: s.agendados + c.agendados, visitas: s.visitas + c.visitas, realizadas: s.realizadas + c.realizadas,
    faltas: s.faltas + c.faltas, canceladas: s.canceladas + c.canceladas,
  }), { agendados: 0, visitas: 0, realizadas: 0, faltas: 0, canceladas: 0 })

  return (
    <>
      <form className="filtros" action="/dia">
        <input type="date" name="data" defaultValue={data} max={hoje()} />
        <select name="base" defaultValue={base}>
          {Object.entries(BASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="submit">Ver</button>
      </form>
      <p className="suave">{nomeDia(data)} · {BASES[base]} · dados até {dataHora(sincronizadoAte)} (atualiza a cada hora)</p>

      <div className="cartoes">
        <div className="cartao"><div className="r">Agendamentos feitos no dia</div>
          <div className={`v ${meta && t.agendados < meta ? 'ruim' : ''}`}>{t.agendados}{meta ? <small className="suave"> / meta {meta}</small> : null}</div></div>
        <div className="cartao"><div className="r">Visitas marcadas para o dia</div><div className="v">{t.visitas}</div></div>
        <div className="cartao"><div className="r">Compareceram</div><div className="v">{t.realizadas}</div></div>
        <div className="cartao"><div className="r">Faltaram</div><div className={`v ${t.faltas ? 'ruim' : ''}`}>{t.faltas}</div></div>
        <div className="cartao"><div className="r">Canceladas</div><div className="v">{t.canceladas}</div></div>
      </div>

      <h2>Quem agendou no dia</h2>
      <div className="tabela">
        <table>
          <thead><tr><th>Pessoa</th><th>Casa</th><th>Agendamentos feitos</th></tr></thead>
          <tbody>
            {pessoas.length === 0 && <tr><td colSpan={3} className="suave">Nenhum agendamento criado neste dia.</td></tr>}
            {pessoas.map(p => (
              <tr key={p.usuario_id ?? 'sem'}>
                <td>{p.nome ?? <span className="suave">Usuário removido</span>}</td>
                <td className="txt">{p.casas}</td>
                <td>{p.agendados}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="nota">Conta quem criou o agendamento no GHL, na data em que ele foi criado (não a data da visita).</p>

      <h2>Por casa</h2>
      <div className="tabela">
        <table>
          <thead><tr><th>Casa</th><th>Agendamentos feitos</th><th>Visitas do dia</th><th>Compareceu</th><th>Faltou</th><th>Cancelada</th></tr></thead>
          <tbody>
            {casas.map(c => (
              <tr key={c.location_id}>
                <td><Link href={`/casa/${c.location_id}?mes=${data.slice(0, 7)}`}>{c.nome}</Link></td>
                <td>{c.agendados}</td><td>{c.visitas}</td><td>{c.realizadas}</td>
                <td className={c.faltas ? 'ruim' : ''}>{c.faltas}</td><td>{c.canceladas}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td>Total</td><td>{t.agendados}</td><td>{t.visitas}</td><td>{t.realizadas}</td><td>{t.faltas}</td><td>{t.canceladas}</td></tr>
          </tfoot>
        </table>
      </div>
      <p className="nota">Compareceu e Faltou dependem de a equipe marcar o status do agendamento no GHL.</p>
    </>
  )
}
