"""Raio-X das contas GHL do Grupo Magical (somente leitura).

Lê GHL_CASAS_JSON do ambiente: [{"casa","nome","base","locationId","token"}].
Gera em raio-x/saida/:
  contas.json        funis, usuários, calendários, workflows e oportunidades
  resumo.txt         etapas, donos, órfãos, workflows de atribuição, visitas
  fechamentos.json   fechamentos do mês: passou ou pulou ORÇAMENTO/VISITA

Uso: python3 raio-x/raiox.py [AAAA-MM]   (padrão: mês anterior)
"""
import collections, datetime as dt, json, os, sys, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://services.leadconnectorhq.com"
SAIDA = os.path.join(os.path.dirname(__file__), "saida")
TZ = dt.timezone(dt.timedelta(hours=-3))


def get(path, tok, ver="2021-07-28"):
    # User-Agent obrigatório: o Cloudflare do GHL devolve 1010 para o UA padrão do Python
    req = urllib.request.Request(API + path, headers={
        "Authorization": "Bearer " + tok, "Version": ver,
        "Accept": "application/json", "User-Agent": "Mozilla/5.0 (painel-magical)"})
    for tentativa in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as f:
                return f.status, json.load(f)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2 * (tentativa + 1))
                continue
            return e.code, e.read().decode()[:200]
    return 429, None


def oportunidades(tok, lid):
    ops, url = [], f"/opportunities/search?location_id={lid}&limit=100"
    while url:
        s, r = get(url, tok)
        if s != 200:
            raise RuntimeError(f"opportunities {s}: {r}")
        ops += r.get("opportunities", [])
        m = r.get("meta", {})
        url = (f"/opportunities/search?location_id={lid}&limit=100&startAfter={m['startAfter']}"
               f"&startAfterId={m['startAfterId']}") if m.get("nextPage") and m.get("startAfterId") else None
    return ops


def historico(tok, lid, op):
    """Mudanças de etapa da oportunidade, lidas das atividades da conversa do contato."""
    s, c = get(f"/conversations/search?locationId={lid}&contactId={op['contactId']}", tok)
    if s != 200:
        return None
    ev = []
    for conv in c.get("conversations", []):
        ultimo = None
        for _ in range(20):
            s, m = get(f"/conversations/{conv['id']}/messages?limit=100"
                       + (f"&lastMessageId={ultimo}" if ultimo else ""), tok)
            if s != 200:
                break
            mm = m.get("messages", {})
            for msg in mm.get("messages", []):
                atv = msg.get("activity") or {}
                if msg.get("messageType") == "TYPE_ACTIVITY_OPPORTUNITY" and atv.get("data", {}).get("id") == op["id"]:
                    ev.append((msg["dateAdded"], atv["data"].get("stage", {}).get("newStageName", "")))
            if not mm.get("nextPage"):
                break
            ultimo = mm.get("lastMessageId")
    return [etapa for _, etapa in sorted(ev)]


def ms(ano, mes):
    return int(dt.datetime(ano, mes, 1, tzinfo=TZ).timestamp() * 1000)


