import postgres from 'postgres'

const g = globalThis as unknown as { __sql?: postgres.Sql }

export function db(): postgres.Sql {
  if (g.__sql) return g.__sql
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!url) throw new Error('DATABASE_URL não definida')
  const local = /localhost|127\.0\.0\.1|\/var\/run/.test(url)
  g.__sql = postgres(url, { ssl: local ? false : 'require', max: 5, idle_timeout: 20, prepare: false, onnotice: () => {} })
  return g.__sql
}

const SCHEMA = `
create table if not exists casas (
  location_id text primary key,
  casa text not null,
  base text not null,
  nome text not null
);
create table if not exists usuarios (
  id text primary key,
  nome text,
  email text
);
create table if not exists usuario_casa (
  usuario_id text not null,
  location_id text not null,
  primary key (usuario_id, location_id)
);
create table if not exists etapas (
  id text primary key,
  location_id text not null,
  pipeline_id text not null,
  pipeline_nome text not null,
  principal boolean not null default false,
  nome text not null,
  chave text,
  posicao int
);
create table if not exists oportunidades (
  id text primary key,
  location_id text not null,
  pipeline_id text not null,
  etapa_id text,
  status text,
  dono_id text,
  contato_id text,
  nome text,
  valor numeric,
  criado_em timestamptz,
  ultima_mudanca_etapa timestamptz,
  historico_lido_em timestamptz,
  visto_em timestamptz not null
);
create index if not exists oportunidades_loc on oportunidades (location_id);
create table if not exists movimentos (
  id text primary key,
  oportunidade_id text not null,
  location_id text not null,
  em timestamptz not null,
  tipo text,
  etapa_de text,
  etapa_para text,
  chave_para text,
  status text
);
create index if not exists movimentos_opp on movimentos (oportunidade_id);
create index if not exists movimentos_loc_em on movimentos (location_id, em);
create table if not exists agendamentos (
  id text primary key,
  location_id text not null,
  calendario_id text,
  contato_id text,
  dono_id text,
  inicio timestamptz,
  criado_em timestamptz,
  status text,
  titulo text,
  visto_em timestamptz not null
);
create index if not exists agendamentos_loc on agendamentos (location_id, inicio);
alter table agendamentos add column if not exists criado_por text;
create index if not exists agendamentos_criado on agendamentos (criado_em);
create index if not exists oportunidades_contato on oportunidades (location_id, contato_id);
drop view if exists visitas;
-- Fase 2: equipe e rodízio central
create table if not exists equipe (
  location_id text not null,
  usuario_id text not null,
  ativo boolean not null default true,
  desde timestamptz not null default now(),
  primary key (location_id, usuario_id)
);
create table if not exists rodizio_config (
  location_id text primary key,
  modo text not null default 'desligado' check (modo in ('desligado', 'simulacao', 'ativo'))
);
create table if not exists atribuicoes (
  id bigserial primary key,
  location_id text not null,
  contato_id text not null,
  usuario_id text,
  em timestamptz not null default now(),
  origem text not null,
  simulada boolean not null,
  detalhe jsonb
);
create index if not exists atribuicoes_loc on atribuicoes (location_id, simulada, usuario_id, em);
create index if not exists atribuicoes_contato on atribuicoes (location_id, contato_id);
create table if not exists transferencias (
  id bigserial primary key,
  location_id text not null,
  de text not null,
  para text not null,
  destino_casa text,
  incluir_descartados boolean not null,
  status text not null,
  plano jsonb,
  total int,
  feitos int not null default 0,
  erro text,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create table if not exists sincronizacoes (
  id bigserial primary key,
  location_id text not null,
  inicio timestamptz not null,
  fim timestamptz,
  ok boolean,
  detalhe jsonb
);
`

// uma migração por instância, serializada entre instâncias (cron e telas abrindo ao mesmo tempo davam deadlock)
let migracao: Promise<void> | null = null
export function migrar(): Promise<void> {
  migracao ??= db()
    .begin(async tx => {
      await tx`select pg_advisory_xact_lock(7321001)`
      await tx.unsafe(SCHEMA)
    })
    .then(() => undefined)
    .catch(e => { migracao = null; throw e })
  return migracao
}
