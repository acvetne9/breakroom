import React, { useState } from 'react';
import UnifiedBusinessSearch from './UnifiedBusinessSearch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface UserData {
  salary: string;
  role: string;
  location: string;
  fullLocation?: string;
  timePeriod: string;
}

interface Post {
  id: string;
  author: string;
  text: string;
  businessId?: string;
  businessName?: string;
  images?: string[];
  isStory?: boolean;
  createdAt: Date;
}

interface SettingsPageProps {
  initialData: UserData;
  userPosts: Post[];
  onStoriesClick: () => void;
  onPostClick: (post: Post) => void;
  onJobUpdate: (jobData: { salary: string; role: string; location: string; timePeriod: string }) => Promise<void>;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ 
  initialData, 
  userPosts, 
  onStoriesClick, 
  onPostClick, 
  onJobUpdate 
}) => {
  const [salary, setSalary] = useState(initialData.salary);
  const [role, setRole] = useState(initialData.role);
  const [location, setLocation] = useState(initialData.location);
  const [timePeriod, setTimePeriod] = useState(initialData.timePeriod);
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const handleLocationChange = (value: string, business?: any) => {
    setLocation(value);
  };

  const handleLocationSelect = (business: any) => {
    setLocation(business.name);
  };

  const formatSalary = (value: string) => {
    const numericValue = value.replace(/[^\d.]/g, '');
    if (numericValue === '') return '';
    
    const num = parseFloat(numericValue);
    if (isNaN(num)) return '';
    
    return num.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  const handleSalaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedValue = formatSalary(e.target.value);
    setSalary(formattedValue);
  };

  const handleSaveSettings = async () => {
    if (!salary || !role || !location) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setIsUpdating(true);
    try {
      await onJobUpdate({
        salary,
        role,
        location,
        timePeriod
      });
      
      toast({
        title: "Settings Updated",
        description: "Your job information has been saved successfully",
      });
    } catch (error) {
      toast({
        title: "Update Failed",
        description: "Failed to save your settings. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background p-4">
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Job Settings</CardTitle>
          <CardDescription>
            Update your current job information and preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Salary Section */}
          <div className="space-y-2">
            <Label htmlFor="salary">Current Salary</Label>
            <div className="flex gap-2">
              <input
                id="salary"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                value={salary}
                onChange={handleSalaryChange}
                placeholder="$0.00"
                className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <select
                value={timePeriod}
                onChange={(e) => setTimePeriod(e.target.value)}
                className="px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="HR">HR</option>
                <option value="MO">MO</option>
                <option value="YR">YR</option>
              </select>
            </div>
          </div>

          {/* Role Section */}
          <div className="space-y-2">
            <Label htmlFor="role">Job Role</Label>
            <input
              id="role"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Enter your job role..."
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Location Section */}
          <div className="space-y-2">
            <Label htmlFor="location">Work Location</Label>
            <UnifiedBusinessSearch
              value={location}
              onChange={handleLocationChange}
              onBusinessSelect={handleLocationSelect}
              placeholder="Search for your workplace..."
              variant="dropdown"
            />
          </div>

          {/* User Posts Summary */}
          {userPosts.length > 0 && (
            <div className="space-y-2">
              <Label>Your Activity</Label>
              <div className="text-sm text-muted-foreground">
                You have {userPosts.length} post{userPosts.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button 
              onClick={handleSaveSettings} 
              disabled={isUpdating}
              className="flex-1"
            >
              {isUpdating ? 'Updating...' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;