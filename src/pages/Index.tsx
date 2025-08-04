import MobileApp from '../components/MobileApp';
import { ProtectedRoute } from '../components/ProtectedRoute';

const Index = () => {
  return (
    <ProtectedRoute>
      <MobileApp />
    </ProtectedRoute>
  );
};

export default Index;
