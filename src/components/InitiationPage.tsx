import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface InitiationPageProps {
  onComplete: (data: { salary: string; role: string; location: string }) => void;
}

const InitiationPage: React.FC<InitiationPageProps> = ({ onComplete }) => {
  const [salary, setSalary] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  const handleSalaryChange = (value: string) => {
    // Auto-add $ if not included
    const cleanValue = value.replace('$', '');
    setSalary(cleanValue ? `$${cleanValue}` : '');
  };

  const handleFieldBlur = () => {
    // Check if all fields are filled
    const allFilled = salary.trim() !== '' && role.trim() !== '' && location.trim() !== '';
    
    if (allFilled && !isComplete) {
      setIsComplete(true);
      setTimeout(() => {
        onComplete({ salary, role, location });
      }, 300);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: isComplete ? 0 : 1, y: isComplete ? -100 : 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-white"
    >
      <div className="app-card flex flex-col justify-center px-8 py-12">
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-lg font-medium text-app-black mb-6">
              Real Info. Real Fast.
            </h1>
          </div>

          <div className="space-y-6">
            <div>
              <input
                type="text"
                value={salary}
                onChange={(e) => handleSalaryChange(e.target.value)}
                onBlur={handleFieldBlur}
                placeholder="$14"
                className="app-input text-center text-lg"
              />
              <div className="text-center mt-2">
                <span className="text-sm text-app-gray-medium">HR</span>
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm text-app-black mb-4">3 Easy Questions.</p>
            </div>

            <div>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                onBlur={handleFieldBlur}
                placeholder="Barista"
                className="app-input"
              />
            </div>

            <div className="text-center">
              <p className="text-sm text-app-black mb-4">Understand Neighborhood Income Trends.</p>
            </div>

            <div>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onBlur={handleFieldBlur}
                placeholder="Browse Businesses..."
                className="app-input"
              />
            </div>

            <div className="text-center mt-8">
              <p className="text-sm text-app-black">Grow Your Community.</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default InitiationPage;