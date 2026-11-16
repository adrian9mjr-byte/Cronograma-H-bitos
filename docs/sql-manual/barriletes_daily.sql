-- Manual: apply only to a dedicated test project, or later with explicit approval.
-- Does not read or alter public.cronograma. Keep barriletes_private out of exposed schemas.
BEGIN;

CREATE SCHEMA barriletes_private;
REVOKE ALL ON SCHEMA barriletes_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA barriletes_private TO authenticated;

CREATE TABLE barriletes_private.allowed_users (
  owner_uid uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE barriletes_private.allowed_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON barriletes_private.allowed_users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON barriletes_private.allowed_users TO authenticated;
CREATE POLICY read_own_allowance ON barriletes_private.allowed_users FOR SELECT TO authenticated
  USING (owner_uid = (SELECT auth.uid()));

CREATE TABLE public.barriletes_daily (
  owner_uid uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  day date NOT NULL CHECK (day BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  long_count bigint NOT NULL CHECK (long_count BETWEEN 0 AND 9007199254740991),
  short_count bigint NOT NULL CHECK (short_count BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY (owner_uid, day)
);
ALTER TABLE public.barriletes_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.barriletes_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT (day, long_count, short_count), UPDATE (long_count, short_count)
  ON public.barriletes_daily TO authenticated;

CREATE POLICY read_own_barriletes ON public.barriletes_daily FOR SELECT TO authenticated
  USING (owner_uid = (SELECT auth.uid()) AND owner_uid IN (SELECT a.owner_uid FROM barriletes_private.allowed_users a));
CREATE POLICY insert_own_barriletes ON public.barriletes_daily FOR INSERT TO authenticated
  WITH CHECK (owner_uid = (SELECT auth.uid()) AND owner_uid IN (SELECT a.owner_uid FROM barriletes_private.allowed_users a));
CREATE POLICY update_own_barriletes ON public.barriletes_daily FOR UPDATE TO authenticated
  USING (owner_uid = (SELECT auth.uid()) AND owner_uid IN (SELECT a.owner_uid FROM barriletes_private.allowed_users a))
  WITH CHECK (owner_uid = (SELECT auth.uid()) AND owner_uid IN (SELECT a.owner_uid FROM barriletes_private.allowed_users a));

CREATE FUNCTION public.read_barriletes_week(p_start date)
RETURNS TABLE (day date, long_count bigint, short_count bigint)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM barriletes_private.allowed_users a WHERE a.owner_uid = (SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Barriletes access denied' USING ERRCODE = '42501';
  END IF;
  IF p_start IS NULL OR p_start NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' THEN
    RAISE EXCEPTION 'Invalid week' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT b.day,b.long_count,b.short_count FROM public.barriletes_daily b
    WHERE b.owner_uid = (SELECT auth.uid()) AND b.day BETWEEN p_start AND p_start+6 ORDER BY b.day;
END;
$body$;

CREATE FUNCTION public.put_barrilete_day(p_day date, p_long bigint, p_short bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $body$
DECLARE saved jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM barriletes_private.allowed_users a WHERE a.owner_uid = (SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Barriletes access denied' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.barriletes_daily AS b (day,long_count,short_count)
    VALUES (p_day,p_long,p_short)
    ON CONFLICT ON CONSTRAINT barriletes_daily_pkey DO UPDATE
      SET long_count=EXCLUDED.long_count,short_count=EXCLUDED.short_count
    RETURNING jsonb_build_object('day',b.day,'long',b.long_count,'short',b.short_count) INTO STRICT saved;
  RETURN saved;
END;
$body$;

REVOKE EXECUTE ON FUNCTION public.read_barriletes_week(date),public.put_barrilete_day(date,bigint,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_barriletes_week(date),public.put_barrilete_day(date,bigint,bigint) TO authenticated;
COMMIT;
