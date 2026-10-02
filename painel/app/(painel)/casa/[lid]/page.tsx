import Link from 'next/link'
import { notFound } from 'next/navigation'
import { casa, fechamentosQuePularam, periodoMes, porVendedor } from '@/lib/metricas'
import { BASES, dataHora, mesValido, nomeMes, pct } from '@/lib/util'
import { Filtros } from '../../Filtros'

export default async function Casa({ params, searchParams }: {
  params: Promise<{ lid: string }>
  searchParams: Promise<{ mes?: string }>
}) {
  const { lid } = await params
  const mes = mesValido((await searchParams).mes)
  const c = await casa(lid)
  if (!c) notFound()
  const [vendedores, pularam] = await Promise.all([porVendedor(periodoMes(mes), { lid }), fechamentosQuePularam(lid, periodoMes(mes))])

  return (
    <>
      <p><Link href={`/?mes=${mes}&base=${c.base}`}>← Todas as casas</Link></p>
      <h2 style={{ fontSize: 20, marginTop: 0 }}>{c.nome} <span className="suave">· {BASES[c.base] ?? c.base}</span></h2>
      <Filtros mes={mes} acao={`/casa/${lid}`} />

      <h2>Por vendedor · {nomeMes(mes)}</h2>
      <div className="tabela">
        <table>
          <thead>
            <tr><th>Vendedor</th><th>Leads</th><th>Agendamentos</th><th>Orçamentos</th><th>Fechamentos</th>
              <th>Sem orçamento</th><th>Agend. → orç.</th><th>Abertas hoje</th></tr>
          </thead>
          <tbody>
            {vendedores.map(v => (
              <tr key={v.dono_id ?? 'sem'}>
                <td>
                  {v.nome ?? <span className="suave">Usuário removido</span>}
                  {!v.na_casa && <> <span className="alerta">não está mais na casa</span></>}
                </td>
                <td>{v.leads}</td><td>{v.agendamentos}</td><td>{v.orcamentos}</td><td>{v.fechamentos}</td>
                <td>{v.pulou ? <span className="alerta">{v.pulou}</span> : 0}</td>
                <td>{pct(v.orcamentos, v.agendamentos)}</td>
                <td className={!v.na_casa && v.abertas ? 'ruim' : ''}>{v.abertas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="nota">Entradas nas etapas no mês, atribuídas ao dono atual do card.</p>

      <h2>Fecharam sem passar por orçamento · {pularam.length}</h2>
      {pularam.length === 0 ? <p className="suave">Nenhum no mês.</p> : (
        <div className="tabela">
          <table>
            <thead><tr><th>Oportunidade</th><th>Vendedor</th><th>Fechou em</th><th>Caminho no funil</th></tr></thead>
            <tbody>
              {pularam.map(p => (
                <tr key={p.id}>
                  <td className="txt">{p.nome}</td>
                  <td>{p.dono ?? '–'}</td>
                  <td>{dataHora(p.em)}</td>
                  <td className="txt suave">{p.caminho?.replace(/\d+\.\s*/g, '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
