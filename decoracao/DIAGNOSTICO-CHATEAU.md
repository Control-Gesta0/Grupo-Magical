# Diagnóstico · Chateau Decoração (17/10/2026)

Primeira leitura do fluxo de automações da decoração, para levar a jornada inteira para a IA.
Fonte: prints da lista de workflows ("Fluxo Automático") e da tela de Integrações Privadas da subconta
Chateau do Lago · Decoração (`ovLCG3IhY5QY9aHDHISU`).
Ainda não foi aberto o conteúdo de cada workflow (gatilho, esperas, mensagens). Isso é o próximo passo.

## 1. O que existe hoje

| # | Workflow | Inscritos | Ativos | Conversão sobre o passo 1 |
|---|---|---:|---:|---:|
| 1 | Boas-vindas | 309 | 0 | 100% |
| 2 | Inspirações e conversas + IA | 43 | 0 | 14% |
| 3 | Formulário Briefing Respondido | 3 | 0 | 1% |
| 4 | Reunião de alinhamento e Confirmação | 25 | 0 | 8% |
| 5 | Reunião de Briefing | 20 | 0 | 6% |
| 6 | Mood board | 3 | 0 | 1% |
| 7 | A espera do Grande Dia | 0 | 0 | 0% |
| 8+ | (lista cortada no print) | ? | ? | ? |

## 2. O que os números dizem

1. **Ninguém está ativo em nenhum workflow.** Com 309 inscritos e 0 ativos, os fluxos mandam uma ou duas
   mensagens e terminam. Não há espera, lembrete nem follow-up rodando. A jornada só anda quando alguém
   da equipe move o card ou dispara o próximo passo à mão.
2. **A queda maior é logo no começo: 309 → 43 (14%).** Quase 9 em cada 10 contatos recebem as boas-vindas
   e não chegam à conversa de inspirações. Falta saber se é desinteresse, se a etapa é pulada pela equipe
   ou se o gatilho do passo 2 depende de algo que não acontece.
3. **O formulário de briefing não funciona como porta: 3 respostas contra 20 reuniões de briefing.**
   O briefing de fato acontece em reunião. Formulário longo não é respondido; conversa é.
4. **Reunião de alinhamento (25) tem mais inscritos que reunião de briefing (20)**, ao contrário da
   numeração. Ou a ordem real é outra, ou os passos são disparados fora de ordem.
5. **Mood board 3 e Grande Dia 0.** O fim da jornada praticamente não passa pela automação. O "Grande Dia"
   provavelmente depende de uma data do evento que não está preenchida ou de uma etapa que ninguém usa.
6. **"+ IA" no passo 2:** já existe alguma IA nesse ponto (Conversation AI nativa do CRM ou outra). Precisa
   ser identificada antes de colocar outro agente, senão dois robôs respondem o mesmo contato.

## 3. Integração "Painel Control Gestao" com alerta vermelho

A integração fica na própria subconta **Chateau do Lago · Decoração** (`ovLCG3IhY5QY9aHDHISU`), criada em
02/10/2026, junto com as demais do painel. Ou seja, já existe um token para esta base, que é o acesso de que o
diagnóstico completo precisa (se tiver os escopos de leitura de contatos, oportunidades, conversas,
calendários, formulários e workflows).

O triângulo vermelho no CRM costuma indicar token que precisa ser rotacionado ou escopo pendente; passar o
mouse no ícone mostra o motivo. Se esta base estiver no `GHL_CASAS_JSON` do painel, a sincronização dela para
junto. Resolver o alerta antes de usar o token no raio-x.

## 4. Desenho proposto: jornada da decoração com IA

O princípio: a IA conduz a conversa e coleta informação; o código cuida de datas, lembretes e movimento
de etapa; a decoradora aprova o que é criativo e o que envolve contrato.

| Fase | Hoje | Com IA |
|---|---|---|
| Boas-vindas | mensagem única | IA se apresenta pelo nome da decoradora, confirma data e local do evento, grava no card e já puxa a conversa de inspirações. Follow-up em 1, 3 e 7 dias se não responder |
| Inspirações | conversa manual (+ IA não identificada) | cliente manda fotos, prints do Pinterest, áudios. A IA descreve cada imagem uma vez e guarda como texto no histórico (estilo, cores, flores, mobiliário) |
| Briefing | formulário (3 respostas) + reunião | a IA faz o briefing em conversa, uma pergunta por vez, e preenche os campos do card. Chega na reunião um resumo pronto para a decoradora |
| Reunião de alinhamento/briefing | agendamento e confirmação manuais | IA oferece horário real da agenda da decoradora, agenda, confirma na véspera e no dia, remarca se pedirem |
| Mood board | 3 inscritos | a IA monta a pasta de referências e o resumo de paleta a partir do briefing; a decoradora cria e aprova o mood board. A IA envia, coleta o "aprovado" ou os ajustes e registra |
| À espera do Grande Dia | 0 inscritos | cadência por **data do evento** (D-90, D-60, D-30, D-15, D-7, D-1): checklist, confirmação de itens, prova, horário de montagem. Regra no código, texto pela IA |
| Pós-evento | não existe no print | agradecimento, pedido de fotos e avaliação, indicação |