def main():
    hoje = dt.date.today()
    mes = sys.argv[1] if len(sys.argv) > 1 else (hoje.replace(day=1) - dt.timedelta(days=1)).strftime("%Y-%m")
    ano, m = map(int, mes.split("-"))
    prox = (ano + (m == 12), m % 12 + 1)
    os.makedirs(SAIDA, exist_ok=True)
    casas = json.loads(os.environ["GHL_CASAS_JSON"])
    contas, fechamentos, resumo = {}, {}, []

    for casa in casas:
        k, tok, lid = f"{casa['casa']}/{casa['base']}", casa["token"].strip(), casa["locationId"]
        s, loc = get(f"/locations/{lid}", tok)
        if s != 200:
            resumo.append(f"\n== {k}: SEM ACESSO ({s}) {loc}")
            continue
        _, pp = get(f"/opportunities/pipelines?locationId={lid}", tok)
        _, us = get(f"/users/?locationId={lid}", tok)
        _, cal = get(f"/calendars/?locationId={lid}", tok, "2021-04-15")
        _, wf = get(f"/workflows/?locationId={lid}", tok)
        users = us.get("users", [])
        conta = dict(nome=loc["location"]["name"], pipelines=pp.get("pipelines", []), users=users,
                     calendars=cal.get("calendars", []), workflows=wf.get("workflows", []),
                     opps=oportunidades(tok, lid))
        contas[k] = conta
        uids = {u["id"] for u in users}
        email = {u["id"]: u.get("email") for u in users}

        resumo.append(f"\n== {k} | {conta['nome']}")
        for p in conta["pipelines"]:
            etapas = [e["name"] for e in sorted(p["stages"], key=lambda e: e.get("position", 0))]
            resumo.append(f"   funil {p['name']}: {' > '.join(etapas)}")
        publicados = [w["name"] for w in conta["workflows"] if w.get("status") == "published"]
        resumo.append(f"   workflows de atribuição: {[w for w in publicados if any(t in w.lower() for t in ('atrib', 'distrib', 'rodí', 'round'))]}")

        principal = max(conta["pipelines"], key=lambda p: sum(o["pipelineId"] == p["id"] for o in conta["opps"]))
        nome_etapa = {e["id"]: e["name"] for e in principal["stages"]}
        ops = [o for o in conta["opps"] if o["pipelineId"] == principal["id"]]
        abertas = [o for o in ops if o["status"] == "open"]
        orfas = [o for o in abertas if o.get("assignedTo") and o["assignedTo"] not in uids]
        resumo.append(f"   oportunidades: {len(ops)} | abertas {len(abertas)} | sem dono {sum(not o.get('assignedTo') for o in abertas)}"
                      f" | dono fora da casa {len(orfas)} | status {dict(collections.Counter(o['status'] for o in ops))}")
        resumo.append(f"   donos: {collections.Counter(email.get(o.get('assignedTo'), o.get('assignedTo') or 'SEM DONO') for o in abertas).most_common(10)}")
        no_mes = collections.Counter(nome_etapa.get(o["pipelineStageId"]) for o in ops if (o.get("lastStageChangeAt") or "")[:7] == mes)
        resumo.append(f"   {mes}: leads criados {sum(o['createdAt'][:7] == mes for o in ops)} | última mudança de etapa {dict(no_mes)}")

        # visitas: agendamentos nas agendas dos usuários (o calendário "Visita Marcada" está vazio)
        eventos = {}
        for u in users:
            s, r = get(f"/calendars/events?locationId={lid}&userId={u['id']}&startTime={ms(ano, m) - 40 * 86400000}"
                       f"&endTime={ms(*prox) + 40 * 86400000}", tok, "2021-04-15")
            for e in (r.get("events", []) if s == 200 else []):
                if not e.get("deleted"):
                    eventos[e["id"]] = e
        acont = [e for e in eventos.values() if e["startTime"][:7] == mes]
        resumo.append(f"   visitas: marcadas no mês {sum((e.get('dateAdded') or '')[:7] == mes for e in eventos.values())}"
                      f" | com data no mês {len(acont)} | status {dict(collections.Counter(e.get('appointmentStatus') for e in acont))}")

        if casa["base"] != "vendas":
            continue
        alvo = [o for o in ops if "FECHAMENTO" in nome_etapa.get(o["pipelineStageId"], "") and (o.get("lastStageChangeAt") or "")[:7] == mes]
        with ThreadPoolExecutor(4) as ex:
            caminhos = list(ex.map(lambda o: historico(tok, lid, o), alvo))
        linhas = []
        for o, cam in zip(alvo, caminhos):
            veredito = "sem_historico" if not cam else ("passou" if any("ORÇAMENTO" in e for e in cam) else "pulou")
            linhas.append(dict(id=o["id"], nome=o["name"], dono=email.get(o.get("assignedTo"), o.get("assignedTo")),
                               veredito=veredito, caminho=cam))
        fechamentos[k] = linhas
        c = collections.Counter(l["veredito"] for l in linhas)
        resumo.append(f"   fechamentos {mes}: {len(linhas)} | passou por orçamento {c['passou']} | pulou {c['pulou']} | sem histórico {c['sem_historico']}")
        print(k, "ok", flush=True)

    json.dump(contas, open(os.path.join(SAIDA, "contas.json"), "w"), ensure_ascii=False)
    json.dump(fechamentos, open(os.path.join(SAIDA, "fechamentos.json"), "w"), ensure_ascii=False, indent=1)
    open(os.path.join(SAIDA, "resumo.txt"), "w").write("\n".join(resumo))
    print("\n".join(resumo))


if __name__ == "__main__":
    main()
