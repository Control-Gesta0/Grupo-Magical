"""Leads e contatos sem proprietário em todas as subcontas GHL (somente leitura).

Para cada casa/base varre todos os contatos e todas as oportunidades (todos os funis e status)
e classifica o dono (assignedTo):
  sem_dono     campo vazio
  fora_da_casa usuário que não está na lista de usuários da subconta (saiu ou é de outra casa)
Também cruza contato x oportunidade: dono diferente e sugestão de dono para corrigir.

Gera em raio-x/saida/:
  sem_dono_resumo.txt
  sem_dono_contatos.csv
  sem_dono_oportunidades.csv

Uso: python3 raio-x/sem_dono.py
"""
import collections, csv, json, os, urllib.request
from raiox import API, SAIDA, get, oportunidades, pedir


def post(path, tok, corpo, ver="2021-07-28"):
    return pedir(urllib.request.Request(API + path, method="POST", data=json.dumps(corpo).encode(), headers={
        "Authorization": "Bearer " + tok, "Version": ver, "Content-Type": "application/json",
        "Accept": "application/json", "User-Agent": "Mozilla/5.0 (painel-magical)"}))


def contatos(tok, lid):
    cs, depois = [], None
    while True:
        corpo = {"locationId": lid, "pageLimit": 100}
        if depois:
            corpo["searchAfter"] = depois
        s, r = post("/contacts/search", tok, corpo)
        if s != 200:
            raise RuntimeError(f"contacts {s}: {r}")
        lote = r.get("contacts", [])
        cs += lote
        if len(lote) < 100 or not lote[-1].get("searchAfter"):
            return cs, r.get("total")
        depois = lote[-1]["searchAfter"]


def classe(uid, uids):
    return "sem_dono" if not uid else ("ok" if uid in uids else "fora_da_casa")


