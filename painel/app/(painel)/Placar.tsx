import Link from 'next/link'
import type { ReactNode } from 'react'
import { agendamentosDesfeitos, porVendedor, resumoCasas, type LinhaCasa, type Periodo } from '@/lib/metricas'
import { dataCurta, dataHora, pct, somarDias, variacao } from '@/lib/util'

type Soma = Pick<LinhaCasa, 'leads' | 'agendamentos' | 'desfeitos' | 'orcamentos' | 'fechamentos' | 'pulou' | 'orc_sem' | 'sem_dono' | 'dono_fora' | 'historico_ok' | 'historico_total'>
const CAMPOS: (keyof Soma)[] = ['leads', 'agendamentos', 'desfeitos', 'orcamentos', 'fechamentos', 'pulou', 'orc_sem', 'sem_dono', 'dono_fora', 'historico_ok', 'historico_total']
const somar = (ls: LinhaCasa[]) => Object.fromEntries(CAMPOS.map(c => [c, ls.reduce((s, l) => s + l[c], 0)])) as Soma

/** Agendamento real = registrado em AGENDAMENTO + foi a orçamento sem passar por agendamento (pulou a etapa). */
const real = (l: { agendamentos: number; orc_sem: number }) => l.agendamentos + l.orc_sem

function Cartao({ rotulo, valor, sub, antes, ruim }: { rotulo: string; valor: number; sub?: ReactNode; antes?: number; ruim?: boolean }) {
  return (
    <div className="cartao">
      <div className="r">{rotulo}</div>
      <div className={`v ${ruim && valor ? 'ruim' : ''}`}>{valor}</div>
      {sub && <div className="s">{sub}</div>}
      {antes !== undefined && <div className="s suave">antes: {antes} ({variacao(valor, antes)})</div>}
    </div>
  )
}

/**
 * Placar por casa e por vendedor. Serve às telas Dia, Mês e Período; só muda o período.
 * Com `anterior`, os cartões comparam com as mesmas datas do mês anterior.
 */
