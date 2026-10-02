import Link from 'next/link'
import { resumoCasas, type LinhaCasa } from '@/lib/metricas'
import { BASES, dataHora, mesValido, nomeMes, pct } from '@/lib/util'
import { Filtros } from './Filtros'

type Soma = Omit<LinhaCasa, 'location_id' | 'casa' | 'nome' | 'base' | 'ultima_sync' | 'sync_ok'>
const CAMPOS: (keyof Soma)[] = ['leads', 'agendados', 'visitas', 'realizadas', 'faltas', 'canceladas', 'orcamentos',
  'fechamentos', 'pulou', 'sem_dono', 'dono_fora', 'historico_ok', 'historico_total']

export default async function VisaoGeral({ searchParams }: { searchParams: Promise<{ mes?: string; base?: string }> }) {
  const sp = await searchParams
  const mes = mesValido(sp.mes)
  const base = sp.base && BASES[sp.base] ? sp.base : 'vendas'
  const linhas = await resumoCasas(mes, base)
  if (linhas.length === 0) {
    return (
      <>
        <Filtros mes={mes} base={base} acao="/" />
        <div className="aviso">
          Nenhuma conta de {BASES[base]} sincronizada ainda. A sincronização roda nos primeiros minutos de cada hora;
          volte depois da próxima hora cheia.
        </div>
      </>
    )
  }
  const t = Object.fromEntries(CAMPOS.map(c => [c, linhas.reduce((s, l) => s + l[c], 0)])) as Soma
  const semComparecimento = t.visitas > 0 && t.realizadas + t.faltas < t.visitas * 0.2
  const historicoIncompleto = t.historico_total > 0 && t.historico_ok < t.historico_total
  const syncs = linhas.map(l => l.ultima_sync).filter(Boolean) as Date[]
  const falhas = linhas.filter(l => l.sync_ok === false)

  return (
    <>
      <Filtros mes={mes} base={base} acao="/" />
      <p className="suave">
        {nomeMes(mes)} · {BASES[base]} · {linhas.length} {linhas.length === 1 ? 'conta' : 'contas'} ·
        sincronizado até {dataHora(syncs.length ? new Date(Math.min(...syncs.map(d => +new Date(d)))) : null)}
      </p>
      {falhas.length > 0 && <div className="aviso">A última sincronização falhou em: {falhas.map(f => f.nome).join(', ')}.</div>}
      {historicoIncompleto && (
        <div className="aviso">
          Histórico de etapas do mês carregado em {pct(t.historico_ok, t.historico_total)}. Orçamentos e fechamentos
          ainda podem subir enquanto a carga termina.
        </div>
      )}

      <div className="cartoes">
        <div className="cartao"><div className="r">Leads novos</div><div className="v">{t.leads}</div></div>
        <div className="cartao"><div className="r">Visitas agendadas no mês</div><div className="v">{t.agendados}</div></div>
        <div className="cartao"><div className="r">Visitas com data no mês</div><div className="v">{t.visitas}</div></div>
        <div className="cartao"><div className="r">Chegaram em orçamento</div><div className="v">{t.orcamentos}</div></div>
        <div className="cartao"><div className="r">Fechamentos</div><div className="v">{t.fechamentos}</div></div>
        <div className="cartao"><div className="r">Fecharam sem orçamento</div>
          <div className={`v ${t.pulou ? 'ruim' : ''}`}>{t.pulou} <small className="suave">({pct(t.pulou, t.fechamentos)})</small></div></div>
        <div className="cartao"><div className="r">Abertas sem dono na casa</div>
          <div className={`v ${t.sem_dono + t.dono_fora ? 'ruim' : ''}`}>{t.sem_dono + t.dono_fora}</div></div>
      </div>

      <div className="tabela">
        <table>
          <thead>
            <tr>
              <th>Casa</th><th>Leads</th><th>Visitas agendadas</th><th>Visitas no mês</th><th>Compareceu</th><th>Faltou</th>
              <th>Orçamentos</th><th>Fechamentos</th><th>Sem orçamento</th><th>Fech. ÷ leads</th>
              <th>Sem dono</th><th>Dono fora da casa</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.location_id}>
                <td><Link href={`/casa/${l.location_id}?mes=${mes}`}>{l.nome}</Link></td>
                <td>{l.leads}</td><td>{l.agendados}</td><td>{l.visitas}</td><td>{l.realizadas}</td><td>{l.faltas}</td>
                <td>{l.orcamentos}</td><td>{l.fechamentos}</td>
                <td>{l.pulou ? <span className="alerta">{l.pulou} ({pct(l.pulou, l.fechamentos)})</span> : 0}</td>
                <td>{pct(l.fechamentos, l.leads)}</td>
                <td className={l.sem_dono ? 'ruim' : ''}>{l.sem_dono}</td>
                <td className={l.dono_fora ? 'ruim' : ''}>{l.dono_fora}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td><td>{t.leads}</td><td>{t.agendados}</td><td>{t.visitas}</td><td>{t.realizadas}</td><td>{t.faltas}</td>
              <td>{t.orcamentos}</td><td>{t.fechamentos}</td><td>{t.pulou} ({pct(t.pulou, t.fechamentos)})</td>
              <td>{pct(t.fechamentos, t.leads)}</td><td>{t.sem_dono}</td><td>{t.dono_fora}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="nota">
        Orçamentos e fechamentos contam quem entrou na etapa no mês, pelo histórico de movimentações.
        "Sem orçamento" é o fechamento que não passou por ORÇAMENTO/VISITA antes.
        {semComparecimento && ' Compareceu e Faltou só aparecem nas casas que marcam o status do agendamento no GHL.'}
      </p>
    </>
  )
}
