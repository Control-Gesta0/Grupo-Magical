# Infraestrutura · Magical Decoração

Projeto separado do painel de vendas: um deploy da decoração nunca derruba o rodízio das vendas.
Uma conta GHL de decoração = uma linha de configuração; outras casas entram sem mudar código.

## 1. Criar (feito pela Control Gestão, ~15 min)

| # | Onde | O que | Status |
|---|---|---|---|
| 1 | GitHub `Control-Gesta0` | Repositório **privado** `Magical-Decoracao`, vazio (sem README) | pendente: a integração do Claude não tem permissão para criar repositório na organização (403) |
| 2 | claude.ai/connect-github | Liberar o app do Claude para `Magical-Decoracao` | pendente |
| 3 | Vercel (conta Control Gestão) | Add New → Project → importar `Magical-Decoracao`. Nome do projeto: `magical-decoracao` | pendente |
| 4 | Vercel → Storage | Upstash Redis (Marketplace) conectado ao projeto: fila de mensagens, trava de resposta dupla, diário de execuções | pendente |
| 5 | GHL subconta Decoração | Resolver o alerta da integração "Painel Control Gestao" ou criar uma nova "Agente IA Decoração" com os escopos abaixo | pendente |
| 6 | Zaptos | Confirmar o número da decoração conectado no canal SMS da subconta e que ele não está em outro sistema | pendente |
| 7 | Chave de IA | Anthropic (conta comercial, não assinatura) para a conversa; OpenAI para foto, vídeo e áudio | pendente |

### Escopos da integração privada (GHL)
Leitura e escrita: contatos, conversas, mensagens de conversas, oportunidades, calendários e eventos.
Somente leitura: campos personalizados, usuários, workflows, formulários e respostas.

## 2. Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | O que é |
|---|---|
| `GHL_CASAS_JSON` | `[{"casa":"chateau-decoracao","nome":"Chateau do Lago · Decoração","base":"decoracao","locationId":"ovLCG3IhY5QY9aHDHISU","token":"pit-..."}]` |
| `ANTHROPIC_API_KEY` | conversa com o casal |
| `OPENAI_API_KEY` | descrição de foto/vídeo e transcrição de áudio |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | criadas pela Vercel ao conectar o Upstash |
| `WEBHOOK_SECRET` | novo, `openssl rand -hex 24`; vai na URL do webhook do workflow do GHL |
| `CRON_SECRET` | guardião diário |
| `GATE_TAG` | etiqueta que libera a IA no contato (ex.: `ia-decoracao`) |
| `SELF_URL` | endereço público do projeto (nunca o `VERCEL_URL`) |
| `CLIENT_NAME` | `Chateau do Lago · Decoração` |

## 3. Depois de criado (Claude)
1. Primeira carga do repositório: diagnóstico, templates, configuração por casa, raio-x da decoração.
2. Raio-x somente leitura: foto do antes da jornada (90 dias).
3. Agente só depois do diagnóstico fechado (seções 5, 8.5 e 9 do `DIAGNOSTICO-CHATEAU.md`).
