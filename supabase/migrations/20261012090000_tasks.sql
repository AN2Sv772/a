-- ============================================================================
-- MailDesk — Tasks table (for CRM Tasks page)
-- ============================================================================
create table if not exists public.tasks (
  id             bigint generated always as identity primary key,
  title          text not null,
  notes          text,
  status         text not null default 'pending'
                 check (status in ('pending','in_progress','completed','cancelled')),
  priority       int not null default 0,
  contact_id     bigint references public.leads (id) on delete set null,
  contact_email  text,
  due_at         timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists tasks_status_idx   on public.tasks (status, due_at);
create index if not exists tasks_contact_idx  on public.tasks (contact_id);

alter table public.tasks enable row level security;

drop policy if exists tasks_admin on public.tasks;
create policy tasks_admin on public.tasks
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.tasks to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create trigger tasks_touch_updated_at
before update on public.tasks
for each row execute function public.touch_updated_at();
