-- Disposable local PostgreSQL fixture only. Needs two synthetic auth.users rows.
-- Use with psql after barriletes_daily.sql. No changes to the historical table.
BEGIN;
INSERT INTO barriletes_private.allowed_users VALUES
  ('10000000-0000-4000-a000-000000000001');
SET LOCAL ROLE anon;
DO $test$
BEGIN
  BEGIN
    PERFORM public.read_barriletes_week('2026-11-16');
    RAISE EXCEPTION 'Anonymous read unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.put_barrilete_day('2026-11-16',1,1);
    RAISE EXCEPTION 'Anonymous save unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$test$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '10000000-0000-4000-a000-000000000001';
DO $test$
BEGIN
  IF public.put_barrilete_day('2026-11-16',3,1) IS DISTINCT FROM '{"day":"2026-11-16","long":3,"short":1}'::jsonb THEN
    RAISE EXCEPTION 'Bad insertion';
  END IF;
  PERFORM public.put_barrilete_day('2026-11-17',0,2);
  PERFORM public.put_barrilete_day('2026-11-16',0,0);
  IF (SELECT count(*) FROM public.read_barriletes_week('2026-11-16')) <> 2
     OR (SELECT long_count + short_count FROM public.barriletes_daily WHERE day='2026-11-16') IS DISTINCT FROM 0::bigint
     OR (SELECT short_count FROM public.barriletes_daily WHERE day='2026-11-17') IS DISTINCT FROM 2::bigint THEN
    RAISE EXCEPTION 'Lost date or explicit zero';
  END IF;
  BEGIN
    INSERT INTO public.barriletes_daily(owner_uid,day,long_count,short_count)
      VALUES ('10000000-0000-4000-a000-000000000002','2026-11-18',1,0);
    RAISE EXCEPTION 'Changing ownership unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.put_barrilete_day('2026-11-16',-1,0);
    RAISE EXCEPTION 'Negative count unexpectedly allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
END;
$test$;
SET LOCAL "request.jwt.claim.sub" = '10000000-0000-4000-a000-000000000002';
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.barriletes_daily) THEN RAISE EXCEPTION 'Another account can read table'; END IF;
  BEGIN
    PERFORM public.read_barriletes_week('2026-11-16');
    RAISE EXCEPTION 'Another account can read RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.put_barrilete_day('2026-11-16',1,0);
    RAISE EXCEPTION 'Another account can save';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$test$;
ROLLBACK;
