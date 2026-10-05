import { periodoAnterior, periodoIntervalo, periodoMes } from '@/lib/metricas'
import { BASES, hoje, mesAtual, mesValido, nomeMes, somarDias } from '@/lib/util'
import { Filtros } from './Filtros'
import { Placar } from './Placar'

export default async function Mes({ searchParams }: { searchParams: Promise<{ mes?: string; base?: string }> }) {
  const sp = await searchParams
  const mes = mesValido(sp.mes)
  const base = sp.base && BASES[sp.base] ? sp.base : 'vendas'
  // mês em andamento: até hoje, para comparar com os mesmos dias do mês anterior
  const periodo = mes === mesAtual() ? periodoIntervalo(`${mes}-01`, hoje()) : periodoMes(mes)
  return (
    <>
      <Filtros mes={mes} base={base} acao="/" />
      <Placar periodo={periodo} anterior={periodoAnterior(periodo)} base={base}
        qs={`de=${periodo.ini}&ate=${somarDias(periodo.fim, -1)}`} titulo={`${nomeMes(mes)} · ${BASES[base]}`} />
    </>
  )
}
