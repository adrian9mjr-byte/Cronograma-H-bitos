-- PREPARADA PARA REVISIÓN; NO EJECUTADA.
-- Requiere export completo y resolución autorizada de duplicados antes de aplicar.
-- No borra ni consolida datos. Verificar esquema, permisos y ventana de mantenimiento.
BEGIN;
LOCK TABLE public.cronograma IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.cronograma
    GROUP BY user_id, key HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existen duplicados: exportar, revisar y resolver con autorización antes de continuar';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cronograma WHERE user_id IS NULL OR key IS NULL) THEN
    RAISE EXCEPTION 'Existen keys/usuarios nulos: revisar antes de continuar';
  END IF;
END $$;
ALTER TABLE public.cronograma
  ADD CONSTRAINT cronograma_user_id_key_unique UNIQUE (user_id, key);
COMMIT;
