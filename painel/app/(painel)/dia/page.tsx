import { periodoDia } from '@/lib/metricas'
import { BASES, diaValido, hoje, nomeDia } from '@/lib/util'
import { Placar } from '../Placar'

export default async function Dia({ searchParams }: { searchParams: Promise<{ data?: string; base?: string }> }) {
  const sp = await searchParams
  const data = diaValido(sp.data)
  const base = sp.base && BASES[sp.base] ? sp.base : 'vendas'
  return (
    <>
      <form className="filtros" action="/dia">
        <input type="date" name="data" defaultValue={data} max={hoje()} />
        <select name="base" defaultValue={base}>
          {Object.entries(BASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="submit">Ver</button>
      </form>
      <Placar periodo={periodoDia(data)} base={base} mes={data.slice(0, 7)} titulo={`${nomeDia(data)} · ${BASES[base]}`} />
    </>
  )
}
