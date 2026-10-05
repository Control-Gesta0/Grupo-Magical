import Link from 'next/link'
import { notFound } from 'next/navigation'
import { casa, periodoIntervalo, porVendedor, quePularam, type FechamentoPulou } from '@/lib/metricas'
import { BASES, dataCurta, dataHora, hoje, mesValido, pct, somarDias, somarMeses } from '@/lib/util'
import { FiltroPeriodo } from '../../Filtros'

const valida = (d: string | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null)

export default async function Casa({ params, searchParams }: {
  params: Promise<{ lid: string }>
  searchParams: Promise<{ de?: string; ate?: string; mes?: string }>
}) {
  const { lid } = await params
  const sp = await searchParams
  // aceita ?de=&ate= (padrão) ou o ?mes= dos links antigos
  const mes = mesValido(sp.mes)
  let de = valida(sp.de) ?? `${mes}-01`
  let ate = valida(sp.ate) ?? (sp.mes ? somarDias(somarMeses(`${mes}-01`, 1), -1) : hoje())
  if (ate > hoje()) ate = hoje()
  if (de > ate) de = ate
  const c = await casa(lid)
  if (!c) notFound()
  const periodo = periodoIntervalo(de, ate)
  const [vendedores, semOrcamento, semAgendamento] = await Promise.all([
    porVendedor(periodo, { lid }), quePularam(lid, periodo, 'fechamento'), quePularam(lid, periodo, 'orcamento'),
  ])
  const real = (v: { agendamentos: number; orc_sem: number }) => v.agendamentos + v.orc_sem

  return (
    <>
      <p><Link href={`/periodo?de=${de}&ate=${ate}&base=${c.base}`}>← Todas as casas</Link></p>
      <h2 style={{ fontSize: 20, marginTop: 0 }}>{c.nome} <span className="suave">· {BASES[c.base] ?? c.base}</span></h2>
      <FiltroPeriodo de={de} ate={ate} acao={`/casa/${lid}`} />

      <h2>Por vendedor · {dataCurta(de)} a {dataCurta(ate)}</h2>
      <div className="tabela">
        <table>
          <thead>
            <tr><th>Vendedor</th><th>Leads</th><th>Agend.</th><th>Agend. real</th><th>% agend.</th><th>Desfeitos</th>
              <th>Orçamentos</th><th>% orç.</th><th>Orç. sem agend.</th><th>Fechamentos</th><th>% fech.</th>
              <th>Fech. sem orç.</th><th>Abertas hoje</th></tr>
          </thead>
          <tbody>
            {vendedores.map(v => (
              <tr key={v.dono_id ?? 'sem'}>
                <td>
                  {v.nome ?? <span className="suave">Usuário removido</span>}
                  {!v.na_casa && <> <span className="alerta">não está mais na casa</span></>}
                </td>
                <td>{v.leads}</td><td>{v.agendamentos}</td><td>{real(v)}</td><td>{pct(real(v), v.leads)}</td>
                <td>{v.desfeitos ? <span className="alerta">{v.desfeitos}</span> : 0}</td>
                <td>{v.orcamentos}</td><td>{pct(v.orcamentos, real(v))}</td>
                <td>{v.orc_sem ? <span className="alerta">{v.orc_sem}</span> : 0}</td>
                <td>{v.fechamentos}</td><td>{pct(v.fechamentos, v.orcamentos)}</td>
                <td>{v.pulou ? <span className="alerta">{v.pulou}</span> : 0}</td>
                <td className={!v.na_casa && v.abertas ? 'ruim' : ''}>{v.abertas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="nota">Entradas nas etapas no período, atribuídas a quem era dono do card quando ele mudou de etapa.</p>

      <Lista titulo="Orçamento sem passar por agendamento" quando="Orçamento em" itens={semAgendamento} />
      <Lista titulo="Fecharam sem passar por orçamento" quando="Fechou em" itens={semOrcamento} />
    </>
  )
}

function Lista({ titulo, quando, itens }: { titulo: string; quando: string; itens: FechamentoPulou[] }) {
  return (
    <>
      <h2>{titulo} · {itens.length}</h2>
      {itens.length === 0 ? <p className="suave">Nenhum no período.</p> : (
        <div className="tabela">
          <table>
            <thead><tr><th>Oportunidade</th><th>Vendedor</th><th>{quando}</th><th>Caminho no funil</th></tr></thead>
            <tbody>
              {itens.map(p => (
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
