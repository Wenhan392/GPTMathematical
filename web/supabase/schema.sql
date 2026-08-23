create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.stripe_customers (
  stripe_customer_id text primary key,
  user_id uuid references public.users(id) on delete set null,
  customer_email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  license_key text not null unique,
  user_id uuid references public.users(id) on delete set null,
  customer_email text not null,
  stripe_customer_id text references public.stripe_customers(stripe_customer_id) on delete set null,
  stripe_subscription_id text unique,
  stripe_payment_intent_id text unique,
  plan text not null check (plan in ('free', 'plus_subscription', 'lifetime')),
  billing_plan text not null,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  quantity integer not null default 1 check (quantity > 0),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.license_activations (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  device_id_hash text not null,
  activated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (license_id, device_id_hash)
);

create table if not exists public.app_account_sessions (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  device_id_hash text not null,
  account_token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (license_id, device_id_hash)
);

create table if not exists public.export_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  license_id uuid not null references public.licenses(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  word_exports integer not null default 0 check (word_exports >= 0),
  pdf_exports integer not null default 0 check (pdf_exports >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (license_id, period_start)
);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'licenses_plan_check'
      and conrelid = 'public.licenses'::regclass
  ) then
    alter table public.licenses drop constraint licenses_plan_check;
  end if;
end $$;

update public.licenses
set plan = 'plus_subscription'
where plan = 'subscription';

alter table public.licenses
  add constraint licenses_plan_check
  check (plan in ('free', 'plus_subscription', 'lifetime'));

alter table public.users enable row level security;
alter table public.stripe_customers enable row level security;
alter table public.licenses enable row level security;
alter table public.license_activations enable row level security;
alter table public.app_account_sessions enable row level security;
alter table public.export_usage enable row level security;

drop policy if exists "Users can read their own profile" on public.users;
create policy "Users can read their own profile"
  on public.users for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can read their own licenses" on public.licenses;
create policy "Users can read their own licenses"
  on public.licenses for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own Stripe customer" on public.stripe_customers;
create policy "Users can read their own Stripe customer"
  on public.stripe_customers for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read activations for their own licenses" on public.license_activations;
create policy "Users can read activations for their own licenses"
  on public.license_activations for select
  to authenticated
  using (
    exists (
      select 1
      from public.licenses
      where licenses.id = license_activations.license_id
        and licenses.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can read their own export usage" on public.export_usage;
create policy "Users can read their own export usage"
  on public.export_usage for select
  to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists licenses_customer_email_idx on public.licenses(customer_email);
create index if not exists licenses_user_id_idx on public.licenses(user_id);
create index if not exists licenses_stripe_customer_id_idx on public.licenses(stripe_customer_id);
create index if not exists stripe_customers_user_id_idx on public.stripe_customers(user_id);
create index if not exists license_activations_license_id_idx on public.license_activations(license_id);
create index if not exists app_account_sessions_license_id_idx on public.app_account_sessions(license_id);
create index if not exists app_account_sessions_device_id_hash_idx on public.app_account_sessions(device_id_hash);
create index if not exists export_usage_user_id_idx on public.export_usage(user_id);
create index if not exists export_usage_license_id_idx on public.export_usage(license_id);
create index if not exists export_usage_period_idx on public.export_usage(period_start, period_end);