def main():
    os.makedirs(SAIDA, exist_ok=True)
    casas = json.loads(os.environ["GHL_CASAS_JSON"])
    dados, quem = {}, {}

    # primeiro os usuários de todas as subcontas, para dar nome a quem é dono "fora da casa"
    for casa in casas:
        k, tok, lid = f"{casa['casa']}/{casa['base']}", casa["token"].strip(), casa["locationId"]
        _, us = get(f"/users/?locationId={lid}", tok)
        users = us.get("users", [])
        for u in users:
            quem.setdefault(u["id"], dict(nome=u.get("name") or f"{u.get('firstName', '')} {u.get('lastName', '')}".strip(),
                                          email=u.get("email"), casas=[]))["casas"].append(k)
        dados[k] = dict(casa=casa, users=users)

    def nome(uid):
        if not uid:
            return ""
        u = quem.get(uid)
        return f"{u['nome']} <{u['email']}>" if u else f"usuário excluído ({uid})"

    resumo, linhas_c, linhas_o = [], [], []
    tot = collections.Counter()
    for k, d in dados.items():
        casa, tok, lid = d["casa"], d["casa"]["token"].strip(), d["casa"]["locationId"]
        uids = {u["id"] for u in d["users"]}
        _, pp = get(f"/opportunities/pipelines?locationId={lid}", tok)
        funil = {p["id"]: p["name"] for p in pp.get("pipelines", [])}
        etapa = {e["id"]: e["name"] for p in pp.get("pipelines", []) for e in p["stages"]}
        cs, total_api = contatos(tok, lid)
        ops = oportunidades(tok, lid)
        print(k, len(cs), "contatos", len(ops), "oportunidades", flush=True)

        dono_c = {c["id"]: c.get("assignedTo") for c in cs}
        ops_do = collections.Counter(o["contactId"] for o in ops)
        abertas_do = collections.defaultdict(list)
        for o in ops:
            if o["status"] == "open":
                abertas_do[o["contactId"]].append(o)

        # contatos
        cc = collections.Counter(classe(c.get("assignedTo"), uids) for c in cs)
        fora_c = collections.Counter(c["assignedTo"] for c in cs if classe(c.get("assignedTo"), uids) == "fora_da_casa")
        corrige_c = sem_op = 0
        for c in cs:
            cl = classe(c.get("assignedTo"), uids)
            if cl == "ok":
                continue
            ab = sorted(abertas_do.get(c["id"], []), key=lambda o: o.get("updatedAt") or "", reverse=True)
            sug = next((o["assignedTo"] for o in ab if classe(o.get("assignedTo"), uids) == "ok"), None)
            corrige_c += bool(sug)
            sem_op += not ops_do[c["id"]]
            linhas_c.append(dict(
                subconta=k, situacao=cl, contato_id=c["id"],
                nome=c.get("contactName") or f"{c.get('firstName') or ''} {c.get('lastName') or ''}".strip(),
                telefone=c.get("phone") or "", email=c.get("email") or "", criado_em=(c.get("dateAdded") or "")[:10],
                atualizado_em=(c.get("dateUpdated") or "")[:10],
                tags=",".join(c.get("tags") or []), dono_atual=nome(c.get("assignedTo")),
                origem=(c.get("attributionSource") or {}).get("medium") or "", oportunidades=ops_do[c["id"]],
                oportunidades_abertas=len(ab), dono_sugerido=nome(sug), dono_sugerido_id=sug or ""))

        # oportunidades
        co = collections.Counter((o["status"], classe(o.get("assignedTo"), uids)) for o in ops)
        fora_o = collections.Counter(o["assignedTo"] for o in ops if classe(o.get("assignedTo"), uids) == "fora_da_casa")
        etapas_sem = collections.Counter(f"{funil.get(o['pipelineId'], '?')} > {etapa.get(o['pipelineStageId'], '?')}"
                                         for o in ops if o["status"] == "open" and classe(o.get("assignedTo"), uids) != "ok")
        diverge, corrige_o = 0, 0
        for o in ops:
            cl = classe(o.get("assignedTo"), uids)
            dc = dono_c.get(o["contactId"])
            if cl == "ok":
                diverge += o["status"] == "open" and classe(dc, uids) == "ok" and dc != o["assignedTo"]
                continue
            sug = dc if classe(dc, uids) == "ok" else None
            corrige_o += bool(sug)
            linhas_o.append(dict(
                subconta=k, situacao=cl, status=o["status"], funil=funil.get(o["pipelineId"], "?"),
                etapa=etapa.get(o["pipelineStageId"], "?"), oportunidade_id=o["id"], nome=o.get("name") or "",
                contato_id=o["contactId"], telefone=(o.get("contact") or {}).get("phone") or "",
                valor=o.get("monetaryValue") or 0, criado_em=(o.get("createdAt") or "")[:10],
                ultima_mudanca_etapa=(o.get("lastStageChangeAt") or "")[:10], dono_atual=nome(o.get("assignedTo")),
                dono_do_contato=nome(dc), dono_sugerido=nome(sug), dono_sugerido_id=sug or ""))

        n_abertas = sum(o["status"] == "open" for o in ops)
        resumo += [
            f"\n== {k} | {casa.get('nome')} | {len(d['users'])} usuários na subconta",
            f"   CONTATOS: {len(cs)} (API diz {total_api}) | sem dono {cc['sem_dono']} | dono fora da casa {cc['fora_da_casa']}"
            f" | desses, sem nenhuma oportunidade {sem_op} | dá para herdar dono da oportunidade aberta {corrige_c}",
            f"   OPORTUNIDADES: {len(ops)} | abertas {n_abertas} | abertas sem dono {co[('open', 'sem_dono')]}"
            f" | abertas com dono fora da casa {co[('open', 'fora_da_casa')]} | dá para herdar dono do contato {corrige_o}",
            f"   por status (sem dono / fora da casa): " + ", ".join(
                f"{st} {co[(st, 'sem_dono')]}/{co[(st, 'fora_da_casa')]}" for st in sorted({s for s, _ in co})),
            f"   abertas com dono diferente do dono do contato: {diverge}",
        ]
        if etapas_sem:
            resumo.append(f"   abertas sem dono válido por etapa: {dict(etapas_sem.most_common())}")
        for uid, n in (fora_c + fora_o).most_common():
            resumo.append(f"   dono fora da casa: {nome(uid)} | casas onde existe {quem.get(uid, {}).get('casas', [])}"
                          f" | contatos {fora_c[uid]} | oportunidades {fora_o[uid]}")
        tot.update(contatos=len(cs), c_sem=cc["sem_dono"], c_fora=cc["fora_da_casa"], c_sem_op=sem_op, c_corrige=corrige_c,
                   ops=len(ops), abertas=n_abertas, o_sem=co[("open", "sem_dono")], o_fora=co[("open", "fora_da_casa")],
                   o_todas_sem=sum(v for (s, c), v in co.items() if c != "ok"), o_corrige=corrige_o, diverge=diverge)

    resumo.insert(0, f"TOTAL {len(dados)} subcontas | contatos {tot['contatos']}: sem dono {tot['c_sem']}, dono fora da casa {tot['c_fora']}"
                     f" (sem nenhuma oportunidade {tot['c_sem_op']}, herdáveis {tot['c_corrige']}) | oportunidades {tot['ops']}, abertas {tot['abertas']}: sem dono {tot['o_sem']},"
                     f" dono fora da casa {tot['o_fora']} | todas sem dono válido {tot['o_todas_sem']} (herdáveis {tot['o_corrige']})"
                     f" | abertas com dono ≠ contato {tot['diverge']}")
    for nome_arq, linhas in (("sem_dono_contatos.csv", linhas_c), ("sem_dono_oportunidades.csv", linhas_o)):
        with open(os.path.join(SAIDA, nome_arq), "w", newline="", encoding="utf-8-sig") as f:
            if linhas:
                w = csv.DictWriter(f, fieldnames=list(linhas[0]), delimiter=";")
                w.writeheader()
                w.writerows(linhas)
    open(os.path.join(SAIDA, "sem_dono_resumo.txt"), "w").write("\n".join(resumo))
    print("\n".join(resumo))


if __name__ == "__main__":
    main()
