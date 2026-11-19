create table if not exists public.provider_connection (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  provider varchar(32) not null,
  status varchar(24) not null default 'not_connected',
  connected_at timestamptz,
  last_verified_at timestamptz,
  verification_note varchar(200),
  created_by uuid references public.app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);

alter table public.provider_connection enable row level security;
alter table public.provider_connection force row level security;
create policy vendorproof_workspace_access on public.provider_connection
  using (
    workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
    and public.vendorproof_is_active_workspace_member(workspace_id)
  )
  with check (
    workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
    and public.vendorproof_is_active_workspace_member(workspace_id)
  );

grant select, insert, update, delete on public.provider_connection to vendorproof_app;