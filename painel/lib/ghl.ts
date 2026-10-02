const API = 'https://services.leadconnectorhq.com'

export class GhlErro extends Error {
  constructor(public status: number, public corpo: string, caminho: string) {
    super(`GHL ${status} em ${caminho}: ${corpo.slice(0, 200)}`)
  }
}

const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

async function requisitar<T>(metodo: string, caminho: string, token: string, versao: string, corpo?: unknown): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    const r = await fetch(API + caminho, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: versao,
        Accept: 'application/json',
        ...(corpo ? { 'Content-Type': 'application/json' } : {}),
        // sem User-Agent de navegador o Cloudflare do GHL responde 403 (erro 1010)
        'User-Agent': 'Mozilla/5.0 (painel-magical)',
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: 'no-store',
    })
    if (r.ok) return (await r.json()) as T
    if ((r.status === 429 || r.status >= 500) && tentativa < 4) {
      await espera(1500 * (tentativa + 1))
      continue
    }
    throw new GhlErro(r.status, await r.text(), caminho)
  }
}

export function ghl<T = any>(caminho: string, token: string, versao = '2021-07-28'): Promise<T> {
  return requisitar<T>('GET', caminho, token, versao)
}

/** Escrita no GHL (PUT/POST). Só o rodízio e a transferência usam. */
export function ghlGravar<T = any>(metodo: 'PUT' | 'POST', caminho: string, token: string, corpo: unknown): Promise<T> {
  return requisitar<T>(metodo, caminho, token, '2021-07-28', corpo)
}
