-- TripRank PostgreSQL schema (mirrors src/db/schema.ts used by the web build via Drizzle)
create extension if not exists "pgcrypto";

create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  username    text not null,
  country     text not null default 'Global',
  car         text,
  created_at  timestamptz not null default now()
);
create unique index if not exists users_username_uq on users (lower(username));

create table if not exists trips (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users(id) on delete cascade,
  started_at            timestamptz not null,
  ended_at              timestamptz not null,
  duration_sec          integer not null check (duration_sec > 0),
  distance_km           double precision not null check (distance_km >= 0),
  top_speed_kmh         double precision not null check (top_speed_kmh between 0 and 500),
  avg_speed_kmh         double precision not null,
  max_gforce            double precision not null,
  zero_to_hundred_sec   double precision,
  zero_to_sixty_sec     double precision,
  speed_array           jsonb not null,            -- [km/h per second]
  samples               jsonb not null,            -- [{t,lat,lng,speed,g}]
  is_simulated          integer not null default 0,
  created_at            timestamptz not null default now()
);
create index if not exists trips_user_idx      on trips (user_id, started_at desc);
create index if not exists trips_top_speed_idx on trips (top_speed_kmh desc);

create table if not exists video_renders (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references trips(id) on delete cascade,
  status       text not null default 'processing',  -- processing | done | failed
  output_path  text,
  error        text,
  created_at   timestamptz not null default now()
);
