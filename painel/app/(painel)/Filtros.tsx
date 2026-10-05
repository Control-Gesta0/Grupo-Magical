import { BASES, hoje, nomeMes, ultimosMeses } from '@/lib/util'

function Bases({ base }: { base?: string }) {
  if (base === undefined) return null
  return (
    <select name="base" defaultValue={base}>
      {Object.entries(BASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  )
}

export function Filtros({ mes, base, acao }: { mes: string; base?: string; acao: string }) {
  return (
    <form className="filtros" action={acao}>
      <select name="mes" defaultValue={mes}>
        {ultimosMeses().map(m => <option key={m} value={m}>{nomeMes(m)}</option>)}
      </select>
      <Bases base={base} />
      <button type="submit">Ver</button>
    </form>
  )
}

export function FiltroPeriodo({ de, ate, base, acao }: { de: string; ate: string; base?: string; acao: string }) {
  return (
    <form className="filtros" action={acao}>
      <span className="suave">De</span>
      <input type="date" name="de" defaultValue={de} max={hoje()} required />
      <span className="suave">até</span>
      <input type="date" name="ate" defaultValue={ate} max={hoje()} required />
      <Bases base={base} />
      <button type="submit">Ver</button>
    </form>
  )
}
