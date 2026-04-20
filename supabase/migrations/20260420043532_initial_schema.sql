
/*
  # Initial Schema Setup for QuirkoSphere

  ## Summary
  Sets up the full database schema for the QuirkoSphere social media management app.

  ## New Tables
  1. `profiles` - User profile data (name, bio, avatar, onboarding status)
  2. `social_accounts` - Connected social media accounts (Facebook, Instagram, LinkedIn)
  3. `posts` - Social media posts with scheduling and status tracking
  4. `ai_chats` - AI agent conversation history
  5. `analytics` - Post performance metrics per platform
  6. `contact_submissions` - User contact form submissions
  7. `live_activity` - Real-time activity feed events

  ## Security
  - RLS enabled on all tables
  - Policies restrict all access to authenticated users owning the data
  - No public access except via storage buckets

  ## Storage
  - `avatars` bucket (public read, authenticated user write)
  - `posts` bucket (public read, authenticated user write)
*/

-- 1. Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name text,
  email text,
  bio text,
  avatar_url text,
  has_seen_onboarding boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2. Social Accounts
CREATE TABLE IF NOT EXISTS social_accounts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  platform text NOT NULL CHECK (platform IN ('facebook', 'instagram', 'linkedin')),
  access_token text NOT NULL,
  refresh_token text,
  expiry_date timestamptz,
  account_id text NOT NULL,
  account_name text NOT NULL,
  account_image text,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, platform)
);

ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own social accounts"
  ON social_accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own social accounts"
  ON social_accounts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own social accounts"
  ON social_accounts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own social accounts"
  ON social_accounts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Posts
CREATE TABLE IF NOT EXISTS posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  media_url text,
  status text NOT NULL CHECK (status IN ('draft', 'ready', 'scheduled', 'published', 'failed', 'error')),
  scheduled_time timestamptz,
  platforms text[] NOT NULL DEFAULT '{}',
  error_message text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own posts"
  ON posts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own posts"
  ON posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own posts"
  ON posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own posts"
  ON posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. AI Chats
CREATE TABLE IF NOT EXISTS ai_chats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  agent_type text NOT NULL CHECK (agent_type IN ('content', 'publishing', 'scheduling', 'competitor', 'analytics')),
  session_id uuid DEFAULT gen_random_uuid(),
  prompt text NOT NULL,
  response text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE ai_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own chats"
  ON ai_chats FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chats"
  ON ai_chats FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chats"
  ON ai_chats FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 5. Analytics
CREATE TABLE IF NOT EXISTS analytics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES posts ON DELETE CASCADE NOT NULL,
  platform text NOT NULL,
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  reach integer DEFAULT 0,
  impressions integer DEFAULT 0,
  platform_post_id text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view analytics for their own posts"
  ON analytics FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM posts
      WHERE posts.id = analytics.post_id
      AND posts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert analytics for their own posts"
  ON analytics FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM posts
      WHERE posts.id = analytics.post_id
      AND posts.user_id = auth.uid()
    )
  );

-- 6. Contact Submissions
CREATE TABLE IF NOT EXISTS contact_submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own contact submissions"
  ON contact_submissions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own contact submissions"
  ON contact_submissions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 7. Live Activity
CREATE TABLE IF NOT EXISTS live_activity (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  platform text NOT NULL,
  content text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE live_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own live activity"
  ON live_activity FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own live activity"
  ON live_activity FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own live activity"
  ON live_activity FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 8. Storage Buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true), ('posts', 'posts', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for avatars
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    name LIKE (auth.uid()::text || '/%')
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    name LIKE (auth.uid()::text || '/%')
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    name LIKE (auth.uid()::text || '/%')
  );

-- Storage Policies for posts
CREATE POLICY "Post images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'posts');

CREATE POLICY "Users can upload their own post media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'posts' AND
    name LIKE (auth.uid()::text || '/%')
  );

CREATE POLICY "Users can update their own post media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'posts' AND
    name LIKE (auth.uid()::text || '/%')
  );

CREATE POLICY "Users can delete their own post media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'posts' AND
    name LIKE (auth.uid()::text || '/%')
  );
