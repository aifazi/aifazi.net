-- 029_download_increment_rpc.sql
-- Atomic download-count claim for store_downloads.
--
-- The old flow read downloads_used, checked the limit, then wrote downloads_used
-- back — a check-then-act race let parallel requests both pass the limit and
-- both get served. A single UPDATE with a WHERE predicate is atomic, so only
-- one caller wins each unit of quota.

CREATE OR REPLACE FUNCTION public.increment_download_used(p_row_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.store_downloads
     SET downloads_used = downloads_used + 1
   WHERE id = p_row_id
     AND downloads_used < downloads_allowed
  RETURNING downloads_used;
$$;

REVOKE ALL ON FUNCTION public.increment_download_used(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_download_used(uuid) TO service_role;
