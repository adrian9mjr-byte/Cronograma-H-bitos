-- Propuesta para revisión. Aplicar manualmente solo con autorización y tras
-- verificar esquema, RLS y permisos. No forma parte del despliegue estático.
-- Contrato: public.cronograma.value contiene texto JSON y el ID tiene default.
BEGIN;

CREATE FUNCTION public.save_barrilete_day(
  p_user_id text, p_day text, p_long bigint, p_short bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_old public.cronograma%ROWTYPE;
  v_exists boolean := true;
  v_map jsonb;
  v_record jsonb;
  v_entry record;
  v_kind text;
  v_count numeric;
  v_written jsonb;
BEGIN
  IF p_user_id IS NULL OR p_user_id = '' OR p_day IS NULL
     OR p_day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR p_long IS NULL OR p_short IS NULL
     OR p_long NOT BETWEEN 0 AND 9007199254740991
     OR p_short NOT BETWEEN 0 AND 9007199254740991 THEN
    RAISE EXCEPTION 'Fecha o cantidades inválidas' USING ERRCODE = '22023';
  END IF;
  IF to_char(p_day::date, 'YYYY-MM-DD') <> p_day THEN
    RAISE EXCEPTION 'Fecha inválida' USING ERRCODE = '22023';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'El guardado requiere READ COMMITTED' USING ERRCODE = '25000';
  END IF;

  -- Serializa también la primera escritura cuando aún no existe una fila.
  PERFORM pg_advisory_xact_lock(hashtextextended('cronograma:dailyBarriletes:' || p_user_id, 0));

  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY['events','cats','goals','weeklyMissions','weeklyGoalTargets','weeklyStars','secondaryMissions']) AS required(k)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.cronograma AS c WHERE c.user_id = p_user_id AND c.key = required.k
    )
  ) THEN
    RAISE EXCEPTION 'No se pudo verificar el historial' USING ERRCODE = '22023';
  END IF;

  BEGIN
    SELECT c.* INTO STRICT v_old FROM public.cronograma AS c
      WHERE c.user_id = p_user_id AND c.key = 'dailyBarriletes' FOR UPDATE;
  EXCEPTION
    WHEN no_data_found THEN v_exists := false;
    WHEN too_many_rows THEN
      RAISE EXCEPTION 'Hay versiones duplicadas del registro' USING ERRCODE = '21000';
  END;

  IF v_exists THEN
    v_map := v_old.value::jsonb;
    IF jsonb_typeof(v_map) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Registro de barriletes inválido' USING ERRCODE = '22023';
    END IF;
    FOR v_entry IN SELECT key, value FROM jsonb_each(v_map) LOOP
      IF v_entry.key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         OR jsonb_typeof(v_entry.value) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Día de barriletes inválido' USING ERRCODE = '22023';
      END IF;
      IF to_char(v_entry.key::date, 'YYYY-MM-DD') <> v_entry.key
         OR (v_entry.value - ARRAY['long','short']) <> '{}'::jsonb THEN
        RAISE EXCEPTION 'Día de barriletes inválido' USING ERRCODE = '22023';
      END IF;
      FOREACH v_kind IN ARRAY ARRAY['long','short'] LOOP
        IF jsonb_typeof(v_entry.value -> v_kind) IS DISTINCT FROM 'number' THEN
          RAISE EXCEPTION 'Cantidad histórica inválida' USING ERRCODE = '22023';
        END IF;
        v_count := (v_entry.value ->> v_kind)::numeric;
        IF v_count <> trunc(v_count) OR v_count NOT BETWEEN 0 AND 9007199254740991 THEN
          RAISE EXCEPTION 'Cantidad histórica inválida' USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END LOOP;
  ELSE
    v_map := '{}'::jsonb;
  END IF;

  v_record := jsonb_build_object('long', p_long, 'short', p_short);
  IF v_map -> p_day IS DISTINCT FROM v_record THEN
    v_map := jsonb_set(v_map, ARRAY[p_day], v_record);
    IF v_exists THEN
      UPDATE public.cronograma AS c SET value = v_map::text
        WHERE c.id = v_old.id AND c.user_id = p_user_id AND c.key = 'dailyBarriletes'
        RETURNING c.value::jsonb INTO STRICT v_written;
    ELSE
      INSERT INTO public.cronograma (user_id, key, value)
        VALUES (p_user_id, 'dailyBarriletes', v_map::text)
        RETURNING value::jsonb INTO STRICT v_written;
    END IF;
    IF v_written IS DISTINCT FROM v_map THEN
      RAISE EXCEPTION 'La escritura no confirmó el historial esperado' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN v_record || jsonb_build_object('day', p_day);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_barrilete_day(text,text,bigint,bigint) FROM PUBLIC;
-- La app actual usa acceso anónimo. Antes de conceder EXECUTE verificar que RLS
-- limita ese rol al alcance previsto y permite SELECT/INSERT/UPDATE de la key.
GRANT EXECUTE ON FUNCTION public.save_barrilete_day(text,text,bigint,bigint) TO anon, authenticated;

COMMIT;
