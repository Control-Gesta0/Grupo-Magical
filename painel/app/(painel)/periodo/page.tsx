import { periodoAnterior, periodoIntervalo } from '@/lib/metricas'
import { BASES, dataCurta, hoje } from '@/lib/util'
import { FiltroPeriodo } from '../Filtros'
import { Placar } from '../Placar'

const valida = (d: string | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null)

export default async function Periodo({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string; base?: string }> }) {
  const sp = await searchParams
  const ate = valida(sp.ate) ?? hoje()
  let de = valida(sp.de) ?? `${ate.slice(0, 7)}-01`
  if (de > ate) de = ate
  const base = sp.base && BASES[sp.base] ? sp.base : 'vendas'
  const periodo = periodoIntervalo(de, ate)
  return (
    <>
      <FiltroPeriodo de={de} ate={ate} base={base} acao="/periodo" />
      <Placar periodo={periodo} anterior={periodoAnterior(periodo)} base={base} qs={`de=${de}&ate=${ate}`}
        titulo={`${dataCurta(de)} a ${dataCurta(ate)} · ${BASES[base]}`} />
    </>
  )
}
