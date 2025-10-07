import React, { useState } from 'react';
import JobSearchDropdown from './JobSearchDropdown';
import BusinessSearchDropdown from './BusinessSearchDropdown';
import { isProfane } from '@/utils/profanityFilter';
import { useToast } from '@/hooks/use-toast';

// Import the predefined job options to check against
const JOB_OPTIONS = ["Software Engineer", "Frontend Developer", "Backend Developer", "Full Stack Developer", "Mobile App Developer", "Web Developer", "UI Designer", "UX Designer", "Data Scientist", "Machine Learning Engineer", "AI Researcher", "Cloud Architect", "DevOps Engineer", "Systems Administrator", "Network Engineer", "Database Administrator", "Cybersecurity Analyst", "QA Engineer", "Game Developer", "Embedded Systems Engineer", "Technical Writer", "Product Manager", "Scrum Master", "IT Support Specialist", "Help Desk Technician", "Doctor", "Nurse", "Licensed Practical Nurse", "Certified Nursing Assistant", "Pharmacist", "Pharmacy Technician", "Paramedic", "Emergency Medical Technician", "Dentist", "Dental Hygienist", "Dental Assistant", "Veterinarian", "Veterinary Technician", "Physical Therapist", "Occupational Therapist", "Radiologic Technologist", "Medical Assistant", "Surgical Technologist", "Respiratory Therapist", "Home Health Aide", "Barista", "Server", "Cook", "Line Cook", "Prep Cook", "Sous Chef", "Chef", "Pastry Chef", "Food Service Worker", "Waiter", "Waitress", "Host", "Hostess", "Busser", "Dishwasher", "Caterer", "Food Runner", "Fast Food Worker", "Drive-Thru Operator", "Bartender", "Barback", "Delivery Driver", "Pizza Delivery Driver", "Hotel Housekeeper", "Front Desk Clerk", "Hotel Concierge", "Bellhop", "Room Service Attendant", "Valet Attendant", "Casino Dealer", "Casino Host", "Event Coordinator", "Wedding Planner", "Banquet Server", "Club Promoter", "Tour Guide", "Cashier", "Retail Associate", "Sales Associate", "Stock Associate", "Customer Service Representative", "Customer Service", "Inventory Clerk", "Shelf Stocker", "Store Manager", "Assistant Store Manager", "Greeter", "Bagging Clerk", "Mall Security Guard", "Merchandiser", "Personal Shopper", "Gift Wrapper", "Loss Prevention Specialist", "Taxi Driver", "Ride-share Driver", "Driver", "Bus Driver", "School Bus Driver", "Truck Driver", "Delivery Driver", "Courier", "Bicycle Messenger", "Forklift Operator", "Warehouse Worker", "Order Picker", "Package Handler", "Logistics Coordinator", "Dock Worker", "Shipping Clerk", "Nanny", "Babysitter", "Daycare Worker", "Preschool Teacher", "Childcare Assistant", "Elder Caregiver", "Home Health Aide", "Housekeeper", "Cleaner", "Janitor", "Maid", "Pet Sitter", "Dog Walker", "Pet Groomer", "Landscaper", "Gardener", "Pool Cleaner", "Electrician", "Plumber", "Carpenter", "Welder", "HVAC Technician", "Auto Mechanic", "Diesel Mechanic", "Machinist", "Construction Worker", "General Laborer", "Roofing Specialist", "Painter", "Drywall Installer", "Flooring Installer", "Bricklayer", "Receptionist", "Administrative Assistant", "Office Clerk", "Data Entry Clerk", "File Clerk", "Executive Assistant", "Secretary", "Office Manager", "Virtual Assistant", "Call Center Representative", "Collections Agent", "Telemarketer", "Appointment Setter", "Mailroom Clerk", "Switchboard Operator", "Accountant", "Auditor", "Bookkeeper", "Tax Preparer", "Financial Analyst", "Budget Analyst", "Loan Officer", "Insurance Agent", "Claims Adjuster", "Bank Teller", "Mortgage Broker", "Investment Analyst", "Payroll Specialist", "Real Estate Agent", "Property Manager", "Teacher", "Teaching Assistant", "Substitute Teacher", "School Counselor", "Principal", "Tutor", "Librarian", "Library Assistant", "Academic Advisor", "Professor", "Lawyer", "Paralegal", "Legal Assistant", "Court Clerk", "Judge", "Security Guard", "Private Investigator", "Police Officer", "Corrections Officer", "Firefighter", "Manager", "Assistant Manager", "Shift Leader", "Supervisor", "Team Lead", "Freelance Writer", "Graphic Designer", "Illustrator", "Photographer", "Video Editor", "Voice Actor", "Music Producer", "Social Media Influencer", "Virtual Tutor", "Translator", "Maintenance Worker", "Facilities Technician", "Groundskeeper", "Building Superintendent", "Handyman", "Lifeguard", "Camp Counselor", "Amusement Park Worker", "Theme Park Attendant", "Carnival Worker", "Tour Bus Driver", "Street Performer", "Festival Staff", "Farm Worker", "Fruit Picker", "City Planner", "Urban Planner", "Building Inspector", "City Clerk", "City Council Member", "Mayor's Assistant", "Public Works Laborer", "Water Treatment Plant Operator", "Waste Management Worker", "Sanitation Worker", "Street Sweeper Operator", "Parking Enforcement Officer", "Meter Reader", "Building Maintenance Worker", "Parks and Recreation Worker", "Recreation Coordinator", "Community Outreach Specialist", "City Bus Driver", "Transit Operator", "Traffic Engineer", "Civil Engineer (Municipal)", "City Electrician", "Zoning Officer", "Public Safety Officer", "Emergency Management Coordinator", "City Attorney", "Planning and Zoning Coordinator", "City Engineer", "City Project Manager", "Permit Technician", "Code Enforcement Officer", "Neighborhood Services Coordinator", "City Grant Writer", "Community Development Specialist", "Animal Control Officer", "Public Health Inspector", "City Auditor", "Budget Officer", "City Finance Director", "Environmental Compliance Specialist", "City Surveyor", "Municipal Court Clerk", "Recycling Program Coordinator", "Water Quality Technician", "Traffic Signal Technician", "Road Maintenance Worker", "City Arborist", "Crew Member", "Associate", "Team Member", "Helper", "Laborer", "Worker", "Staff Member", "General Worker", "Operator", "Technician", "Specialist", "Coordinator", "Agent", "Assistant", "Personal Trainer", "Psychiatrist", "Consultant"];
interface InitiationPageProps {
  onComplete: (data: {
    salary: string;
    role: string;
    location: string;
    fullLocation?: string;
    timePeriod: string;
  }) => void;
}

