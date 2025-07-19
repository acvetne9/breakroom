import { useState, useEffect } from 'react';

interface Business {
  id: string;
  name: string;
  type: string;
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
        // Generate extensive mock data for NYC businesses since API has CORS issues
        const generateBusinesses = () => {
          const businesses: Business[] = [];
          const nycAreas = [
            { name: 'Manhattan', lat: 40.7831, lng: -73.9712 },
            { name: 'Brooklyn', lat: 40.6782, lng: -73.9442 },
            { name: 'Queens', lat: 40.7282, lng: -73.7949 },
            { name: 'Bronx', lat: 40.8448, lng: -73.8648 },
            { name: 'Staten Island', lat: 40.5795, lng: -74.1502 }
          ];
          
          const businessTypes = ['Restaurant', 'Cafe', 'Bar', 'Deli', 'Bakery', 'Fast Food', 'Pizza Place', 'Grocery Store'];
          const businessNames = [
            'Joe\'s Coffee', 'Tony\'s Pizza', 'Brooklyn Bagels', 'Manhattan Deli', 'Queens Cafe',
            'Bronx Bistro', 'Staten Island Eats', 'NYC Grill', 'Broadway Burgers', 'Central Park Cafe',
            'Times Square Tacos', 'Village Vegan', 'Soho Sushi', 'Tribeca Treats', 'Chelsea Chicken',
            'Midtown Meals', 'Lower East Side Lunch', 'Upper West Side Wraps', 'East Village Eats',
            'Greenwich Gourmet', 'Chinatown Chow', 'Little Italy Lunch', 'Financial District Food'
          ];

          nycAreas.forEach((area, areaIndex) => {
            for (let i = 0; i < 50; i++) { // 50 businesses per area = 250 total
              const businessIndex = areaIndex * 50 + i;
              const randomName = businessNames[Math.floor(Math.random() * businessNames.length)];
              const randomType = businessTypes[Math.floor(Math.random() * businessTypes.length)];
              
              businesses.push({
                id: `business-${businessIndex}`,
                name: `${randomName} ${area.name}`,
                type: randomType,
                position: {
                  lat: area.lat + (Math.random() - 0.5) * 0.02,
                  lng: area.lng + (Math.random() - 0.5) * 0.02
                },
                rating: 3.5 + Math.random() * 1.5,
                salary: `$${(12 + Math.random() * 8).toFixed(1)}`,
                stories: [
                  { 
                    id: `story-${businessIndex}-1`, 
                    text: 'Great place to work, flexible hours and supportive management team.', 
                    author: `Employee${Math.floor(Math.random() * 1000)}` 
                  },
                  { 
                    id: `story-${businessIndex}-2`, 
                    text: 'Good benefits and opportunities for growth within the company.', 
                    author: `Worker${Math.floor(Math.random() * 1000)}` 
                  }
                ],
                roles: [
                  { role: 'Server', salary: `$${(13 + Math.random() * 5).toFixed(1)}` },
                  { role: 'Manager', salary: `$${(18 + Math.random() * 7).toFixed(1)}` }
                ]
              });
            }
          });
          
          return businesses;
        };

        setBusinesses(generateBusinesses());
      } catch (error) {
        console.error('Error generating businesses:', error);
        // Minimal fallback
        setBusinesses([
          {
            id: '1',
            name: 'Cafe Priyanka',
            type: 'Cafe',
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
            type: 'Fast Food',
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