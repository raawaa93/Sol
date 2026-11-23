CREATE TABLE public.volterra_rate_limit_windows (
  client_hash text PRIMARY KEY CHECK (client_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 1),
  updated_at timestamptz NOT NULL
);

CREATE INDEX volterra_rate_limit_windows_updated_at_idx
  ON public.volterra_rate_limit_windows (updated_at);

ALTER TABLE public.volterra_rate_limit_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.volterra_rate_limit_windows FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.volterra_rate_limit_windows TO service_role;

CREATE OR REPLACE FUNCTION public.volterra_check_rate_limit(
  p_client_hash text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_started_at timestamptz;
  v_request_count integer;
BEGIN
  IF p_client_hash IS NULL OR p_client_hash !~ '^[0-9a-f]{64}$'
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 10000
    OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400
  THEN
    RAISE EXCEPTION 'Invalid rate-limit parameters' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.volterra_rate_limit_windows
  WHERE updated_at < v_now - interval '7 days';

  INSERT INTO public.volterra_rate_limit_windows AS current_window (
    client_hash,
    window_started_at,
    request_count,
    updated_at
  )
  VALUES (p_client_hash, v_now, 1, v_now)
  ON CONFLICT (client_hash) DO UPDATE
  SET window_started_at = CASE
        WHEN current_window.window_started_at <= v_now - (p_window_seconds * interval '1 second') THEN v_now
        ELSE current_window.window_started_at
      END,
      request_count = CASE
        WHEN current_window.window_started_at <= v_now - (p_window_seconds * interval '1 second') THEN 1
        ELSE current_window.request_count + 1
      END,
      updated_at = v_now
  RETURNING window_started_at, request_count
  INTO v_started_at, v_request_count;

  RETURN QUERY
  SELECT
    v_request_count <= p_limit,
    GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (v_started_at + (p_window_seconds * interval '1 second') - v_now)))::integer
    );
END;
$$;

REVOKE ALL ON FUNCTION public.volterra_check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.volterra_check_rate_limit(text, integer, integer) TO service_role;
