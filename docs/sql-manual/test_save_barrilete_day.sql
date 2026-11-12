-- Solo una base de pruebas desechable, tras instalar la propuesta en ella.
-- No ejecutar en producción. Los datos sintéticos se revierten al terminar.
BEGIN ISOLATION LEVEL READ COMMITTED;
DO $test$
DECLARE
  v_user text := 'synthetic_barriletes_' || pg_backend_pid();
  v_seed jsonb;
  v_actual jsonb;
  v_rows integer;
BEGIN
  BEGIN
    PERFORM public.save_barrilete_day(v_user, '2026-11-09', 0, 0);
    RAISE EXCEPTION 'Aceptó guardar sin historial';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  INSERT INTO public.cronograma (user_id,key,value)
    SELECT v_user, k, CASE WHEN k IN ('cats','secondaryMissions') THEN '[]' ELSE '{}' END
      FROM unnest(ARRAY['events','cats','goals','weeklyMissions','weeklyGoalTargets','weeklyStars','secondaryMissions']) AS history(k);

  IF public.save_barrilete_day(v_user, '2026-11-09', 0, 0)
     IS DISTINCT FROM '{"day":"2026-11-09","long":0,"short":0}'::jsonb THEN
    RAISE EXCEPTION 'No confirmó el primer registro';
  END IF;

  SELECT jsonb_object_agg(
    to_char(date '2015-01-01' + n, 'YYYY-MM-DD'),
    jsonb_build_object('long', n % 13, 'short', n % 7)
  ) INTO v_seed FROM generate_series(0,3652) AS series(n);
  UPDATE public.cronograma SET value = v_seed::text
    WHERE user_id = v_user AND key = 'dailyBarriletes';
  PERFORM public.save_barrilete_day(v_user, '2026-11-09', 4, 2);
  PERFORM public.save_barrilete_day(v_user, '2026-11-10', 1, 0);
  PERFORM public.save_barrilete_day(v_user, '2026-11-09', 3, 2);
  SELECT count(*) INTO v_rows FROM public.cronograma
    WHERE user_id = v_user AND key = 'dailyBarriletes';
  SELECT value::jsonb INTO STRICT v_actual FROM public.cronograma
    WHERE user_id = v_user AND key = 'dailyBarriletes';
  IF v_rows <> 1 OR v_actual IS DISTINCT FROM
     (v_seed || '{"2026-11-09":{"long":3,"short":2},"2026-11-10":{"long":1,"short":0}}'::jsonb) THEN
    RAISE EXCEPTION 'Se alteró el historial o se duplicó la fila';
  END IF;

  BEGIN
    PERFORM public.save_barrilete_day(v_user, '2026-11-09', -1, 0);
    RAISE EXCEPTION 'Aceptó una cantidad negativa';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF (SELECT count(*) FROM public.cronograma WHERE user_id = v_user AND key <> 'dailyBarriletes') <> 7
     OR EXISTS (SELECT 1 FROM public.cronograma WHERE user_id = v_user AND key <> 'dailyBarriletes'
         AND value IS DISTINCT FROM CASE WHEN key IN ('cats','secondaryMissions') THEN '[]' ELSE '{}' END) THEN
    RAISE EXCEPTION 'Se alteraron claves históricas';
  END IF;
END;
$test$;
ROLLBACK;
