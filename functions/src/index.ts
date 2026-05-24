/**
 * Punto de entrada principal y registro global de Firebase Cloud Functions del Backend de Uni Lost & Found (ULF).
 * 
 * Este archivo expone y exporta modularmente todas las funciones Callable HTTPS y Triggers reactivos (de Realtime Database, 
 * Storage y Programador) que componen la lógica de negocio y seguridad del sistema:
 * 
 * 1. Autenticación (`auth`):
 *    - `secureUniversityRegistration`: Registro seguro de cuentas validadas por dominio institucional con rollback atómico.
 * 
 * 2. Publicaciones (`posts`):
 *    - `createPostReport`: Creación y validación (Zero Trust + Geofencing) de reportes de objetos.
 *    - `onPostCreated`, `onPostUpdated`, `onPostDeleted`: Triggers reactivos en base de datos para sincronizar índices activos,
 *      realizar traducción asíncrona y ejecutar Smart Matcher.
 *    - `updatePostStatus`: Modificación segura del estado del post (propio autor).
 *    - `recordPostView`: Auditoría estructurada de lecturas/visualizaciones de posts.
 * 
 * 3. Búsqueda y Feed (`feed`):
 *    - `getFilteredFeed`: Escaneo geoespacial (GeoFire) y filtrado semántico local con traducción automática de búsquedas.
 * 
 * 4. Emparejamiento (`matcher`):
 *    - `checkPotentialMatches`: Coincidencia inteligente inversa sobre posts antiguos compatible por categoría y descripción.
 * 
 * 5. Mantenimiento programado (`maintenance`):
 *    - `purgeUnverifiedAccounts`: Scheduled function diaria para depurar cuentas registradas no verificadas que expiren en 48 horas.
 * 
 * 6. Notificaciones Push (`notifications`):
 *    - `saveFcmToken`: Callable seguro para asociar tokens de mensajería push FCM al perfil del usuario.
 * 
 * 7. Mensajería y Chats (`chats`):
 *    - `onMessageCreated`: Trigger reactivo en base de datos para propagar notificaciones localizadas a destinatarios y gestionar contadores de chats.
 *    - `getOrCreateChat`: Creación atómica o resolución de chats existentes desnormalizando la información necesaria para el feed de chats.
 * 
 * 8. Almacenamiento y Archivos (`storage`):
 *    - `onImageUploaded`: Trigger de Storage para la optimización de imágenes (WebP, Sharp, Caché agresiva) y detección de etiquetas visuales (Vision API).
 * 
 * 9. Perfiles de usuario (`users`):
 *    - `onUserProfileUpdated`: Trigger reactivo para propagar cambios de nombre e imagen de avatar en chats activos desnormalizados.
 */

export { secureUniversityRegistration } from "./auth/secureUniversityRegistration";
export { createPostReport } from "./posts/createPostReport";
export { onPostCreated, onPostUpdated, onPostDeleted } from "./posts/postTriggers";
export { updatePostStatus } from "./posts/updatePostStatus";
export { updatePost } from "./posts/updatePost";
export { recordPostView } from "./posts/recordPostView";
export { getFilteredFeed } from "./feed/getFilteredFeed";
export { checkPotentialMatches } from "./matcher/checkPotentialMatches";
export { purgeUnverifiedAccounts } from "./maintenance/purgeUnverifiedAccounts";
export { cleanScheduledDeletions } from "./maintenance/cleanScheduledDeletions";
export { backfillTermsVersion } from "./maintenance/backfillTermsVersion";
export { saveFcmToken } from "./notifications/saveFcmToken";
export { markNotificationsRead } from "./notifications/markNotificationsRead";
export { onMessageCreated } from "./chats/onMessageCreated";
export { getOrCreateChat } from "./chats/getOrCreateChat";
export { onImageUploaded } from "./storage/onImageUploaded";
export { onProfileImageUploaded } from "./storage/onProfileImageUploaded";
export { onUserProfileUpdated } from "./users/onUserProfileUpdated";

