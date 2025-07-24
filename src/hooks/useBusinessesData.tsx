
import { useState, useEffect } from 'react';

interface Business {
  id: string;
  name: string;
  position: { lat: number; lng: number };
  rating: number;
  salary?: string;
  roles?: Array<{ role: string; salary: string }>;
  businessType?: string;
  place_id?: string;
  website?: string;
  url?: string;
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
          
          const businessTypes = [
            'Restaurant', 'Cafe', 'Bar', 'Deli', 'Bakery', 'Fast Food', 
            'Pizza Place', 'Grocery Store', 'Movie Theater', 'Retail Store',
            'Tech Company', 'Clothing Store', 'Bookstore', 'Pharmacy',
            'Hair Salon', 'Fitness Center', 'Hotel', 'Bank'
          ];
          
          const businessNames = [
            'Joe\'s Coffee', 'Tony\'s Pizza', 'Brooklyn Bagels', 'Manhattan Deli', 'Queens Cafe',
            'Bronx Bistro', 'Staten Island Eats', 'NYC Grill', 'Broadway Burgers', 'Central Park Cafe',
            'Times Square Tacos', 'Village Vegan', 'Soho Sushi', 'Tribeca Treats', 'Chelsea Chicken',
            'Midtown Meals', 'Lower East Side Lunch', 'Upper West Side Wraps', 'East Village Eats',
            'Greenwich Gourmet', 'Chinatown Chow', 'Little Italy Lunch', 'Financial District Food'
          ];

          const jobRoles = [
            { role: 'Server', salary: '$13.6' },
            { role: 'Manager', salary: '$18.5' },
            { role: 'Barista', salary: '$14.2' },
            { role: 'Cook', salary: '$15.8' },
            { role: 'Cashier', salary: '$13.0' },
            { role: 'Architect', salary: '$28.5' },
            { role: 'Designer', salary: '$22.3' },
            { role: 'Developer', salary: '$35.0' },
            { role: 'Sales Associate', salary: '$14.5' },
            { role: 'Receptionist', salary: '$16.2' },
            { role: 'Trainer', salary: '$19.8' },
            { role: 'Pharmacist', salary: '$32.1' },
            { role: 'Stylist', salary: '$18.7' }
          ];

          nycAreas.forEach((area, areaIndex) => {
            for (let i = 0; i < 50; i++) { // 50 businesses per area = 250 total
              const businessIndex = areaIndex * 50 + i;
              const randomName = businessNames[Math.floor(Math.random() * businessNames.length)];
              const randomType = businessTypes[Math.floor(Math.random() * businessTypes.length)];
              
              // Select 2-3 random roles for each business
              const shuffledRoles = [...jobRoles].sort(() => 0.5 - Math.random());
              const selectedRoles = shuffledRoles.slice(0, 2 + Math.floor(Math.random() * 2));
              
              const mockPlaceId = `ChIJ${Math.random().toString(36).substring(2, 15)}`;
              const mockWebsites = [
                `https://www.${randomName.toLowerCase().replace(/[^a-z]/g, '')}${area.name.toLowerCase()}.com`,
                undefined, // Some businesses don't have websites
              ];
              const hasWebsite = Math.random() > 0.3; // 70% chance of having a website
              
              businesses.push({
                id: `business-${businessIndex}`,
                name: `${randomName} ${area.name}`,
                businessType: randomType,
                position: {
                  lat: area.lat + (Math.random() - 0.5) * 0.02,
                  lng: area.lng + (Math.random() - 0.5) * 0.02
                },
                rating: 3.5 + Math.random() * 1.5,
                salary: `$${(12 + Math.random() * 8).toFixed(1)}`,
                roles: selectedRoles,
                place_id: mockPlaceId,
                website: hasWebsite ? mockWebsites[0] : undefined,
                url: `https://maps.google.com/?cid=${Math.random().toString().substring(2, 15)}`
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
            businessType: 'Cafe',
            position: { lat: 40.7831, lng: -73.9712 },
            rating: 5.0,
            salary: '$13.6',
            roles: [
              { role: 'Barista', salary: '$13.6' },
              { role: 'Manager', salary: '$18.5' }
            ],
            place_id: 'ChIJexampleplacepriyanka',
            website: 'https://www.cafepriyanka.com',
            url: 'https://maps.google.com/?cid=12345678901234567890'
          },
          {
            id: '2',
            name: 'Taco Bell',
            businessType: 'Fast Food',
            position: { lat: 40.7841, lng: -73.9702 },
            rating: 4.2,
            salary: '$15.0',
            roles: [
              { role: 'Cashier', salary: '$15.0' },
              { role: 'Cook', salary: '$16.2' }
            ],
            place_id: 'ChIJexampleplacetacobell',
            website: 'https://www.tacobell.com',
            url: 'https://maps.google.com/?cid=09876543210987654321'
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
