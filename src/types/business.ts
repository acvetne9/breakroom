export interface BusinessRole {
  id?: string;
  role: string;
  salary: string;
  votesTotal: number;
  userVote?: "up" | "down" | null;
}

export interface Business {
  id: string;
  name: string;
  position: { lat: number; lng: number };
  atmosphere: string[];
  roles?: BusinessRole[];
  /** True once roles and votes came from the full-details query. */
  detailsLoaded?: boolean;
  /** Which city's table this business lives in; absent means the current city. */
  city?: "nyc" | "chicago";
  businessType?: string;
  website?: string;
  address?: string;
}
