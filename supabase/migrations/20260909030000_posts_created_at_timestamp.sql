-- posts.created_at was TEXT with a now() default, holding two date formats
-- ("2025-08-22 22:19:43+00" and "2026-08-05T23:09:37.332Z"). That made
-- ordering by text slightly wrong and broke the rate-limit window comparison.
-- Every existing value parses, so convert in place.

alter table public.posts
  alter column created_at type timestamptz using created_at::timestamptz,
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists idx_posts_user_created
  on public.posts (user_id, created_at desc);
