create schema if not exists michi;

create table if not exists michi.users (
  id uuid primary key default gen_random_uuid(),
  full_name varchar(100),
  email varchar(255) not null unique,
  password_hash text not null,
  profile_image text,
  auth_provider varchar(50) default 'email',
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists michi.routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references michi.users(id) on delete cascade,
  route_name varchar(255),
  distance_km decimal(5, 2) not null,
  estimated_duration_minutes integer,
  elevation_gain_meters integer default 0,
  start_latitude decimal(10, 8),
  start_longitude decimal(11, 8),
  route_coordinates jsonb not null,
  geojson jsonb,
  novelty_score integer,
  created_at timestamp default now()
);

create index if not exists routes_user_created_at_idx
  on michi.routes (user_id, created_at desc);
