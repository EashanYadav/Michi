create table if not exists michi.run_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references michi.users(id) on delete cascade,
  route_name varchar(255) not null,
  distance_km decimal(5, 2) not null,
  target_distance_km decimal(5, 2) not null,
  duration_seconds integer not null,
  pace varchar(32) not null,
  completed_at timestamp not null,
  created_at timestamp default now()
);

create index if not exists run_history_user_completed_at_idx
  on michi.run_history (user_id, completed_at desc);
