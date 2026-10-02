import { BASES, nomeMes, ultimosMeses } from '@/lib/util'

export function Filtros({ mes, base, acao }: { mes: string; base?: string; acao: string }) {
  return (
    <form className="filtros" action={acao}>
      <select name="mes" defaultValue={mes}>
        {ultimosMeses().map(m => <option key={m} value={m}>{nomeMes(m)}</option>)}
      </select>
      {base !== undefined && (
        <select name="base" defaultValue={base}>
          {Object.entries(BASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      )}
      <button type="submit">Ver</button>
    </form>
  )
}
