/**
 * SQL for Supabase SQL Editor
 * 
 * Run this in your Supabase SQL Editor to set up your database schema.
 */

-- 1. Users Table (Supabase Auth handles most of this, but we can have a profile table)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  name text,
  email text,
  bio text,
  avatar_url text,
  has_seen_onboarding boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Social Accounts
create table if not exists social_accounts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  platform text not null check (platform in ('facebook', 'instagram', 'linkedin')),
  access_token text not null,
  refresh_token text,
  expiry_date timestamp with time zone,
  account_id text not null,
  account_name text not null,
  account_image text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, platform)
);

-- 3. Posts
create table if not exists posts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  content text not null,
  media_url text,
  status text not null check (status in ('draft', 'ready', 'scheduled', 'published', 'failed', 'error')),
  scheduled_time timestamp with time zone,
  platforms text[] not null,
  error_message text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. AI Chats
create table if not exists ai_chats (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  agent_type text not null check (agent_type in ('content', 'publishing', 'scheduling', 'competitor', 'analytics')),
  session_id uuid default gen_random_uuid(),
  prompt text not null,
  response text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Analytics
create table if not exists analytics (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references posts on delete cascade not null,
  platform text not null,
  likes integer default 0,
  comments integer default 0,
  shares integer default 0,
  reach integer default 0,
  impressions integer default 0,
  platform_post_id text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. Contact Submissions
create table if not exists contact_submissions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade,
  name text not null,
  email text not null,
  message text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS (Row Level Security)
alter table profiles enable row level security;
alter table social_accounts enable row level security;
alter table posts enable row level security;
alter table ai_chats enable row level security;
alter table analytics enable row level security;
alter table contact_submissions enable row level security;

-- Policies
create policy "Users can view their own profile" on profiles for select using (auth.uid() = id);
create policy "Users can insert their own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile" on profiles for update using (auth.uid() = id);

-- Social Accounts Policies
create policy "Users can view their own social accounts" on social_accounts for select using (auth.uid() = user_id);
create policy "Users can insert their own social accounts" on social_accounts for insert with check (auth.uid() = user_id);
create policy "Users can update their own social accounts" on social_accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own social accounts" on social_accounts for delete using (auth.uid() = user_id);

create policy "Users can manage their own posts" on posts for all using (auth.uid() = user_id);
create policy "Users can manage their own chats" on ai_chats for all using (auth.uid() = user_id);
create policy "Users can manage their own contact submissions" on contact_submissions for all using (auth.uid() = user_id);
create policy "Users can view analytics for their own posts" on analytics for select using (
  exists (
    select 1 from posts
    where posts.id = analytics.post_id
    and posts.user_id = auth.uid()
  )
);

-- 8. Live Activity
create table if not exists live_activity (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  type text not null, -- 'like', 'share', 'comment', 'impression'
  platform text not null,
  content text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table live_activity enable row level security;
create policy "Users can manage their own live activity" on live_activity for all using (auth.uid() = user_id);

-- 7. Storage Buckets
insert into storage.buckets (id, name, public) 
values ('avatars', 'avatars', true), ('posts', 'posts', true)
on conflict (id) do nothing;

-- Storage Policies
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using ( bucket_id = 'avatars' );

create policy "Post images are publicly accessible"
  on storage.objects for select
  using ( bucket_id = 'posts' );

create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check ( 
    bucket_id = 'avatars' AND 
    name LIKE (auth.uid()::text || '/%')
  );

create policy "Users can upload their own post media"
  on storage.objects for insert
  with check ( 
    bucket_id = 'posts' AND 
    name LIKE (auth.uid()::text || '/%')
  );

create policy "Users can update their own avatar"
  on storage.objects for update
  using ( 
    bucket_id = 'avatars' AND 
    name LIKE (auth.uid()::text || '/%')
  );

create policy "Users can update their own post media"
  on storage.objects for update
  using ( 
    bucket_id = 'posts' AND 
    name LIKE (auth.uid()::text || '/%')
  );

create policy "Users can delete their own avatar"
  on storage.objects for delete
  using ( 
    bucket_id = 'avatars' AND 
    name LIKE (auth.uid()::text || '/%')
  );

create policy "Users can delete their own post media"
  on storage.objects for delete
  using ( 
    bucket_id = 'posts' AND 
    name LIKE (auth.uid()::text || '/%')
  );
