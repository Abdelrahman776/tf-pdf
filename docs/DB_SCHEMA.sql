-- TrueForm PDF baseline schema (PostgreSQL / Supabase)

create table if not exists users (
  id uuid primary key,
  email text unique,
  display_name text,
  plan text not null default 'free',
  credits integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists files (
  id uuid primary key,
  user_id uuid references users(id) on delete cascade,
  filename text not null,
  content_type text not null,
  size_bytes bigint not null,
  storage_path text not null,
  sha256 text,
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key,
  user_id uuid references users(id) on delete cascade,
  file_id uuid references files(id) on delete cascade,
  mode text not null check (mode in ('scanned_pdf','image','handwriting')),
  language text not null default 'en',
  preserve_layout boolean not null default true,
  status text not null,
  progress int not null default 0,
  message text not null default 'Queued',
  provider_route jsonb not null default '{}'::jsonb,
  result_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists job_events (
  id bigserial primary key,
  job_id uuid not null references jobs(id) on delete cascade,
  status text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists job_pages (
  id bigserial primary key,
  job_id uuid not null references jobs(id) on delete cascade,
  page_number int not null,
  width_pt numeric(10,2) not null,
  height_pt numeric(10,2) not null,
  page_json jsonb not null,
  unique(job_id, page_number)
);

create table if not exists page_patches (
  id bigserial primary key,
  job_id uuid not null references jobs(id) on delete cascade,
  page_number int not null,
  instruction text not null,
  applied boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists api_keys (
  id uuid primary key,
  user_id uuid references users(id) on delete cascade,
  key_prefix text not null,
  key_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists billing_events (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  provider text not null,
  event_type text not null,
  credits_delta int not null default 0,
  amount_cents int,
  currency text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_jobs_user_created_at on jobs(user_id, created_at desc);
create index if not exists idx_job_events_job_created_at on job_events(job_id, created_at);
create index if not exists idx_job_pages_job_page on job_pages(job_id, page_number);
