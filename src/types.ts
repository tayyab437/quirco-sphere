export type Platform = 'facebook' | 'instagram' | 'linkedin';

export interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface SocialAccount {
  id: string;
  user_id: string;
  platform: Platform;
  access_token: string;
  refresh_token?: string;
  expiry_date?: string;
  account_id: string;
  account_name: string;
  account_image?: string;
}

export interface Post {
  id: string;
  user_id: string;
  content: string;
  media_url?: string;
  status: 'draft' | 'ready' | 'scheduled' | 'published' | 'failed' | 'error';
  scheduled_time?: string;
  platforms: Platform[];
  created_at: string;
  error_message?: string;
}

export interface AIChat {
  id: string;
  user_id: string;
  agent_type: 'content' | 'publishing' | 'scheduling' | 'competitor' | 'analytics';
  prompt: string;
  response: string;
  created_at: string;
}

export interface Analytics {
  id: string;
  post_id: string;
  platform: Platform;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
}
