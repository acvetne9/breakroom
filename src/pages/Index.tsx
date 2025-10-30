import MobileApp from '../components/MobileApp';
import { PostsProvider } from '../components/PostsProvider';

const Index = () => {
  return (
    <PostsProvider>
      <MobileApp />
    </PostsProvider>
  );
};

export default Index;