export async function Placar({ periodo, anterior, base, titulo, qs }: {
  periodo: Periodo; anterior?: Periodo; base: string; titulo: string; qs: string
}) {
  const [casas, vendedores, desfeitos, casasAntes] = await Promise.all([
    resumoCasas(periodo, base), porVendedor(periodo, { base }), agendamentosDesfeitos(periodo, base),
    anterior ? resumoCasas(anterior, base) : Promise.resolve(null),
  ])
  if (casas.length === 0) {
    return <div className="aviso">Nenhuma conta desta base sincronizada ainda. A sincronização roda nos primeiros minutos de cada hora.</div>
  }
  const t = somar(casas)
  const a = casasAntes ? somar(casasAntes) : null
  const syncs = casas.map(l => l.ultima_sync).filter(Boolean) as Date[]
  const falhas = casas.filter(l => l.sync_ok === false)
  // todo o rodízio de cada casa aparece, mesmo zerado; fora dele, só quem teve movimentação no período
  const ativos = vendedores.filter(v => v.na_equipe || v.agendamentos + v.orcamentos + v.fechamentos + v.leads > 0)

  return (
    <>
      <p className="suave">
        {titulo} · dados até {dataHora(syncs.length ? new Date(Math.min(...syncs.map(d => +new Date(d)))) : null)} (atualiza a cada hora)
        {anterior && <> · comparado com {dataCurta(anterior.ini)} a {dataCurta(somarDias(anterior.fim, -1))}</>}
      </p>
      {falhas.length > 0 && <div className="aviso">A última sincronização falhou em: {falhas.map(f => f.nome).join(', ')}.</div>}
      {t.historico_ok < t.historico_total && (
        <div className="aviso">
          Movimentações do período carregadas em {pct(t.historico_ok, t.historico_total)}. Os números ainda podem subir
          até a próxima atualização.
        </div>
      )}

      <div className="cartoes">
        <Cartao rotulo="Leads novos" valor={t.leads} antes={a?.leads} />
        <Cartao rotulo="Agendamentos registrados" valor={t.agendamentos} antes={a?.agendamentos}
          sub={<>{pct(t.agendamentos, t.leads)} dos leads</>} />
        <Cartao rotulo="Agendamento real" valor={real(t)} antes={a ? real(a) : undefined}
          sub={<><strong>{pct(real(t), t.leads)} dos leads</strong> · {pct(t.agendamentos, real(t))} registrado</>} />
        <Cartao rotulo="Orçamentos (foram à casa)" valor={t.orcamentos} antes={a?.orcamentos}
          sub={<>{pct(t.orcamentos, real(t))} do agend. real</>} />
        <Cartao rotulo="Orçamento sem agendamento" valor={t.orc_sem} antes={a?.orc_sem} ruim
          sub={<>{pct(t.orc_sem, t.orcamentos)} dos orçamentos</>} />
        <Cartao rotulo="Fechamentos" valor={t.fechamentos} antes={a?.fechamentos}
          sub={<>{pct(t.fechamentos, t.orcamentos)} dos orçamentos</>} />
        <Cartao rotulo="Fecharam sem orçamento" valor={t.pulou} antes={a?.pulou} ruim
          sub={<>{pct(t.pulou, t.fechamentos)} dos fechamentos</>} />
        <Cartao rotulo="Agend. desfeitos no mesmo dia" valor={t.desfeitos} antes={a?.desfeitos} ruim />
        <Cartao rotulo="Abertas sem dono na casa" valor={t.sem_dono + t.dono_fora} ruim />
      </div>

      <h2>Por vendedor</h2>
      <div className="tabela">
        <table>
          <thead>
            <tr><th>Vendedor</th><th>Casa</th><th>Leads</th><th>Agend.</th><th>Agend. real</th><th>% agend.</th><th>Desfeitos</th>
              <th>Orçamentos</th><th>% orç.</th><th>Orç. sem agend.</th><th>Fechamentos</th><th>% fech.</th><th>Fech. sem orç.</th></tr>
          </thead>
          <tbody>
            {ativos.length === 0 && <tr><td colSpan={13} className="suave">Ninguém no rodízio e nenhuma movimentação no período.</td></tr>}
            {ativos.map(v => (
              <tr key={`${v.location_id}-${v.dono_id}`}>
                <td>{v.nome ?? <span className="suave">Usuário removido</span>}{!v.na_casa && <> <span className="alerta">fora da casa</span></>}{v.pausado && <> <span className="etiqueta">pausado</span></>}</td>
                <td className="txt"><Link href={`/casa/${v.location_id}?${qs}`}>{v.casa}</Link></td>
                <td>{v.leads}</td><td><strong>{v.agendamentos}</strong></td><td>{real(v)}</td><td>{pct(real(v), v.leads)}</td>
                <td>{v.desfeitos ? <span className="alerta">{v.desfeitos}</span> : 0}</td>
                <td>{v.orcamentos}</td><td>{pct(v.orcamentos, real(v))}</td>
                <td>{v.orc_sem ? <span className="alerta">{v.orc_sem}</span> : 0}</td>
                <td>{v.fechamentos}</td><td>{pct(v.fechamentos, v.orcamentos)}</td>
                <td>{v.pulou ? <span className="alerta">{v.pulou}</span> : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="nota">
        Contam os cards que entraram na etapa no período, pelo histórico do CRM, atribuídos a quem era dono do card quando
        ele mudou de etapa. "Agend. real" soma os agendamentos registrados com os orçamentos que não passaram por
        AGENDAMENTO (visita marcada com o card parado em qualificação). % agend. = agend. real ÷ leads;
        % orç. = orçamentos ÷ agend. real; % fech. = fechamentos ÷ orçamentos.
      </p>

      {desfeitos.length > 0 && (
        <>
          <h2>Agendamentos desfeitos no mesmo dia · {desfeitos.length}</h2>
          <div className="tabela">
            <table>
              <thead><tr><th>Card</th><th>Vendedor</th><th>Casa</th><th>Entrou em Agendamento</th><th>Saiu</th><th>Foi para</th></tr></thead>
              <tbody>
                {desfeitos.map(d => (
                  <tr key={`${d.oportunidade_id}-${+new Date(d.em)}`}>
                    <td className="txt">{d.card}</td><td>{d.vendedor ?? '–'}</td><td className="txt">{d.casa}</td>
                    <td>{dataHora(d.em)}</td><td>{dataHora(d.prox_em)}</td>
                    <td className="txt">{d.prox_etapa?.replace(/^\d+\.\s*/, '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="nota">
            Card que entrou em AGENDAMENTO e, no mesmo dia, voltou para uma etapa anterior ou foi descartado.
            Pode ser cancelamento legítimo do cliente; vale conferir quando se repete com a mesma pessoa.
          </p>
        </>
      )}

      <h2>Por casa</h2>
      <div className="tabela">
        <table>
          <thead>
            <tr><th>Casa</th><th>Leads</th><th>Agend.</th><th>Agend. real</th><th>% agend.</th><th>Orçamentos</th><th>% orç.</th>
              <th>Orç. sem agend.</th><th>Fechamentos</th><th>% fech.</th><th>Fech. sem orç.</th><th>Sem dono</th><th>Dono fora</th></tr>
          </thead>
          <tbody>
            {casas.map(l => (
              <tr key={l.location_id}>
                <td><Link href={`/casa/${l.location_id}?${qs}`}>{l.nome}</Link></td>
                <LinhaNumeros l={l} />
                <td className={l.sem_dono ? 'ruim' : ''}>{l.sem_dono}</td>
                <td className={l.dono_fora ? 'ruim' : ''}>{l.dono_fora}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td>Total</td><LinhaNumeros l={t} /><td>{t.sem_dono}</td><td>{t.dono_fora}</td></tr>
            {a && <tr className="suave"><td>Período anterior</td><LinhaNumeros l={a} /><td></td><td></td></tr>}
          </tfoot>
        </table>
      </div>
      <p className="nota">
        Os percentuais comparam entradas no mesmo período, não acompanham o mesmo cliente: um orçamento de hoje pode vir
        de um agendamento do mês passado.
      </p>
    </>
  )
}

function LinhaNumeros({ l }: { l: Pick<Soma, 'leads' | 'agendamentos' | 'orc_sem' | 'orcamentos' | 'fechamentos' | 'pulou'> }) {
  return (
    <>
      <td>{l.leads}</td><td>{l.agendamentos}</td><td>{real(l)}</td><td><strong>{pct(real(l), l.leads)}</strong></td>
      <td>{l.orcamentos}</td><td><strong>{pct(l.orcamentos, real(l))}</strong></td>
      <td>{l.orc_sem ? <span className="alerta">{l.orc_sem} ({pct(l.orc_sem, l.orcamentos)})</span> : 0}</td>
      <td>{l.fechamentos}</td><td><strong>{pct(l.fechamentos, l.orcamentos)}</strong></td>
      <td>{l.pulou ? <span className="alerta">{l.pulou} ({pct(l.pulou, l.fechamentos)})</span> : 0}</td>
    </>
  )
}

