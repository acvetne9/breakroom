#!/usr/bin/env bash
# Load the Chicago businesses CSV (built by build-city.sh chicago) into
# public.businesses_chicago on the linked Supabase project. Idempotent: rows
# are matched on source_id (the OSM element id) and updated in place, and rows
# that disappeared from OSM are removed unless they carry user data, so the
# table always mirrors the current build.
#
# Usage: bash scripts/osm/import-businesses.sh [path/to/chicago-businesses.csv]
# Needs: psql (brew install libpq), the migration 20261024000000_chicago_city.sql
# applied, and the database password in the macOS keychain (see supabase/CLAUDE.md).
set -euo pipefail

cd "$(dirname "$0")/../.."
CSV="${1:-.osm-cache/chicago-businesses.csv}"  
PSQL="${PSQL:-/opt/homebrew/opt/libpq/bin/psql}"
CONN="postgresql://postgres.hyygpxhwkvyxtbjnnpqk@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

[ -f "$CSV" ] || { echo "CSV not found: $CSV (run scripts/osm/build-city.sh chicago first)"; exit 1; }
command -v "$PSQL" >/dev/null || { echo "psql not found at $PSQL"; exit 1; }

export PGPASSWORD="$(security find-generic-password -a workaround -s supabase-db-url -w)"

echo "Importing $(($(wc -l < "$CSV") - 1)) rows from $CSV ..."
"$PSQL" "$CONN" -v ON_ERROR_STOP=1 --single-transaction -q <<SQL
create temp table staging (
  source_id text,
  name text,
  business_type text,
  lat double precision,
  lng double precision,
  address text,
  website text
);
\\copy staging from '$CSV' with (format csv, header true)

insert into public.businesses_chicago (source_id, name, business_type, lat, lng, address, website, atmosphere)
select source_id, name, nullif(business_type, ''), lat, lng, nullif(address, ''), nullif(website, ''), '{}'::text[]
from staging
where source_id is not null and name is not null and lat is not null and lng is not null
on conflict (source_id) do update
  set name = excluded.name,
      business_type = excluded.business_type,
      lat = excluded.lat,
      lng = excluded.lng,
      address = excluded.address,
      website = excluded.website;

-- Rows that vanished from OSM since the last import. Keep any that already
-- carry roles, posts or jobs so user contributions never disappear.
delete from public.businesses_chicago b
where b.source_id is not null
  and not exists (select 1 from staging s where s.source_id = b.source_id)
  and not exists (select 1 from public.business_roles_chicago r where r.business_id = b.id)
  and not exists (select 1 from public.posts p where p.city = 'chicago' and p.business_id = b.id)
  and not exists (select 1 from public.current_jobs j where j.city = 'chicago' and j.business_id = b.id)
  and not exists (select 1 from public.past_jobs j where j.city = 'chicago' and j.business_id = b.id);

analyze public.businesses_chicago;
SQL

"$PSQL" "$CONN" -Atc "select count(*) || ' businesses in businesses_chicago' from public.businesses_chicago;"
