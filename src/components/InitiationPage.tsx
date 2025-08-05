import React, { useState } from 'react';
import { motion } from 'framer-motion';
import JobSearchDropdown from './JobSearchDropdown';
import { isProfane } from '../utils/profanityFilter';
import { useToast } from '@/hooks/use-toast';

// Import the predefined job options to check against
const JOB_OPTIONS = [
  'Barista',
  'Server', 
  'Cook',
  'Cashier',
  'Security Guard',
  'Retail Associate',
  'Delivery Driver',
  'Host/Hostess',
  'Cleaner',
  'Stock Associate',
  'Customer Service',
  'Manager',
  'Waiter/Waitress',
  'Receptionist',
  'Sales Associate',
  'Food Service Worker',
  'Maintenance',
  'Supervisor',
  'Shift Leader',
  'Assistant Manager'
];

interface InitiationPageProps {
  onComplete: (data: {
    salary: string;
    role: string;
    location: string;
    fullLocation?: string;
    timePeriod: string;
  }) => void;
}

const InitiationPage: React.FC<InitiationPageProps> = ({
  onComplete
}) => {
  const [salary, setSalary] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [fullLocation, setFullLocation] = useState('');
  const [timePeriod, setTimePeriod] = useState('HR');
  const [isComplete, setIsComplete] = useState(false);
  const { toast } = useToast();

  const handleSalaryChange = (value: string) => {
    const cleanValue = value.replace(/[^0-9.]/g, '');
    setSalary(cleanValue ? `$${cleanValue}` : '');
  };

  const checkForCompletion = () => {
    const allFilled = salary.trim() !== '' && role.trim() !== '' && location.trim() !== '';
    
    console.log('checkForCompletion called:', { 
      salary, 
      role, 
      location, 
      allFilled
    });
    
    if (allFilled && !isComplete) {
      console.log('Setting isComplete to true');
      setIsComplete(true);
      
      // Complete after animation
      setTimeout(() => {
        const dataToPass = { 
          salary, 
          role, 
          location, 
          fullLocation: fullLocation || location, 
          timePeriod 
        };
        console.log('InitiationPage completing with data:', dataToPass);
        onComplete(dataToPass);
      }, 500);
    }
  };

  const handleRoleChange = (value: string) => {
    console.log('handleRoleChange called with:', value);
    
    // Check if this is a predefined job option (safe to use)
    const isPredefinedOption = JOB_OPTIONS.includes(value);
    
    // Only validate for profanity if it's NOT a predefined option
    if (!isPredefinedOption && value && isProfane(value)) {
      console.log('Profanity detected in manual role input:', value);
      toast({
        title: "Invalid role",
        description: "Inappropriate content detected in job role",
        variant: "destructive"
      });
      return; // Don't set the value if it's profane
    }
    
    console.log('Setting role:', value, 'isPredefined:', isPredefinedOption);
    setRole(value);
  };

  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocation(value);
    setFullLocation(value); // Simple fallback - use same value
  };

  const handleLocationBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    
    if (!value) {
      setLocation('');
      setFullLocation('');
      return;
    }
    
    // Only validate for profanity on blur for manual input
    if (value && isProfane(value)) {
      toast({
        title: "Invalid location",
        description: "Inappropriate content detected in location",
        variant: "destructive"
      });
      // Clear the invalid input
      setLocation('');
      setFullLocation('');
      return;
    }
    
    console.log('Location blur with value:', value);
    setLocation(value);
    setFullLocation(value);
    
    // Check for completion
    setTimeout(() => {
      checkForCompletion();
    }, 10);
  };

  return (
    <motion.div 
      initial={{ y: 0 }} 
      animate={{ y: isComplete ? '-100vh' : 0 }} 
      transition={{ duration: 0.5, ease: 'easeInOut' }} 
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/20"
    >
      <div className="app-card flex flex-col justify-center px-8 py-12">
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-app-black mb-6 font-normal text-lg">
              Real Info. Real Fast.
            </h1>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center space-x-3">
                <input 
                  type="text" 
                  value={salary} 
                  onChange={e => handleSalaryChange(e.target.value)} 
                  onBlur={checkForCompletion} 
                  placeholder="$14" 
                  className="app-input text-center text-lg flex-1 !py-0 h-12" 
                />
                <select 
                  value={timePeriod} 
                  onChange={(e) => setTimePeriod(e.target.value)}
                  className="app-input text-lg w-auto !py-0 h-12"
                >
                  <option value="HR">HR</option>
                  <option value="MO">MO</option>
                  <option value="YR">YR</option>
                </select>
              </div>
            </div>

            <div className="text-center">
              <p className="text-app-black mb-4 text-lg font-normal">3 Easy Questions.</p>
            </div>

            <div>
              <JobSearchDropdown 
                value={role} 
                onChange={handleRoleChange}
                onBlur={checkForCompletion} 
                placeholder="Search or select a job role..." 
                className="app-input" 
              />
            </div>

            <div className="text-center">
              <p className="text-app-black mb-4 text-lg">Find Neighborhood Income Trends.</p>
            </div>

            <div>
              <input 
                type="text" 
                value={location}
                onChange={handleLocationChange}
                onBlur={handleLocationBlur} 
                placeholder="Enter NYC location..." 
                className="app-input" 
              />
            </div>

            <div className="text-center mt-8">
              <p className="text-app-black text-lg">Grow Your Community.</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default InitiationPage;