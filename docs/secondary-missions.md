# Misiones secundarias

La bandeja está en el panel de herramientas; en móvil abre «Panel, metas y actividades».
Pega una acción por línea. Importar suma acciones y omite duplicados activos, comparando
minúsculas, espacios y prefijos sencillos. Completadas y canceladas permiten crear otra
acción con el mismo texto.

## Datos y calendario

La clave JSON `secondaryMissions` reutiliza la tabla key/value `cronograma`.
No requiere cambios de esquema. Cada misión guarda ID, texto normalizado, creación,
estado, semana/fecha/evento vinculado, fecha real de completado o cancelación,
`weeksCarried`, `carryWeek` e `history` por lunes de semana (`YYYY-MM-DD`).
Cada registro histórico conserva texto, resultado y, si se programó, fecha, hora e ID de evento.
Las tarjetas tienen `secondaryMissionId` y duran una hora (dos bloques de 30 minutos).

«Organizar semana» añade pendientes después de organizar las actividades existentes.
«Programar esta semana» añade solo la acción elegida. El sorteo se hace primero entre
días elegibles y después entre sus huecos, con preferencia por días sin otra misión.
Al repetir día intenta dejar tres horas libres entre misiones; si no hay alternativa,
usa otro bloque sin conflictos. Respeta el rango visible, el momento actual y los buffers fijos.
La programación manual reutiliza el editor y valida disponibilidad.

Completar, desmarcar, editar, reprogramar o arrastrar actualiza el mismo vínculo.
Borrar una tarjeta pendiente devuelve su misión a la bandeja. Cancelar conserva su
historia y retira sus tarjetas actuales/futuras. Las completadas salen del flujo activo.
Las tarjetas cuentan para progreso y estrellas con la lógica existente.
La recompensa especial «ACCIÓN COMPLETADA» respeta la configuración de animaciones.

## Rollover e historial

El rollover se ejecuta al cargar la app y cada minuto mientras está abierta.
Si estuvo cerrada varias semanas, reconstruye los pasos pendientes al volver a cargar.
Cada semana terminada queda «No cumplida» y aumenta `weeksCarried` una sola vez.
La misión conserva su ID y vuelve a pendiente cuando caduca su programación.
Las tarjetas antiguas se conservan como referencia y no permiten completar ni mover
misiones archivadas. El historial de acciones en Resumen de progreso usa la navegación
semanal existente. Completar una misión más tarde no cambia los resultados anteriores.

## Verificación

```sh
node --check app.js
node --test tests/secondary-missions.test.cjs
git diff --check
```

La persistencia serializa las escrituras en la misma pestaña y comunica errores de Supabase.
Los datos se cargan de Supabase al abrir la app en otro dispositivo. Como el sistema actual,
no incluye sincronización en vivo ni resolución de ediciones simultáneas entre dispositivos.
Eventos y misiones usan dos claves y no constituyen una transacción de base de datos.
