import Link from 'next/link'
import { porVendedor, resumoCasas, type LinhaCasa, type Periodo } from '@/lib/metricas'
import { dataHora, pct } from '@/lib/util'

type Soma = Pick<LinhaCasa, 'leads' | 'agendamentos' | 'orcamentos' | 'fechamentos' | 'pulou' | 'sem_dono' | 'dono_fora' | 'historico_ok' | 'historico_total'>
const CAMPOS: (keyof Soma)[] = ['leads', 'agendamentos', 'orcamentos', 'fechamentos', 'pulou', 'sem_dono', 'dono_fora', 'historico_ok', 'historico_total']

/** Placar por casa e por vendedor. Serve à tela Dia e à tela Mês; só muda o período. */
export async function Placar({ periodo, base, titulo, mes }: { periodo: Periodo; base: string; titulo: string; mes: string }) {
  const [casas, vendedores] = await Promise.all([resumoCasas(periodo, base), porVendedor(periodo, { base })])
  if (casas.length === 0) {
    return <div className="aviso">Nenhuma conta desta base sincronizada ainda. A sincronização roda nos primeiros minutos de cada hora.</div>
  }
  const t = Object.fromEntries(CAMPOS.map(c => [c, casas.reduce((s, l) => s + l[c], 0)])) as Soma
  const syncs = casas.map(l => l.ultima_sync).filter(Boolean) as Date[]
  const falhas = casas.filter(l => l.sync_ok === false)
  const ativos = vendedores.filter(v => v.agendamentos + v.orcamentos + v.fechamentos + v.leads > 0)

  return (
    <>
      <p className="suave">
        {titulo} · dados até {dataHora(syncs.length ? new Date(Math.min(...syncs.map(d => +new Date(d)))) : null)} (atualiza a cada hora)
      </p>
      {falhas.length > 0 && <div className="aviso">A última sincronização falhou em: {falhas.map(f => f.nome).join(', ')}.</div>}
      {t.historico_ok < t.historico_total && (
        <div className="aviso">
          Movimentações do período carregadas em {pct(t.historico_ok, t.historico_total)}. Os números ainda podem subir
          até a próxima atualização.
        </div>
      )}

      <div className="cartoes">
        <div className="cartao"><div className="r">Leads novos</div><div className="v">{t.leads}</div></div>
        <div className="cartao"><div className="r">Agendamentos</div><div className="v">{t.agendamentos}</div></div>
        <div className="cartao"><div className="r">Orçamentos (foram à casa)</div><div className="v">{t.orcamentos}</div></div>
        <div className="cartao"><div className="r">Fechamentos</div><div className="v">{t.fechamentos}</div></div>
        <div className="cartao"><div className="r">Fecharam sem orçamento</div>
          <div className={`v ${t.pulou ? 'ruim' : ''}`}>{t.pulou} <small className="suave">({pct(t.pulou, t.fechamentos)})</small></div></div>
        <div className="cartao"><div className="r">Abertas sem dono na casa</div>
          <div className={`v ${t.sem_dono + t.dono_fora ? 'ruim' : ''}`}>{t.sem_dono + t.dono_fora}</div></div>
      </div>

      <h2>Por vendedor</h2>
      <div className="tabela">
        <table>
          <thead><tr><th>Vendedor</th><th>Casa</th><th>Leads</th><th>Agendamentos</th><th>Orçamentos</th><th>Fechamentos</th><th>Sem orçamento</th></tr></thead>
          <tbody>
            {ativos.length === 0 && <tr><td colSpan={7} className="suave">Nenhuma movimentação no período.</td></tr>}
            {ativos.map(v => (
              <tr key={`${v.location_id}-${v.dono_id}`}>
                <td>{v.nome ?? <span className="suave">Usuário removido</span>}{!v.na_casa && <> <span className="alerta">fora da casa</span></>}</td>
                <td className="txt"><Link href={`/casa/${v.location_id}?mes=${mes}`}>{v.casa}</Link></td>
                <td>{v.leads}</td><td><strong>{v.agendamentos}</strong></td><td>{v.orcamentos}</td><td>{v.fechamentos}</td>
                <td>{v.pulou ? <span className="alerta">{v.pulou}</span> : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="nota">
        Agendamentos, orçamentos e fechamentos contam os cards que entraram na etapa no período, pelo histórico do GHL,
        atribuídos ao dono atual do card.
      </p>

      <h2>Por casa</h2>
      <div className="tabela">
        <table>
          <thead>
            <tr><th>Casa</th><th>Leads</th><th>Agendamentos</th><th>Orçamentos</th><th>Agend. → orç.</th><th>Fechamentos</th>
              <th>Sem orçamento</th><th>Sem dono</th><th>Dono fora da casa</th></tr>
          </thead>
          <tbody>
            {casas.map(l => (
              <tr key={l.location_id}>
                <td><Link href={`/casa/${l.location_id}?mes=${mes}`}>{l.nome}</Link></td>
                <td>{l.leads}</td><td>{l.agendamentos}</td><td>{l.orcamentos}</td><td>{pct(l.orcamentos, l.agendamentos)}</td>
                <td>{l.fechamentos}</td>
                <td>{l.pulou ? <span className="alerta">{l.pulou} ({pct(l.pulou, l.fechamentos)})</span> : 0}</td>
                <td className={l.sem_dono ? 'ruim' : ''}>{l.sem_dono}</td>
                <td className={l.dono_fora ? 'ruim' : ''}>{l.dono_fora}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td><td>{t.leads}</td><td>{t.agendamentos}</td><td>{t.orcamentos}</td><td>{pct(t.orcamentos, t.agendamentos)}</td>
              <td>{t.fechamentos}</td><td>{t.pulou} ({pct(t.pulou, t.fechamentos)})</td><td>{t.sem_dono}</td><td>{t.dono_fora}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="nota">
        "Agend. → orç." compara entradas no mesmo período, não acompanha o mesmo cliente.
        "Sem orçamento" é o fechamento que não passou por ORÇAMENTO/VISITA antes.
      </p>
    </>
  )
}