**Até onde a IA vai sozinha:** conversa, coleta, resumo, agenda e lembretes.
**O que fica com a decoradora:** preço, itens fora do contrato, aprovação do mood board, qualquer reclamação.
Tag `atendimento-humano` cala a IA no contato na hora.

## 5. Perguntas que decidem o desenho (para a decoradora / Núbia)

1. Quem entra no "Boas-vindas": todo casal que fechou o evento no Chateau do Lago, ou só quem contratou a
   decoração? A decoração é inclusa no pacote ou vendida à parte (com preço)?
2. Qual a ordem real dos passos e o que faz o card passar de um para o outro? Quem move hoje?
3. O que precisa estar respondido para o briefing estar "completo"? (Lista de campos que a decoradora
   precisa ver antes da reunião.)
4. A data do evento está num campo do contato ou da oportunidade? Está preenchida para quem já fechou?
5. Que IA está no passo 2 hoje?
6. O WhatsApp da decoração é oficial (API) ou instância própria? É o mesmo número das vendas?
7. Reunião é presencial, online ou as duas? Em qual agenda?
8. O que vem depois do item 7 na lista?

## 6. Acesso necessário para o diagnóstico completo

- O token da integração "Painel Control Gestao" desta subconta (já existe, ver item 3), com o alerta resolvido
  e escopos de leitura: contatos, oportunidades, conversas, calendários, formulários, workflows (lista),
  campos personalizados.
- Prints do interior de cada workflow (gatilho + passos), já que a API do CRM lista os workflows mas não
  devolve os passos. Alternativa: navegador autenticado.
- Com isso, o `raio-x/raiox.py` roda na base de decoração e mede o tempo médio entre cada fase e onde
  os contatos param.

## 7. Reavaliação pela metodologia do agente de IA (17/10/2026)

Nenhum dado novo desde a primeira leitura (sem token de leitura nesta sessão, sem prints dos workflows por
dentro). A reavaliação muda o enquadramento e mostra quatro riscos que a primeira versão não tinha.

### 7.1 Isto não é um agente de vendas
O padrão da Control Gestão é um agente de vendas (SDR): leva o lead até "Agendado" e entrega ao vendedor.
A decoração começa **depois** da venda: o casal já é cliente e a jornada dura meses, até o dia do evento.
Consequências:
- A IA continua conversando depois da reunião (mood board, lembretes, pós-evento). O limite do que ela faz
  sozinha deixa de ser "até agendar" e passa a ser por assunto: ela coleta, resume, agenda e lembra;
  preço, itens do contrato, aprovação criativa e reclamação vão para a decoradora.
- O que mede sucesso não é venda. É: briefing completo antes da reunião, reunião realizada, mood board
  aprovado, nenhum item pendente na semana do evento, avaliação e indicação depois.

### 7.2 Riscos que precisam de resposta antes de construir
| Risco | Por que importa | O que decide |
|---|---|---|
| **Janela de 24h do WhatsApp oficial** | A jornada tem semanas de silêncio entre fases. Fora das 24h após a última mensagem do casal, só sai mensagem com **modelo aprovado pela Meta**, e no GHL isso é feito por etiqueta, que dispara um workflow, que envia o modelo. Os lembretes D-90 a D-1 dependem disso | Se o número é oficial: criar e aprovar um modelo por lembrete. Se é instância própria (uazapi): texto livre, sem janela |
| **"+ IA" no passo 2** | Se for o Conversation AI nativo do GHL, ele e o agente novo respondem o mesmo casal | Identificar e desligar no canal antes do primeiro teste |
| **Mesmo número das vendas?** | Um número = um agente. Se o WhatsApp da decoração for o do Chateau do Lago vendas, a conversa do casal cai em dois lugares | Número próprio da decoração, ou separar por etiqueta sem sobreposição |
| **Data do evento** | Toda a fase "À espera do Grande Dia" é calculada a partir dela; hoje esse fluxo tem 0 inscritos | Confirmar o campo e preencher para quem já fechou antes de ligar a cadência |

### 7.3 Foto do antes (o que medir antes de ligar a IA)
Últimos 90 dias na subconta de decoração: casais que entraram · com briefing completo · com reunião
realizada · com mood board aprovado · tempo médio de cada passagem · casais sem resposta há mais de 7 dias.
Sai do raio-x assim que houver token de leitura. Sem essa foto não há como provar depois o que a IA mudou.

### 7.4 Ordem proposta
1. Resolver o alerta do token e rodar o raio-x (foto do antes).
2. Prints dos workflows por dentro e respostas da seção 5.
3. Fechar o desenho: fases, campos do briefing, o que a IA faz sozinha, modelos de WhatsApp.
4. Construir no repositório próprio da decoração, com etiqueta de liberação: primeiro um contato da
   Control Gestão, depois 10 casais, depois todos.
