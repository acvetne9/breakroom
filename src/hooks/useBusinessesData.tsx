import { useState, useEffect } from 'react';

interface Business {
  id: string;
  name: string;
  position: { lat: number; lng: number };
  rating: number;
  salary?: string;
  stories?: Array<{ id: string; text: string; author: string }>;
  roles?: Array<{ role: string; salary: string }>;
}

export const useBusinessesData = () => {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBusinesses = async () => {
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=40.7831,-73.9712&radius=5000&type=restaurant&key=AIzaSyCkLj9I2chNXHkMTbBO0k-KkEmnc_jAqyQ`
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch businesses');
        }

        const data = await response.json();
        
        const businessesData: Business[] = data.results?.slice(0, 20).map((place: any, index: number) => ({
          id: place.place_id || `business-${index}`,
          name: place.name || 'Unknown Business',
          position: {
            lat: place.geometry?.location?.lat || 40.7831 + (Math.random() - 0.5) * 0.01,
            lng: place.geometry?.location?.lng || -73.9712 + (Math.random() - 0.5) * 0.01
          },
          rating: place.rating || 4.0 + Math.random(),
          salary: `$${(12 + Math.random() * 8).toFixed(1)}`,
          stories: [
            { 
              id: `story-${index}-1`, 
              text: 'Great place to work, flexible hours and supportive management team.', 
              author: `Employee${Math.floor(Math.random() * 1000)}` 
            },
            { 
              id: `story-${index}-2`, 
              text: 'Good benefits and opportunities for growth within the company.', 
              author: `Worker${Math.floor(Math.random() * 1000)}` 
            }
          ],
          roles: [
            { role: 'Server', salary: `$${(13 + Math.random() * 5).toFixed(1)}` },
            { role: 'Manager', salary: `$${(18 + Math.random() * 7).toFixed(1)}` }
          ]
        })) || [];

        setBusinesses(businessesData);
      } catch (error) {
        console.error('Error fetching businesses:', error);
        // Fallback to mock data
        setBusinesses([
          {
            id: '1',
            name: 'Cafe Priyanka',
            position: { lat: 40.7831, lng: -73.9712 },
            rating: 5.0,
            salary: '$13.6',
            stories: [
              { id: '1', text: 'Great place to work, flexible hours', author: 'Sarah123' },
              { id: '2', text: 'Management is really supportive', author: 'Mike_B' }
            ],
            roles: [
              { role: 'Barista', salary: '$13.6' },
              { role: 'Manager', salary: '$18.5' }
            ]
          },
          {
            id: '2',
            name: 'Taco Bell',
            position: { lat: 40.7841, lng: -73.9702 },
            rating: 4.2,
            salary: '$15.0',
            stories: [
              { id: '3', text: 'Fast-paced environment, good for building skills', author: 'JobSeeker' }
            ]
          }
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchBusinesses();
  }, []);

  return { businesses, loading };
};