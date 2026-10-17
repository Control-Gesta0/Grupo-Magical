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

## 8. Premissas da conta: os 15 templates (17/10/2026)

Fonte: PDF "Nomes corretos para os templetes", texto integral em `TEMPLATES-PREMISSAS.md`.

### 8.1 O que o documento responde
- **A decoração já vem contratada:** todo casal tem o **Pacote Ouro**. O "Boas-vindas" vai para quem fechou o
  evento. Fora do pacote, existe um **orçamento** de itens extras (txN8), conduzido pelo decorador.
- **Prazo:** a equipe só procura o casal **até 6 meses antes do evento**. Até lá o casal só manda referências.
- **Ordem real:** alinhamento → orçamento → briefing → mood board → D-2 → D+1.
- **O "+ IA" de hoje não é uma IA:** txN4 é uma lista de 38 frases prontas de elogio sorteadas, seguidas de uma
  assinatura fixa.
- **Números da casa** para assuntos que não são da decoração: comercial, planejamento e financeiro.

### 8.2 Mapa template × workflow
| Fase | Template | Tipo | Workflow | Inscritos |
|---|---|---|---|---:|
| Boas-vindas (Pacote Ouro) | txN1 | auto | 1. Boas-vindas | 309 |
| Formulário de inspirações | txN2 | auto | 2. Inspirações e conversas + IA | 43 |
| Canal de inspirações aberto | txN3 | manual | 2 | |
| Reação a cada inspiração | txN4 + assinatura | auto | 2 | |
| Formulário respondido | | | 3. Formulario Briefing Respondido | 3 |
| Vamos agendar o alinhamento | txN5 | auto | 4. Reunião de alinhamento e Confirmação | 25 |
| Alinhamento marcado | txN6 | auto | 4 | |
| Ata do alinhamento | txN7 | manual | | |
| Orçamento de extras | txN8 | manual | | |
| Vamos agendar o briefing | txN9 | auto | 5. Reunião de Briefing | 20 |
| Briefing marcado | txN10 | auto | 5 | |
| Ata do briefing | txN11 | manual | | |
| Mood board em criação | txN12 | manual | 6. Mood board | 3 |
| Mood board aprovado | txN13 | manual | 6 | |
| 2 dias antes do evento | txN14 | auto | 7. A espera do Grande Dia | 0 |
| 1 dia depois do evento | txN15 | auto | 8? (cortado no print) | ? |

### 8.3 Problemas encontrados nos próprios templates
1. **Telefones trocados.** txN3 diz Comercial 21 99509-6486, Planejamento 21 99750-4012, Financeiro 21 96546-0661.
   A assinatura do txN4 diz Comercial (21) 99750-4012 e Planejamento (21) 96546-0661. O casal que liga para o
   "comercial" da assinatura cai no planejamento. Confirmar os números certos e corrigir.
2. **Elogio sorteado sem ler a mensagem.** Se o casal escreve "dá pra trocar o arco por painel?" ou "quanto custa
   a mesa extra?", recebe "😍 Amamos!" e a assinatura. A dúvida fica sem resposta e ninguém é avisado.
3. **Assinatura longa depois de cada frase.** Casal que manda 10 fotos recebe 10 elogios e 10 assinaturas.
4. **Formulário de inspirações (txN2) com 3 respostas em 43.** Mesmo padrão já visto: formulário não é respondido.
5. **D-2 com 0 inscritos.** Depende da data do evento; o gatilho não está disparando.
6. **Renumeração:** o PDF renomeia templates ("antigo txN3 vira txN2" etc.). Os workflows precisam apontar para
   os nomes novos; conferir um por um quando houver os prints.