// Address validation function
const isValidAddress = (address: string): boolean => {
  const trimmedAddress = address.trim();

  // Check minimum length
  if (trimmedAddress.length < 10) {
    return false;
  }

  // Check for basic address components
  const hasNumbers = /\d/.test(trimmedAddress);
  const hasLetters = /[a-zA-Z]/.test(trimmedAddress);
  const hasSpaces = /\s/.test(trimmedAddress);

  // Must have numbers (street number), letters, and spaces
  if (!hasNumbers || !hasLetters || !hasSpaces) {
    return false;
  }

  // Common street types/suffixes
  const streetTypes = ['street', 'st', 'avenue', 'ave', 'road', 'rd', 'drive', 'dr', 'lane', 'ln', 'boulevard', 'blvd', 'court', 'ct', 'place', 'pl', 'way', 'circle', 'cir', 'plaza', 'square', 'sq', 'parkway', 'pkwy', 'trail', 'tr', 'terrace', 'ter', 'highway', 'hwy', 'loop', 'row', 'walk', 'alley', 'crescent', 'cres', 'grove', 'heights', 'hill', 'park', 'ridge', 'view', 'crossing', 'xing'];
  const addressLower = trimmedAddress.toLowerCase();
  const hasStreetType = streetTypes.some(type => addressLower.includes(' ' + type + ' ') || addressLower.endsWith(' ' + type) || addressLower.includes(' ' + type + ','));

  // Check for common address patterns
  const addressPatterns = [
  // Pattern: number + street name + type (e.g., "123 Main St")
  /^\d+\s+[a-zA-Z\s]+\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|place|pl|way|circle|cir|plaza|square|sq|parkway|pkwy|trail|tr|terrace|ter|highway|hwy|loop|row|walk|alley|crescent|cres|grove|heights|hill|park|ridge|view|crossing|xing)\b/i,
  // Pattern with apartment/unit numbers
  /^\d+\s+[a-zA-Z\s]+\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|place|pl|way|circle|cir|plaza|square|sq|parkway|pkwy|trail|tr|terrace|ter|highway|hwy|loop|row|walk|alley|crescent|cres|grove|heights|hill|park|ridge|view|crossing|xing)\b.*?(apt|apartment|unit|suite|ste)?\s*\#?\d*$/i];
  const matchesPattern = addressPatterns.some(pattern => pattern.test(trimmedAddress));

  // Address is valid if it has street type or matches common patterns
  return hasStreetType || matchesPattern;
};
const InitiationPage: React.FC<InitiationPageProps> = ({
  onComplete
}) => {
  const [salary, setSalary] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [fullLocation, setFullLocation] = useState('');
  const [timePeriod, setTimePeriod] = useState('HR');
  const [isComplete, setIsComplete] = useState(false);
  const [showNewBusinessForm, setShowNewBusinessForm] = useState(false);
  const [newBusinessAddress, setNewBusinessAddress] = useState('');
  const [isCreatingBusiness, setIsCreatingBusiness] = useState(false);
  const [addressError, setAddressError] = useState('');
  const {
    toast
  } = useToast();

  /** Format salary as $123.00 */
  const formatSalary = (input: string) => {
    const cleanValue = input.replace(/[^0-9.]/g, '');
    const number = parseFloat(cleanValue);
    if (isNaN(number)) return '';
    return `$${number.toFixed(2)}`;
  };
  const handleSalaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Remove non-numeric characters except decimal point
    let raw = e.target.value.replace(/[^0-9.]/g, "");

    // Ensure only one decimal point
    const parts = raw.split('.');
    if (parts.length > 2) {
      raw = parts[0] + '.' + parts.slice(1).join('');
    }

    // Limit to 2 decimal places
    if (parts[1] && parts[1].length > 2) {
      raw = parts[0] + '.' + parts[1].substring(0, 2);
    }

    // Format with $ prefix for display
    const formatted = raw ? `$${raw}` : '';
    setSalary(formatted);
  };
  const checkForCompletion = () => {
    const allFilled = salary.trim() !== '' && role.trim() !== '' && location.trim() !== '';
    const isValidRole = JOB_OPTIONS.includes(role.trim()) || role.trim() === 'Other';
    
    // Business validation: either selected from dropdown OR new business with valid address
    const businessValidFromDropdown = fullLocation && fullLocation !== location;
    const businessValidNewBusiness = showNewBusinessForm && newBusinessAddress.trim() !== '' && isValidAddress(newBusinessAddress);
    const businessValid = businessValidFromDropdown || businessValidNewBusiness;
    
    if (allFilled && isValidRole && businessValid && !isComplete) {
      setIsComplete(true);

      // Delay to allow for UI animations if needed
      setTimeout(() => {
        const dataToPass = {
          salary,
          role,
          location,
          fullLocation: fullLocation || location,
          timePeriod
        };
        onComplete(dataToPass);
      }, 300);
    }
  };
  const handleRoleChange = (value: string) => {
    const isPredefinedOption = JOB_OPTIONS.includes(value);
    if (!isPredefinedOption && value && isProfane(value)) {
      toast({
        title: 'Invalid role',
        description: 'Inappropriate content detected in job role',
        variant: 'destructive'
      });
      return;
    }
    setRole(value);
  };
  const handleLocationChange = (value: string, fullLocation?: string) => {
    setLocation(value);
    setFullLocation(fullLocation || value);

    // Only show "new business form" if user typed free text (not from dropdown)
    setShowNewBusinessForm(!fullLocation && value.length > 2);
  };
  const handleLocationBlur = () => {
    const value = location.trim();
    if (!value) {
      setLocation('');
      setFullLocation('');
      return;
    }
    if (value && isProfane(value)) {
      toast({
        title: 'Invalid location',
        description: 'Inappropriate content detected in location',
        variant: 'destructive'
      });
      setLocation('');
      setFullLocation('');
      return;
    }
    setTimeout(() => checkForCompletion(), 10);
  };
  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewBusinessAddress(value);

    // Clear previous error when user starts typing
    if (addressError) {
      setAddressError('');
    }
  };
  const validateAndCreateBusiness = async () => {
    const address = newBusinessAddress.trim();
    if (!address) {
      setAddressError('Please enter a business address');
      toast({
        title: 'Address required',
        description: 'Please enter the business address',
        variant: 'destructive'
      });
      return;
    }
    if (isProfane(address)) {
      setAddressError('Invalid address content');
      toast({
        title: 'Invalid address',
        description: 'Inappropriate content detected in address',
        variant: 'destructive'
      });
      return;
    }
    if (!isValidAddress(address)) {
      setAddressError('Please enter a valid street address (e.g., "123 Main St, City, State")');
      return;
    }
    if (!salary || !role) {
      toast({
        title: 'Missing information',
        description: 'Please fill in salary and role first',
        variant: 'destructive'
      });
      return;
    }
    setIsCreatingBusiness(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));

      // Set the full address as both location and fullLocation
      setLocation(address);
      setFullLocation(address);
      setShowNewBusinessForm(false);
      setNewBusinessAddress('');
      setAddressError('');
      
      setTimeout(() => checkForCompletion(), 100);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create business. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsCreatingBusiness(false);
    }
  };
  return <div className="absolute inset-0 z-50 flex items-center justify-center">
      <div className="app-card flex flex-col justify-center px-8 py-12">
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-app-black mb-6 font-normal text-lg">
              {/* Full text for larger screens, condensed for smaller screens */}
              <span>
                Join the Community! 
              </span>
            </h1>
          </div>
        
          {/* Business (Location) */}
          <div>
            <BusinessSearchDropdown value={location} onChange={handleLocationChange} onBlur={handleLocationBlur} placeholder="Where do you work?..." className="app-input" salary={salary} role={role} timePeriod={timePeriod} />
          </div>
        
          <div className="text-center">
            <p className="text-app-black mb-4 text-lg">
              {/* Full text for larger screens, condensed for smaller screens */}
              <span>Answers Kept Anonymous 🤐</span>
            </p>
          </div>
        
          {/* Role */}
          <div>
            <JobSearchDropdown value={role} onChange={handleRoleChange} onBlur={checkForCompletion} placeholder="Share your job!..." className="app-input" />
          </div>
        
          <div className="text-center">
            <p className="text-app-black mb-4 text-lg font-normal">
              {/* Full text for larger screens, condensed for smaller screens */}
              <span>Make A Difference! ❤️</span>
            </p>
          </div>
        
          {/* Salary + Time Period */}
          <div>
            <div className="flex items-center space-x-3">
              <input type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={salary} onChange={handleSalaryChange} onBlur={checkForCompletion} placeholder="Pay Est. ($)" className="app-input text-left text-lg flex-1 !py-0 h-12" />
              <select value={timePeriod} onChange={e => setTimePeriod(e.target.value)} className="app-input text-lg w-auto !py-0 h-12">
                <option value="HR">HR</option>
                <option value="MO">MO</option>
                <option value="YR">YR</option>
              </select>
            </div>
          </div>
        
          <div className="text-center mt-8">
            <p className="text-app-black text-lg">
              {/* Full text for larger screens, condensed for smaller screens */}
              <span className="hidden sm:inline">
                Don't worry, your boss won't find out 😉
              </span>
              <span className="sm:hidden">
                Don't worry! 😉
                <br />
                Your boss won't find out
              </span>
            </p>
          </div>
        
          {/* New Business Form */}
          {showNewBusinessForm && <div className="space-y-4 mt-6">
              <div>
                <input type="text" value={newBusinessAddress} onChange={handleAddressChange} placeholder="Enter business address (e.g., 123 Main St, City, State)..." className={`app-input ${addressError ? 'border-red-500 border-2' : ''}`} />
                {addressError && <p className="text-red-500 text-sm mt-1 px-1">{addressError}</p>}
                <p className="text-gray-500 text-xs mt-1 px-1">
                  Please include street number, street name, and street type (e.g., St, Ave, Rd)
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <button onClick={validateAndCreateBusiness} disabled={isCreatingBusiness} className="app-input flex-1 bg-app-yellow text-app-black font-medium">
                  {isCreatingBusiness ? 'Adding Business...' : 'Add New Business'}
                </button>
                <button onClick={() => {
              setShowNewBusinessForm(false);
              setNewBusinessAddress('');
              setAddressError('');
              setLocation('');
            }} className="app-input w-auto px-6 bg-gray-100 text-app-gray-dark">
                  Cancel
                </button>
              </div>
            </div>}
        </div>
      </div>
    </div>;
};
export default InitiationPage;