import type { Business, BusinessRole } from '@/types/business';
import { sanitizeVoteTotal } from '@/utils/voteCalculations';

/**
 * Maps a raw Supabase/RPC `businesses` row to the Business domain type.
 * Callers pass the resolved `roles` (raw RPC json array, or rows run through
 * mapRoleRow). address/website come through when the row includes them.
 */
export const mapBusinessRow = (row: any, roles: Business['roles'] = []): Business => ({
  id: row.id,
  name: row.name,
  position: { lat: row.lat, lng: row.lng },
  businessType: row.business_type,
  atmosphere: row.atmosphere || [],
  address: row.address,
  website: row.website || undefined,
  roles,
});

/**
 * Maps a raw role row to BusinessRole. `userVote` defaults to null (search path);
 * the business-details path resolves the real vote and passes it in.
 */
export const mapRoleRow = (row: any, userVote: BusinessRole['userVote'] = null): BusinessRole => ({
  id: row.id,
  role: row.role,
  salary: row.salary,
  votesTotal: sanitizeVoteTotal(row.votes_total),
  userVote,
});