### 8.4 Onde a IA entra, fase por fase
| Fase | Hoje | Com IA | Quem decide |
|---|---|---|---|
| Inspirações (até 6 meses antes) | txN4 sorteado | A IA vê a foto ou o vídeo, comenta o que tem nela no tom da casa (os 38 elogios viram exemplo de tom, não lista de sorteio), guarda a descrição no histórico de inspirações do card e junta várias fotos numa resposta só. Assinatura no máximo uma vez por dia | IA |
| Dúvida no canal | sem resposta | Dúvida sobre o Pacote Ouro: responde com o que está no pacote. Contrato, pagamento, convidados: passa o número certo do setor. Dúvida de decoração fora do pacote: avisa o decorador | IA encaminha, humano resolve |
| Antes do alinhamento | decorador estuda a conversa | Resumo das inspirações para o decorador: estilo, paleta, elementos que se repetem, o que o casal rejeitou | IA prepara, decorador usa |
| Agendar alinhamento e briefing (txN5, txN9) | "nossa equipe entrará em contato" | A IA oferece horários livres da agenda do decorador e marca; txN6/txN10 saem sozinhos com data e hora | IA, se o decorador liberar a agenda |
| Atas (txN7, txN11) | decorador escreve | IA redige a ata a partir das anotações ou do áudio da reunião; decorador revisa e envia | Decorador aprova |
| Orçamento (txN8) | decorador conduz | IA não fala de preço de extra. Lembra o casal se ele some e avisa o decorador | Decorador |
| Mood board (txN12, txN13) | manual | Continua manual; a IA só registra "aprovado" ou o pedido de ajuste quando o casal responde | Decorador |
| D-2 e D+1 (txN14, txN15) | D-2 não dispara | Disparo pela data do evento. No D+1 a IA lê a resposta: elogio vira pedido de avaliação; queixa vira alerta imediato para a gestão | IA + gestão |

### 8.5 O que ainda falta
- Conteúdo do **Pacote Ouro** (o que inclui e o que é extra), para a IA responder sem inventar.
- Os **telefones corretos** de cada setor.
- Onde fica a **data do evento** no CRM.
- ~~Se os templates são modelos aprovados na Meta~~: decidido em 17/10, canal Zaptos (seção 9).
- Prints dos workflows por dentro e o item 8 da lista.

## 9. Decisão de canal: WhatsApp pela Zaptos no canal SMS (17/10/2026)

A API oficial sai. A conversa passa a ser o WhatsApp conectado pela **Zaptos**, que no CRM aparece como canal
**SMS**. O que isso muda:

| Assunto | Com a API oficial | Com a Zaptos |
|---|---|---|
| Janela de 24h | lembretes fora da janela só com modelo aprovado pela Meta | **não existe**: D-2, D+1 e lembretes saem como texto livre |
| Os 15 "templates" | modelos a aprovar na Meta | viram textos dos workflows (e exemplos de tom para a IA). Os nomes txN1 a txN15 continuam valendo como referência |
| Envio pelo agente | canal WhatsApp | mensagem do tipo **SMS** na API de conversas; a Zaptos entrega no WhatsApp |
| Gatilho do agente | resposta no WhatsApp | workflow "Cliente respondeu" filtrado pelo canal **SMS** |

Riscos novos, todos para testar antes de ligar:
1. **Reconexão do celular gera cadastro em massa.** Já aconteceu nas casas de vendas (script `limpar-pico` na
   branch `claude/confident-dijkstra-w1le9h`): ao reconectar, as conversas antigas do celular viram contatos novos
   e entram nos workflows. Na decoração isso mandaria o txN1 (Boas-vindas) para gente que não é casal da casa.
   O Boas-vindas não pode disparar por "contato criado"; tem que disparar por um sinal de casal contratado
   (etiqueta ou entrada no funil vinda das vendas). Vale conferir se os 309 do Boas-vindas têm um pico assim.
2. **Mídia.** Fotos e vídeos de inspiração são o centro da fase 1. Testar se a Zaptos entrega o anexo do casal no
   CRM com link que o agente consegue baixar, e se o envio de imagem/áudio da casa chega no celular.
3. **Número desconectado falha calado.** Se o celular da decoração desconectar, os envios param sem erro visível.
   O guardião diário precisa conferir o último envio entregue e alertar no grupo.
4. **Bloqueio por volume.** Número não oficial pode ser bloqueado pelo WhatsApp se disparar muito de uma vez.
   Na decoração o volume é baixo (por data do evento), mas nada de disparo em massa para a base antiga.
5. **Um número, um agente.** Esse WhatsApp não pode estar em outro sistema ou outra subconta, e a IA nativa do
   CRM fica desligada nele.
6. **Mensagens de grupo.** Se a Zaptos trouxer grupos do celular, o agente ignora tudo que não for conversa
   individual.
