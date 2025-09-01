export interface UserData {
  salary: string;
  role: string;
  location: string;
  fullLocation?: string;
  timePeriod: string;
}

export interface Post {
  id: string;
  author: string;
  text: string;
  businessId?: string;
  businessName?: string;
  images?: string[];
  isStory?: boolean;
  isJobUpdate?: boolean;
  linkedLocation?: string;
  upvotes: number;
  downvotes: number;
  userVote?: 'up' | 'down' | null;
  createdAt: Date;
}

export interface SettingsPageProps {
  initialData: UserData;
  userPosts: Post[];
  onStoriesClick: () => void;
  onPostClick: (post: any) => void;
  onJobUpdate: (jobData: {
    salary: string;
    role: string;
    location: string;
    timePeriod: string;
  }) => Promise<void>;
}