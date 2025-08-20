import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { X, Plus } from 'lucide-react';

interface Landmark {
  lat: number;
  lng: number;
  emoji: string;
}

interface LandmarksControlProps {
  landmarks: Landmark[];
  onLandmarksChange: (landmarks: Landmark[]) => void;
}

const LandmarksControl: React.FC<LandmarksControlProps> = ({
  landmarks,
  onLandmarksChange
}) => {
  const [newLandmark, setNewLandmark] = useState({ lat: '', lng: '', emoji: '📍' });
  const [isOpen, setIsOpen] = useState(false);

  const addLandmark = () => {
    const lat = parseFloat(newLandmark.lat);
    const lng = parseFloat(newLandmark.lng);
    
    if (isNaN(lat) || isNaN(lng) || !newLandmark.emoji.trim()) {
      return;
    }

    const landmark: Landmark = {
      lat,
      lng,
      emoji: newLandmark.emoji
    };

    onLandmarksChange([...landmarks, landmark]);
    setNewLandmark({ lat: '', lng: '', emoji: '📍' });
  };

  const removeLandmark = (index: number) => {
    const updated = landmarks.filter((_, i) => i !== index);
    onLandmarksChange(updated);
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 right-4 z-30"
        variant="outline"
      >
        🗺️ Landmarks
      </Button>
    );
  }

  return (
    <Card className="fixed top-4 right-4 z-30 w-80">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Landmarks</CardTitle>
        <Button
          onClick={() => setIsOpen(false)}
          variant="ghost"
          size="sm"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Input
            placeholder="Lat"
            value={newLandmark.lat}
            onChange={(e) => setNewLandmark({ ...newLandmark, lat: e.target.value })}
          />
          <Input
            placeholder="Lng"
            value={newLandmark.lng}
            onChange={(e) => setNewLandmark({ ...newLandmark, lng: e.target.value })}
          />
          <Input
            placeholder="📍"
            value={newLandmark.emoji}
            onChange={(e) => setNewLandmark({ ...newLandmark, emoji: e.target.value })}
          />
        </div>
        <Button onClick={addLandmark} className="w-full" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Landmark
        </Button>
        
        <div className="max-h-40 overflow-y-auto space-y-2">
          {landmarks.map((landmark, index) => (
            <div key={index} className="flex items-center justify-between bg-muted p-2 rounded">
              <span className="text-sm">
                {landmark.emoji} ({landmark.lat.toFixed(4)}, {landmark.lng.toFixed(4)})
              </span>
              <Button
                onClick={() => removeLandmark(index)}
                variant="ghost"
                size="sm"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default LandmarksControl;