-- Remove database objects nothing uses any more.
--
-- Duplicate triggers: votes and role_votes each had two AFTER triggers that
-- both recomputed the same total from scratch, and businesses had two BEFORE
-- triggers both setting geom from lat/lng. Results were correct but every write
-- did the work twice. Keep one of each.
--
-- Unused RPCs: the client now calls get_businesses_in_viewport_slim,
-- search_businesses and move_current_job_to_past only. The definitions of the
-- dropped functions remain in migrations_archive/ (baseline) if ever needed.

drop trigger if exists update_post_votes_trigger on public.votes;
drop function if exists public.update_post_vote_count();

drop trigger if exists update_role_votes_count on public.role_votes;
drop function if exists public.update_role_vote_count();

drop trigger if exists trigger_update_business_geom on public.businesses;
drop function if exists public.update_business_geom();

drop function if exists public.businesses_in_bbox(double precision, double precision, double precision, double precision, integer);
drop function if exists public.get_businesses_in_viewport_grid_sampled(double precision, double precision, double precision, double precision, integer, uuid);
drop function if exists public.get_businesses_in_viewport_no_ordering(double precision, double precision, double precision, double precision, integer, uuid);
drop function if exists public.get_businesses_in_viewport_ordered(double precision, double precision, double precision, double precision, double precision, double precision, integer, uuid);
drop function if exists public.get_businesses_near_point(double precision, double precision, integer, integer);
drop function if exists public.get_businesses_with_roles_near_point(double precision, double precision, integer, integer);
drop function if exists public.get_businesses_with_roles_and_votes_near_point(double precision, double precision, double precision, integer, uuid);
drop function if exists public.search_businesses_global(text, text, text, numeric, numeric, integer, integer);
