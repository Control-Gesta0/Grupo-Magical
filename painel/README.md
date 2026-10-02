# Painel de Gestão · Grupo Magical

Painel das casas do Grupo Magical no GHL (Vertisell): leads, visitas, orçamentos, fechamentos,
fechamentos que pularam ORÇAMENTO/VISITA e oportunidades sem dono, por casa e por vendedor.

## Como funciona
- **Sincronização a cada hora** (`vercel.json`): o cron chama `/api/sync?i=N`, uma conta por minuto
  (índice da conta em `GHL_CASAS_JSON`). Até 36 contas sem mudar nada.
- Cada rodada puxa usuários, funis, todas as oportunidades e os agendamentos das agendas dos vendedores
  (−60 a +60 dias), e depois lê o **histórico de etapas** pelas atividades da conversa até ~230 s.
  O que não couber continua na próxima hora, começando pelo que mudou mais recentemente.
- As métricas comparam etapas pela chave (`lib/etapas.ts`), não pelo nome nem pelo ID, porque cada casa
  numera as etapas de um jeito e os IDs mudam por conta.

## Publicar na Vercel (conta Control Gestão)
1. **Add New → Project**, importar `Control-Gesta0/Grupo-Magical`, **Root Directory = `painel`**.
2. **Storage → Create Database → Neon (Postgres)** e conectar ao projeto (cria `DATABASE_URL`).
3. Em **Settings → Environment Variables**: `GHL_CASAS_JSON`, `CRON_SECRET`, `SESSION_SECRET`, `PAINEL_USUARIOS`.
4. Deploy. As tabelas são criadas na primeira sincronização.
5. Carga inicial mais rápida (opcional), de qualquer máquina com as variáveis:
   `npm run sync -- --minutos=30` (ou só uma casa: `npm run sync -- casa-rei`).

## Desenvolvimento
```bash
npm install
cp .env.example .env.local   # preencher
npm run sync -- casa-rei --minutos=2
npm run dev
```
