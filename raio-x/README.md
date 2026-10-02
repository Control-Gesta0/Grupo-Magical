# Raio-X das contas GHL (Grupo Magical)

Diagnóstico somente leitura das bases de vendas e decoração, base para o painel de gestão.

```bash
python3 raio-x/raiox.py 2026-09
```

Precisa da variável `GHL_CASAS_JSON` no ambiente (um PIT só leitura por subconta).
A saída vai para `raio-x/saida/`, que fica fora do git porque tem dados pessoais de clientes.

O que já foi verificado (02/10/2026):
- O histórico de etapas vem das atividades da conversa (`TYPE_ACTIVITY_OPPORTUNITY`, com `oldStageName`/`newStageName`), então dá para auditar meses passados.
- O calendário "Visita Marcada" está vazio; as visitas ficam nas agendas pessoais dos vendedores.
- O mesmo usuário tem o mesmo ID em todas as subcontas.
- Sem `User-Agent` de navegador a API responde 403 (Cloudflare 1010).
