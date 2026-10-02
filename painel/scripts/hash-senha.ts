// Gera o hash para PAINEL_USUARIOS: npm run hash-senha -- 'senha'
import { hashSenha } from '../lib/auth'
const senha = process.argv[2]
if (!senha) { console.error("uso: npm run hash-senha -- 'senha'"); process.exit(1) }
console.log(hashSenha(senha))
