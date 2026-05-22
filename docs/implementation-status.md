# Estado de implementacion backend

Fecha de revision: 22 de mayo de 2026.

## Estado actual

| Area | Estado | Evidencia |
| :--- | :--- | :--- |
| Registro seguro | Implementado | `secureUniversityRegistration` valida dominio, centro activo, aceptacion legal e inserta perfil con rollback en Auth. |
| Reglas RTDB | Implementado | `database/rules/database.rules.json` protege centros, usuarios, posts, chats, mensajes, notificaciones y vistas. |
| Reglas Storage | Implementado | `storage/rules/storage.rules` cubre posts, perfiles, `profile_image.webp` y chat images con limite de 5 MB. |
| Feed filtrado | Implementado | `getFilteredFeed` usa `/active_posts/{center_id}/{type}`, filtros en memoria, traduccion de busqueda y orden por fecha/distancia. |
| Matcher | Implementado | `checkPotentialMatches` usa scoring por titulo, descripcion, imagen y fecha sobre posts activos del tipo opuesto. |
| Notificaciones FCM e in-app | Implementado | `shared/notifications.ts`, `saveFcmToken`, `markNotificationsRead`, `onMessageCreated` y notificaciones automaticas desde `onPostCreated`. |
| Chats | Implementado | `getOrCreateChat` crea/reutiliza chats y `onMessageCreated` actualiza metadatos e indices. |
| Perfil | Implementado | `onUserProfileUpdated` propaga `name` y `photoUrl` a chats; triggers de Storage sincronizan URLs de perfil. |
| Imagenes de posts | Implementado parcial | El cliente sube WebP; `onImageUploaded` extrae `vision_labels` para posts. No hay conversion backend de posts a WebP en el codigo actual. |
| Internacionalizacion backend | Implementado | `shared/i18n.ts` y `shared/translate.ts` soportan `es`, `en`, `ca`; `es` es idioma base. |
| Geovallado backend | Implementado | `createPostReport` y `onPostCreated` validan distancia Haversine contra `location` + `radius_meters` + 50 m. |
| Mantenimiento | Implementado | `purgeUnverifiedAccounts` y `backfillTermsVersion`. |
| Tests automatizados | Implementado | 18 suites unitarias / 137 casos declarados y 6 suites de integracion / 21 casos declarados. |

## Matices importantes

- `checkPotentialMatches` devuelve matches, pero no envia notificaciones por si misma. Las alertas automaticas de matches se ejecutan en `onPostCreated`.
- `markNotificationsRead` existe como callable, aunque el frontend actual tambien puede marcar notificaciones escribiendo directamente en `/users/{uid}/notifications`.
- `createPostReport` existe y valida geovallado, pero el frontend actual finaliza publicaciones escribiendo directamente en `/posts`; el trigger `onPostCreated` vuelve a validar ubicacion e indexa.
- Las reglas de Storage permiten lectura publica para posts/perfiles; no exigen email verificado en Storage.

## Siguientes mejoras naturales

- Unificar la publicacion del cliente alrededor de `createPostReport` para concentrar la escritura final en backend.
- Migrar el cliente a `markNotificationsRead` si se quiere evitar escritura directa de la bandeja.
- Decidir si se mantiene la conversion WebP de posts en cliente o se reintroduce optimizacion backend real.
- Revisar validacion de estados en `updatePostStatus`, ya que Admin SDK no aplica reglas de RTDB.
