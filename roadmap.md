## Corrección de Errores Críticos (Desincronización de Datos)

### 1. Estandarización de Claves (Keys) en la Creación de Chats
**Objetivo:** Asegurar que los datos que se envían a la base de datos usen la misma nomenclatura (snake_case o camelCase) que espera leer el Frontend para evitar datos nulos.
* **Archivo principal a modificar:** `functions/src/chats/getOrCreateChat.ts`.
* **Instrucciones:**
  1. En el objeto `chatData`, cambiar la clave `postTitle` por `post_title` para que coincida con el modelo en Flutter.
  2. Verificar que `postImageUrl` intente leer todas las posibles variantes del modelo de post (ej: `post?.imageUrl || post?.image_url || post?.photoUrl || null`).
  3. Mantener el uso estricto de `"SYSTEM_MSG_CHAT_STARTED"`.