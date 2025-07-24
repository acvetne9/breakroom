interface PlaceDetails {
  website?: string;
  url?: string;
}

export const fetchBusinessDetails = async (placeId: string): Promise<PlaceDetails> => {
  const API_KEY = 'AIzaSyCkLj9I2chNXHkMTbBO0k-KkEmnc_jAqyQ';
  
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=website,url&key=${API_KEY}`
    );
    const data = await response.json();
    
    if (data.status === 'OK' && data.result) {
      return {
        website: data.result.website,
        url: data.result.url
      };
    }
    
    return {};
  } catch (error) {
    console.error('Error fetching business details:', error);
    return {};
  }
};