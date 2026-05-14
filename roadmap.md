## Corrección de Errores: Post-Optimización de Imágenes y Chats

### 1. Solución Error 403 (Permission Denied) en Firebase Storage
**Objetivo:** Permitir la subida de imágenes desde el cliente solucionando el rechazo por reglas de seguridad.
* **Archivo principal a modificar:** `storage/rules/storage.rules`.
* **Instrucciones:**
  1. Revisar las reglas de escritura (`allow write`) para la ruta donde el Frontend sube las imágenes de las publicaciones (ej. `match /posts/{userId}/{imageId}` o similar).
  2. Asegurar que la regla permite la subida si el usuario está autenticado (`request.auth != null`).
  3. Comprobar si existe alguna restricción de tipo MIME (`request.resource.contentType.matches(...)`). Si la hay, asegurarse de que permite subir los formatos originales que envía el cliente (jpeg, png) antes de que la Cloud Function los convierta a WebP.
  4. Desplegar las reglas actualizadas en el emulador local o entorno de pruebas para validar.

### 2. Sincronización de Metadatos en Chats (Fotos y Nombres)
**Objetivo:** Garantizar que el documento del chat contenga la información necesaria (desnormalizada) para que el Frontend la muestre sin hacer consultas extra.
* **Archivo principal a modificar:** `functions/src/chats/getOrCreateChat.ts`.
* **Instrucciones:**
  1. Al crear el documento en la colección `chats`, extraer y guardar explícitamente: `postImageUrl`, `postTitle`, y la información básica de ambos participantes (por ejemplo, un mapa `usersInfo` que contenga el `displayName` y `photoUrl` indexado por el UID de cada usuario).
  2. Validar que si el post no tiene imagen, el campo `postImageUrl` se guarde como `null` explícito en lugar de omitirse o fallar.

### 3. Emisión Estricta de Constante de Internacionalización
**Objetivo:** Asegurar que el backend no envíe texto traducido por defecto al iniciar un chat.
* **Archivo principal a modificar:** `functions/src/chats/getOrCreateChat.ts`.
* **Instrucciones:**
  1. Buscar dónde se inicializa el primer mensaje o el campo `lastMessage`.
  2. Forzar que el valor sea exactamente la cadena `"SYSTEM_MSG_CHAT_STARTED"` (sin espacios extra ni variaciones). El backend no debe traducir esto, solo emitir la constante.