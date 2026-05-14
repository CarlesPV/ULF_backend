## Tareas Pendientes (Ejecución para Agente IA)

### 1. Optimización de Imágenes de Publicaciones (Recorte y WebP)
**Objetivo:** Replicar el comportamiento de las imágenes de perfil para las imágenes de los posts, ahorrando espacio en Storage y mejorando los tiempos de carga en el cliente.
* **Archivo principal a modificar:** `functions/src/storage/onImageUploaded.ts` (o crear un nuevo trigger `onPostImageUploaded.ts` si están separados).
* **Instrucciones:**
  1. Detectar cuando se sube una nueva imagen a la ruta de Storage correspondiente a las publicaciones (ej. `posts/{postId}/{imageId}`).
  2. Utilizar la librería `sharp` (ya presente en el proyecto) para redimensionar la imagen a un tamaño óptimo para feeds (ej. max 1080x1080, manteniendo aspect ratio) y convertir el formato a `.webp`.
  3. Subir la imagen optimizada y **eliminar** el archivo original pesado.
  4. Actualizar el documento correspondiente en Firestore (`/posts/{postId}`) con la nueva URL de descarga del archivo `.webp`.
  5. **Testing:** Escribir pruebas unitarias en `functions/test/` simulando la subida de una imagen pesada (.jpg/.png) y verificando la conversión y actualización en Firestore.

### 2. Soporte para Metadatos en Chats (Imagen del Producto)
**Objetivo:** Facilitar al Frontend la visualización de la imagen del producto en la vista de chats sin necesidad de hacer lecturas extra complejas.
* **Archivo principal a modificar:** `functions/src/chats/getOrCreateChat.ts` y posiblemente `functions/src/posts/postTriggers.ts`.
* **Instrucciones:**
  1. Al crear un nuevo chat, asegurar que en los metadatos del documento de la conversación (colección `chats`) se guarde la referencia de la imagen principal del post (`postImageUrl`) y el título del post.
  2. Si el post se actualiza, evaluar si es necesario actualizar esta referencia (opcional, pero recomendable para consistencia).

### 3. Internacionalización (i18n) del Estado de "Conversación Iniciada"
**Objetivo:** Evitar que el backend inyecte strings "hardcodeados" en un idioma específico, permitiendo que el Frontend lo traduzca.
* **Archivo principal a modificar:** `functions/src/chats/getOrCreateChat.ts`.
* **Instrucciones:**
  1. Identificar dónde se inicializa el campo `lastMessage` (o equivalente) al crear la conversación.
  2. Reemplazar el texto estático `"Conversación Iniciada"` por un código clave constante, como `"SYSTEM_MSG_CHAT_STARTED"`, o dejar el campo nulo/vacío si no hay un mensaje real del usuario.
  3. Asegurar que las reglas de Firestore (`database/rules/`) sigan permitiendo la lectura/escritura de este nuevo formato.