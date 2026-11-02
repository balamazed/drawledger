create table if not exists auth_nonces (
  nonce text primary key,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create table if not exists draws (
  id uuid primary key,
  slug text unique not null,
  chain_id integer not null,
  registry text not null,
  onchain_id bigint not null,
  operator text not null,
  title text not null,
  terms jsonb not null,
  metadata_hash text not null,
  winner_count integer not null,
  public_signup boolean not null default false,
  show_winner_labels boolean not null default false,
  status integer not null default 1,
  created_tx text not null,
  created_block bigint not null,
  entries_locked_at timestamptz,
  entries_root text,
  winners jsonb,
  winners_root text,
  winners_match boolean,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (chain_id, registry, onchain_id)
);

create table if not exists entries (
  id uuid primary key,
  draw_id uuid not null references draws(id) on delete cascade,
  label text not null,
  contact text,
  salt text not null,
  entry_hash text not null,
  receipt_token text unique not null,
  source text not null default 'operator',
  created_at timestamptz not null default now(),
  unique (draw_id, entry_hash),
  unique (draw_id, contact)
);
create index if not exists entries_draw_idx on entries(draw_id);

create table if not exists draw_events (
  draw_id uuid not null references draws(id) on delete cascade,
  name text not null,
  tx_hash text not null,
  block_number bigint not null,
  primary key (draw_id, tx_hash, name)
);
