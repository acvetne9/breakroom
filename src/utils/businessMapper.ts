import type { Business, BusinessRole } from '@/types/business';
import { sanitizeVoteTotal } from '@/utils/voteCalculations';

/** The columns any businesses row/RPC result must carry to become a Business. */
export interface RawBusinessRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
  business_type?: string | null;
  atmosphere?: string[] | null;
  address?: string | null;
  website?: string | null;
}

/** The columns a business_roles row must carry to become a BusinessRole. */
export interface RawRoleRow {
  id: string;
  role: string;
  salary: string;
  votes_total?: number | null;
  business_id?: string;
}

/**
 * Maps a raw Supabase/RPC `businesses` row to the Business domain type.
 * Callers pass the resolved `roles` (raw RPC json array, or rows run through
 * mapRoleRow). address/website come through when the row includes them.
 */
export const mapBusinessRow = (row: RawBusinessRow, roles: Business['roles'] = []): Business => ({
  id: row.id,
  name: row.name,
  position: { lat: row.lat, lng: row.lng },
  businessType: row.business_type ?? undefined,
  atmosphere: row.atmosphere || [],
  address: row.address ?? undefined,
  website: row.website || undefined,
  roles,
});

/**
 * Maps a raw role row to BusinessRole. `userVote` defaults to null (search path);
 * the business-details path resolves the real vote and passes it in.
 */
export const mapRoleRow = (row: RawRoleRow, userVote: BusinessRole['userVote'] = null): BusinessRole => ({
  id: row.id,
  role: row.role,
  salary: row.salary,
  votesTotal: sanitizeVoteTotal(row.votes_total),
  userVote,
});
