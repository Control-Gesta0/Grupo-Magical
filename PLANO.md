# Painel de Gestão · Grupo Magical

## Decisões (02/10/2026)
- Acesso inicial: só Núbia e Evelin (login simples; dados gravados por casa para abrir visão por gerente depois).
- Funil: as 11 casas de vendas seguem o mesmo padrão de 8 etapas; decoração e planejamento têm funil próprio.
- Visitas: agendamentos no GHL (hoje nas agendas pessoais dos vendedores, não no calendário "Visita Marcada").
- Usuários: mesmo ID em todas as subcontas; alguns atuam em várias casas.
- Atribuição: rodízio igual por casa.
- Atualização do painel: a cada hora (sincronização via API, sem webhook por enquanto).
- Casa piloto do rodízio central: Casa Rei.
- Monte Belvedere: casa nova (por isso só tem oportunidades de setembro).
- Hospedagem: conta Vercel da Control Gestão, Postgres pelo Marketplace da Vercel.

## Fases
0. Raio-X completo (falta Évora) + apresentação + 4 regras com a Núbia/Evelin
   (o que é visita, comparecimento, ganho/perdido, aviso × trava ao pular Orçamento).
1. Painel de leitura: sincronização horária → Postgres → painel por casa/vendedor,
   com histórico de etapas recuperado do passado.
2. Cadastro central de equipe + rodízio + redistribuição de órfãos (piloto Casa Rei, exige token com escrita).
3. Bases de planejamento e decoração (uma linha de configuração por base).
