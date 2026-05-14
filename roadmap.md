## Mejoras en Chats y Corrección de Storage (Backend)

### 1. Identificación Explícita del Publicador en los Chats [COMPLETADO]
**Objetivo:** Proveer al frontend un mecanismo robusto para identificar inequívocamente al dueño del post asociado al chat, permitiendo extraer su nombre y foto de perfil independientemente de quién inicie la conversación.
* **Archivo:** `functions/src/chats/getOrCreateChat.ts`
* **Estado:** Finalizado. Se añadió `post_owner_id` y se mejoró la desnormalización de `usersInfo`.
* **Instrucciones:**
  1. En la construcción del objeto `chatData` (aproximadamente en la línea 36), añade un nuevo campo a nivel de raíz llamado `post_owner_id`.
  2. Asigna a este campo el valor de la variable `postOwnerId` (ej. `post_owner_id: postOwnerId,`).
  3. Asegúrate de que la sección `usersInfo` desnormalice correctamente los campos `displayName` y `photoUrl` tanto para el usuario que inicia (`uid`) como para el creador del post (`postOwnerId`), evitando valores indefinidos.


### 2. Aseguramiento de Reglas de Storage frente a App Check
**Objetivo:** Prevenir bloqueos 403 en subida de imágenes relacionados con reglas restrictivas y verificación de seguridad.
* **Archivo:** `storage/rules/storage.rules`
* **Instrucciones:**
  1. Mantén la validación de seguridad de `request.resource.contentType.matches('image/.*') || request.resource.contentType == 'application/octet-stream'`. La resolución estricta del Content-Type se hará en el Frontend, pero estas reglas aseguran que no se inyecten scripts.
  2. Verifica el panel de Firebase App Check en la consola de Firebase. Si App Check está en modo "Enforcement" (Obligatorio) para Storage, debes documentar la necesidad de generar tokens de depuración (Debug Tokens) para los desarrolladores de Flutter o relajar temporalmente el `enforcement` en entornos locales.