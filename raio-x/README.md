# Raio-X das contas GHL (Grupo Magical)

Diagnóstico somente leitura das bases de vendas e decoração, base para o painel de gestão.

```bash
python3 raio-x/raiox.py 2026-09
```

Precisa da variável `GHL_CASAS_JSON` no ambiente (um PIT só leitura por subconta).
A saída vai para `raio-x/saida/`, que fica fora do git porque tem dados pessoais de clientes.

## Leads e contatos sem dono

```bash
python3 raio-x/sem_dono.py
```

Varre todos os contatos e todas as oportunidades (todos os funis e status) de cada subconta e gera
`sem_dono_resumo.txt`, `sem_dono_contatos.csv` e `sem_dono_oportunidades.csv` (separador `;`, abre direto no Excel).
"Dono fora da casa" é um `assignedTo` que não está na lista de usuários da subconta: vendedora que mudou de casa
(o resumo mostra em qual casa ela está hoje) ou usuário excluído (`/users/{id}` responde 404).
A coluna `dono_sugerido` traz o dono do contato para a oportunidade e o dono da oportunidade aberta para o contato.

O que já foi verificado (02/10/2026):
- O histórico de etapas vem das atividades da conversa (`TYPE_ACTIVITY_OPPORTUNITY`, com `oldStageName`/`newStageName`), então dá para auditar meses passados.
- O calendário "Visita Marcada" está vazio; as visitas ficam nas agendas pessoais dos vendedores.
- O mesmo usuário tem o mesmo ID em todas as subcontas.
- Sem `User-Agent` de navegador a API responde 403 (Cloudflare 1010).
- `POST /contacts/search` paginado por `searchAfter` devolve exatamente o `total` da API em todas as subcontas.
- Os contatos sem dono são, quase todos, lotes criados num único dia pela sincronização do WhatsApp (`whatsapp_coex`), sem oportunidade.
- Nenhum contato tem dono inválido. Já as oportunidades ficam com o ID de usuário excluído ou de vendedora que saiu da casa.
