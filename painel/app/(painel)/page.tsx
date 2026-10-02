import { periodoMes } from '@/lib/metricas'
import { BASES, mesValido, nomeMes } from '@/lib/util'
import { Filtros } from './Filtros'
import { Placar } from './Placar'

export default async function Mes({ searchParams }: { searchParams: Promise<{ mes?: string; base?: string }> }) {
  const sp = await searchParams
  const mes = mesValido(sp.mes)
  const base = sp.base && BASES[sp.base] ? sp.base : 'vendas'
  return (
    <>
      <Filtros mes={mes} base={base} acao="/" />
      <Placar periodo={periodoMes(mes)} base={base} mes={mes} titulo={`${nomeMes(mes)} · ${BASES[base]}`} />
    </>
  )
}
