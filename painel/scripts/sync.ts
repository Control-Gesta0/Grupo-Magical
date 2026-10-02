// Carga pela linha de comando: npm run sync [-- slug-da-casa] [-- --minutos=N]
import { casas } from '../lib/casas'
import { sincronizarCasa } from '../lib/sync'
import { db } from '../lib/db'

const args = process.argv.slice(2)
const minutos = Number(args.find(a => a.startsWith('--minutos='))?.split('=')[1] ?? 10)
const filtro = args.filter(a => !a.startsWith('--'))

async function main() {
  for (const c of casas()) {
    if (filtro.length && !filtro.includes(c.casa) && !filtro.includes(`${c.casa}/${c.base}`)) continue
    try {
      console.log(await sincronizarCasa(c, Date.now() + minutos * 60_000))
    } catch (e: any) {
      console.error(c.casa, c.base, 'ERRO', e.message)
    }
  }
  await db().end()
}
main()
