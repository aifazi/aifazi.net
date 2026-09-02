-- Blog comments table
-- Supports public read, authenticated write, with author profile resolution

create table if not exists public.blog_comments (
  id uuid default gen_random_uuid() primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null default 'Anonymous',
  content text not null,
  created_at timestamptz default now() not null
);

-- Indexes
create index if not exists idx_blog_comments_post_id on public.blog_comments(post_id);
create index if not exists idx_blog_comments_created_at on public.blog_comments(created_at);

-- RLS: public can read, authenticated can insert their own, admins/mods can delete
alter table public.blog_comments enable row level security;

-- Public read access
DO $$ BEGIN
  create policy "Blog comments are viewable by everyone"
    on public.blog_comments for select
    using (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Authenticated users can insert comments
DO $$ BEGIN
  create policy "Authenticated users can insert blog comments"
    on public.blog_comments for insert
    with check (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can update their own comments
DO $$ BEGIN
  create policy "Users can update their own blog comments"
    on public.blog_comments for update
    using (auth.uid() = author_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can delete their own comments, admins/mods can delete any
DO $$ BEGIN
  create policy "Users can delete their own blog comments"
    on public.blog_comments for delete
    using (auth.uid() = author_id or exists (
      select 1 from public.users
      where id = auth.uid() and role in ('admin', 'moderator')
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
