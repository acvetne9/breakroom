export interface BusinessRole {
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
  salary?: string;
  roles?: BusinessRole[];
  businessType?: string;
  website?: string;
}
