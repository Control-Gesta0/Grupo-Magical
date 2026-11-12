import { casas } from '@/lib/casas'
import { ghl, ghlGravar } from '@/lib/ghl'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Inclui opções no campo "Motivo do Descarte" das oportunidades em todas as contas de vendas. Protegido pelo CRON_SECRET.
// GET mostra o que mudaria, POST aplica. ?novos=Outros|Crianças/Idoso|Cliques por engano
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

async function rodar(req: Request, aplicar: boolean) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }
  const novos = [...new Set((new URL(req.url).searchParams.get('novos') ?? '').split('|').map(s => s.trim()).filter(Boolean))]
  if (!novos.length) return Response.json({ erro: 'informe ?novos=' }, { status: 400 })
  const resultado = []
  for (const casa of casas().filter(c => c.base === 'vendas')) {
    try {
      const { customFields = [] } = await ghl<{ customFields: any[] }>(
        `/locations/${casa.locationId}/customFields?model=opportunity`, casa.token)
      const campo = customFields.find(f => normal(f.name ?? '').includes('motivo') && normal(f.name ?? '').includes('descarte'))
      if (!campo) { resultado.push({ casa: casa.nome, erro: 'campo não encontrado', campos: customFields.map(f => `${f.name} (${f.dataType})`) }); continue }
      const atuais: string[] = campo.picklistOptions ?? []
      // "Outro" e "Outros" contam como a mesma opção
      const igual = (a: string, b: string) => normal(a).replace(/s$/, '') === normal(b).replace(/s$/, '')
      const faltam = novos.filter(n => !atuais.some(a => igual(a, n)))
      if (aplicar && faltam.length) {
        await ghlGravar('PUT', `/locations/${casa.locationId}/customFields/${campo.id}`, casa.token, {
          name: campo.name, model: 'opportunity', options: [...atuais, ...faltam],
        })
      }
      const depois = aplicar && faltam.length
        ? (await ghl<{ customField: any }>(`/locations/${casa.locationId}/customFields/${campo.id}`, casa.token)).customField?.picklistOptions
        : undefined
      resultado.push({ casa: casa.nome, campo: campo.name, tipo: campo.dataType, atuais, faltam, depois })
    } catch (e: any) {
      resultado.push({ casa: casa.nome, erro: String(e?.message ?? e).slice(0, 300) })
    }
  }
  return Response.json({ aplicado: aplicar, novos, resultado })
}

export const GET = (req: Request) => rodar(req, false)
export const POST = (req: Request) => rodar(req, true)
