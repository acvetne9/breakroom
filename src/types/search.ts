// Shared search types
export interface EnhancedBusiness {
  id: string;
  name: string;
  lat: number;
  lng: number;
  position: { lat: number; lng: number };
  atmosphere: string[];
  salary?: string;
  businessType?: string;
  business_type?: string;
  website?: string;
  address?: string;
  roles?: Array<{
    id: string;
    role: string;
    salary: string;
    votesTotal: number;
    userVote?: 'up' | 'down' | null;
  }>;
  formatted_address?: string;
  vicinity?: string;
}
