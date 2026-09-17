-- Fix blog_comments RLS: prevent impersonation
-- The original insert policy only checked auth.role() = 'authenticated'
-- without verifying author_id = auth.uid(), allowing any user to post
-- comments as anyone.

-- Drop the insecure insert policy
DROP POLICY IF EXISTS "Authenticated users can insert blog comments" ON public.blog_comments;

-- Create secure insert policy: users can only insert comments as themselves
CREATE POLICY "Authenticated users can insert blog comments as themselves"
  ON public.blog_comments FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = author_id);
