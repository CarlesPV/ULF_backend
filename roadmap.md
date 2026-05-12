# Roadmap de Desarrollo - Backend (Firebase)

Este documento contiene las instrucciones atómicas para implementar las nuevas funcionalidades y correcciones en la infraestructura de Firebase (Firestore, Functions, Storage).

## 1. Búsqueda extendida en descripciones
**Objetivo:** Permitir que el buscador encuentre coincidencias no solo en el título, sino también en la descripción de los objetos.
* **Paso 1:** Localizar la función responsable de obtener y filtrar el feed (por ejemplo, `functions/src/feed/getFilteredFeed.ts`).
* **Paso 2:** Modificar la lógica de filtrado. Dado que Firestore tiene limitaciones con búsquedas de texto completo nativas, implementar una solución óptima. Si se usa filtrado en memoria dentro de la Cloud Function (tras obtener un lote de documentos) o un campo de tipo `array` con tokens de búsqueda (n-gramas), actualizar el código para incluir el campo `description`.
* **Paso 3:** Asegurar que la función devuelva los resultados combinados y sin duplicados, optimizando el consumo de lecturas de Firestore.
* **Paso 4:** Escribir o actualizar las pruebas unitarias pertinentes en `functions/test/` para validar que la búsqueda en descripciones funciona correctamente.

## 2. Ordenación del feed por recientes
**Objetivo:** El feed principal debe devolver siempre las publicaciones más nuevas primero.
* **Paso 1:** En la función de obtención del feed (`getFilteredFeed.ts` u origen de datos), verificar y asegurar la presencia de la cláusula `.orderBy('createdAt', 'desc')` (o el campo de marca de tiempo equivalente que se esté utilizando).
* **Paso 2:** Si esta consulta requiere un índice compuesto nuevo en Firestore (debido a filtros adicionales como centro o categoría), definir el índice en el archivo `firebase.json` o `firestore.indexes.json` y desplegarlo.
* **Paso 3:** Comprobar que la paginación (si existe) sigue funcionando correctamente con el nuevo orden.

## 3. Subida y compresión de Foto de Perfil
**Objetivo:** Dar soporte seguro a la subida de nuevas fotos de perfil, restringiendo los formatos permitidos y optimizando su tamaño mediante reescalado y conversión a WebP.
* **Paso 1:** Revisar las reglas de Storage (`storage/rules/storage.rules`) para permitir a los usuarios autenticados subir imágenes en la ruta de perfiles (`users/{userId}/profile_image`). Validar el tamaño máximo y **restringir el `contentType` para que solo acepte `image/jpeg` (jpg/jpeg) e `image/png`**.
* **Paso 2:** Adaptar el trigger de Storage (`functions/src/storage/onImageUploaded.ts`) o crear uno específico para perfiles. Al detectar la subida, la Cloud Function debe utilizar una librería de procesamiento de imágenes (como `sharp` o la extensión de Firebase "Resize Images"):
    * **Reescalar** la imagen original para que ocupe menos espacio (ej. máximo 512x512 píxeles).
    * **Convertir** la imagen al formato **WebP** para mantener la calidad reduciendo drásticamente el peso.
    * **Limpieza:** Eliminar la imagen original (`png`/`jpg`) conservando únicamente la versión optimizada en `.webp`.
* **Paso 3:** Asegurar que, una vez finalizada la conversión, el documento del usuario en Firestore (`users/{userId}`) se actualice automáticamente con la nueva URL pública (`photoUrl`) apuntando exclusivamente al archivo `.webp` generado.

## 4. Disponibilidad global de las URLs de las fotos
**Objetivo:** Asegurar que las imágenes viajen correctamente en todas las peticiones (perfil, detalle, feed).
* **Paso 1:** Revisar los modelos de datos en `functions/src/shared/types.ts`.
* **Paso 2:** Asegurarse de que en las consultas para obtener una publicación individual o las publicaciones de un usuario, el array de imágenes o la URL principal no se estén excluyendo u omitiendo en el payload de respuesta.