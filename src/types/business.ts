export interface BusinessRole {
  id?: string;
  role: string;
  salary: string;
  upvotes: number;
  downvotes: number;
  userVote?: 'up' | 'down' | null;
}

export interface Business {
  id: string;
  name: string;
  position: { lat: number; lng: number };
  atmosphere: string[];
  roles?: BusinessRole[];
  detailsLoaded?: boolean;
  businessType?: string;
  website?: string;
  address?: string;
}
