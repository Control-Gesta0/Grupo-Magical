export type ChaveEtapa =
  | 'novo_lead' | 'ligacao' | 'qualificacao' | 'follow_up'
  | 'agendamento' | 'orcamento' | 'fechamento' | 'descartado'

const REGRAS: [RegExp, ChaveEtapa][] = [
  [/NOVO LEAD/, 'novo_lead'],
  [/LIGA[CÇ][AÃ]O/, 'ligacao'],
  [/QUALIFICA/, 'qualificacao'],
  [/FOLLOW/, 'follow_up'],
  [/AGENDAMENTO/, 'agendamento'],
  [/OR[CÇ]AMENTO/, 'orcamento'],
  [/FECHAMENTO/, 'fechamento'],
  [/DESCARTADO/, 'descartado'],
]

/**
 * As casas usam o mesmo funil, mas umas numeram as etapas ("5. AGENDAMENTO") e outras não.
 * O painel compara pela chave, nunca pelo nome ou pelo ID (que muda em cada conta).
 */
export function chaveEtapa(nome: string | null | undefined): ChaveEtapa | null {
  if (!nome) return null
  const n = nome.toUpperCase()
  for (const [re, chave] of REGRAS) if (re.test(n)) return chave
  return null
}
