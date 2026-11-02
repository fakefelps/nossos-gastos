-- =====================================================================
-- NOSSOS GASTOS — aba Investimentos
-- Rode uma vez no Supabase: SQL Editor > New query > cole tudo > Run.
--
-- Uma linha por pessoa. A coluna "dados" (jsonb) guarda:
--   posicoes  -> última posição importada do relatório da B3
--   data      -> data da posição (ex.: 2026-10-30)
--   instSel   -> instituições marcadas no filtro (null = só XP)
--   alvo      -> sua cópia da carteira-alvo Finclass (null = alvo embutido)
--   cfg       -> valor investido, modo, banda morta etc.
--
-- Privacidade: cada um vê e altera SÓ a própria carteira
-- (Felipe não vê a da Mariana e vice-versa).
-- =====================================================================

create table if not exists public.invest_carteira (
  pessoa        text primary key,
  dados         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

alter table public.invest_carteira enable row level security;

drop policy if exists "invest: so a propria carteira" on public.invest_carteira;
create policy "invest: so a propria carteira"
  on public.invest_carteira
  for all
  to authenticated
  using      (pessoa = (select p.pessoa from public.perfis p where p.id = auth.uid()))
  with check (pessoa = (select p.pessoa from public.perfis p where p.id = auth.uid()));

grant select, insert, update, delete on public.invest_carteira to authenticated;
