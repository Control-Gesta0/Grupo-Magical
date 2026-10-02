# Painel de Gestão · Grupo Magical

## Decisões (02/10/2026)
- Acesso inicial: Núbia, Evelin e Rachel (login simples; dados gravados por casa para abrir visão por gerente depois).
- Funil: as 11 casas de vendas seguem o mesmo padrão de 8 etapas; decoração e planejamento têm funil próprio.
- Visitas: agendamentos no GHL (hoje nas agendas pessoais dos vendedores, não no calendário "Visita Marcada").
- Usuários: mesmo ID em todas as subcontas; alguns atuam em várias casas.
- Atribuição: rodízio igual por casa.
- Atualização do painel: a cada hora (sincronização via API, sem webhook por enquanto).
- Casa piloto do rodízio central: Casa Rei.
- Definições da Núbia: agendamento = card entra na etapa AGENDAMENTO; orçamento = cliente foi à casa (card entra em ORÇAMENTO/VISITA). O painel conta entradas nas etapas pelo histórico, por vendedor (dono do card); a agenda do GHL não é usada nas telas.
- Meta diária de agendamentos: fora por enquanto (era pontual). Se voltar, basta definir META_AGENDAMENTOS_DIA na Vercel.
- Monte Belvedere: casa nova (por isso só tem oportunidades de setembro).
- Hospedagem: conta Vercel da Control Gestão, Postgres pelo Marketplace da Vercel.

## Fases
0. Raio-X completo (falta Évora) + apresentação + 4 regras com a Núbia/Evelin
   (o que é visita, comparecimento, ganho/perdido, aviso × trava ao pular Orçamento).
1. Painel de leitura: sincronização horária → Postgres → painel por casa/vendedor,
   com histórico de etapas recuperado do passado.
2. Cadastro central de equipe + rodízio + redistribuição de órfãos (piloto Casa Rei, exige token com escrita).
3. Bases de planejamento e decoração (uma linha de configuração por base).

## Status (02/10/2026)
- Painel no ar em grupo-magical-painel.vercel.app (telas Dia, Mês e Casa), cron horário ativo nas 12 contas.
- Pendente com a Núbia/Evelin: regra de ganho/perdido, aviso × trava ao pular Orçamento, se card corrigido depois de pular conta como erro, e toda visita passar pela agenda do GHL.
