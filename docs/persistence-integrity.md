# Integridad de persistencia

## Diagnóstico del 28 de octubre de 2026

La copia de `app.js` publicada en producción configura el mismo servidor Supabase que el repositorio. La consulta GET de diagnóstico falla antes de recibir HTTP: `TypeError: fetch failed`, causa `getaddrinfo ENOTFOUND`. El resolvedor DNS del equipo devuelve «El nombre DNS no existe». La consulta independiente a Google Public DNS devuelve `Status: 3` (`NXDOMAIN`), sin respuestas A. No se ejecutaron escrituras, borrados, consolidaciones ni migraciones contra producción.

No hay respuesta de PostgREST para extraer `code`, `message`, `details` o `hint`. No se puede atribuir el incidente a duplicados, RLS o pérdida de datos con esta evidencia. La causa de la indisponibilidad del dominio requiere comprobar el proyecto en el dashboard de Supabase.

| Key | Cantidad / IDs / igualdad de valores |
| --- | --- |
| events | No verificable: servidor no resoluble |
| cats | No verificable: servidor no resoluble |
| goals | No verificable: servidor no resoluble |
| weeklyMissions | No verificable: servidor no resoluble |
| weeklyGoalTargets | No verificable: servidor no resoluble |
| weeklyStars | No verificable: servidor no resoluble |
| secondaryMissions | No verificable: servidor no resoluble |

No se pudo exportar ninguna fila, verificar el tipo de `id`, las columnas temporales, ni determinar si la planificación anterior llegó a la base. El calendario vacío no demuestra que las actividades se hayan perdido.

## Causas comprobables en el cliente anterior

- Un error de SELECT devolvía defaults y habilitaba `loaded`/`goalsReady`: el vacío podía parecer una carga correcta y originar escrituras de defaults.
- El snapshot automático de objetivos intentaba guardarse tras esa falsa carga. Su fallo generaba el mensaje observado. La razón actual verificable de conectividad es DNS; no se dispone de la respuesta del día del incidente.
- `maybeSingle()` fallaría ante varias filas; la existencia de duplicados reales no está confirmada.
- Había colas independientes de snapshots y misiones, escrituras directas de estrellas y mensajes de éxito capaces de ocultar errores de otras keys. Los eventos se escribían desde más de una ruta; ahora todas comparten el mismo coordinador.
- El debounce de 800 ms podía no ejecutarse si se abandonaba la página antes de tiempo.

## Protección implementada

La carga falla explícitamente ante errores, respuestas inválidas, JSON inválido o duplicados divergentes. Solo una lectura exitosa con cero filas crea defaults válidos. La UI bloquea el calendario y ofrece reintento mientras no haya una carga válida. El coordinador permanece inactivo y rechaza escrituras antes de esa carga.

Los duplicados idénticos se colapsan sin depender del orden. Ante valores diferentes, se bloquea la carga: sin esquema/metadatos verificables sería inseguro inventar una regla de «última fila». La recuperación debe resolver primero el registro canónico con evidencia real.

El guardado consulta todos los IDs, inserta si no hay filas y actualiza **todas** las filas de la misma combinación `user_id,key` si existen varias. Esta compatibilidad temporal converge las copias al mismo valor; no elimina filas. Cada escritura pide IDs de respuesta y solo confirma éxito si recibió todas las filas esperadas; errores o escrituras ocultas por RLS no se presentan como guardado.

El coordinador serializa todas las keys, conserva el último snapshot pendiente por key y vuelve a escribir la versión nueva si llegó durante una petición anterior. Un fallo conserva pendientes y bloquea nuevos intentos hasta pulsar «Reintentar guardado». Solo muestra verde cuando no quedan peticiones ni errores. Se elimina el debounce. El navegador advierte al abandonar con escrituras pendientes. Los cambios fallidos permanecen en memoria: no deben descartarse cerrando la pestaña; no hay sincronización offline duradera.

El bloqueo por key en `saveToDB()` evita INSERTs concurrentes dentro de una instancia. Web Locks amplía esa exclusión a pestañas del mismo origen cuando el navegador lo soporta. **Esto no garantiza exclusión entre dispositivos/orígenes ni evita todas las carreras sin una restricción UNIQUE en la base.** La protección definitiva es la migración revisada y posteriormente UPSERT. Las keys se guardan por separado: no constituyen una transacción atómica entre eventos y misiones.

## Recuperación segura pendiente

1. En Supabase, comprobar disponibilidad/estado del proyecto y su URL real. No cambiar credenciales a ciegas.
2. Ejecutar solo SELECT y exportar las filas completas a un archivo local fuera de Git. Incluir IDs, keys, valores y metadatos temporales que existan.
3. Inspeccionar el esquema real (`id`, `created_at`, `updated_at`, índices y RLS). Agrupar por `user_id,key`; comparar contenido completo, fechas de eventos y cantidad de tarjetas. Un ID mayor o una fecha de evento futura no prueban por sí solos una actualización más reciente.
4. Si hay valores divergentes, conservar todas las versiones y proponer una recuperación por key, especialmente `events`. Presentar la propuesta al usuario antes de consolidar/borrar/modificar producción.
5. Solo tras resolver explícitamente las divergencias, revisar `migrations/001_cronograma_unique_user_key.sql`. Aborta si queda cualquier duplicado; no borra ni consolida. No se ha ejecutado.
6. Con UNIQUE confirmada, migrar el cliente a UPSERT y verificar políticas RLS y respuesta de escritura. Hasta entonces existen limitaciones entre dispositivos.

## Validación

Las pruebas de persistencia simulan errores de SELECT/INSERT/UPDATE, duplicados, carga vacía válida, JSON corrupto, escrituras rápidas y recuperación. Las pruebas funcionales existentes cubren las misiones secundarias, su historial y planificación. Se comprobó en navegador con un adaptador local aislado: carga normal; fallo de red; SELECT fallido y reintento; escritura fallida y reintento; Organizar semana → guardar → recargar; edición de una tarjeta; meta manual; misión secundaria programada; y estrella de día completo conservada después de recargar. No se utiliza la UI de producción para no disparar sus escrituras automáticas.
