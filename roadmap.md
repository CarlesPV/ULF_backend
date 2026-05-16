## Tareas de Seguridad, Validaciones y Storage (Backend)

Este bloque define las instrucciones para dar soporte al frontend mediante modelos de datos actualizados, reglas de acceso correctas y validaciones preventivas.

### 1. Reglas de Acceso a Storage (Fix Error 403)
**Objetivo:** Permitir que el gestor de caché del frontend (que hace peticiones HTTP estándar sin cabeceras de Firebase Auth) pueda leer las imágenes de perfil y publicaciones.
* **Paso 1.1:** Abre `storage/rules/storage.rules`.
* **Paso 1.2:** En los bloques de `posts/{postId}/{imageName}`, `users/{userId}/profile_image` y la versión `.webp`, cambia la regla de lectura a `allow read: if true;`. Mantén las reglas de escritura (`allow write`) estrictamente autenticadas como están ahora.

### 2. Modelado de Datos para Geocercas
**Objetivo:** Proveer la información geográfica de los centros.
* **Paso 2.1:** Abre `database/seed/data/centers.json`. Añade a los centros (ej. UAB) una nueva propiedad `boundaries` que contenga un array de coordenadas (lat, lng) formando el polígono del recinto.

### 3. Validación de Ubicación No Destructiva
**Objetivo:** Proteger la base de datos de inyecciones fuera de rango sin gastar operaciones de borrado.
* **Paso 3.1:** Abre `functions/src/posts/postTriggers.ts`.
* **Paso 3.2:** En el trigger de creación (`onWrite` u `onCreate`), valida matemáticamente las coordenadas enviadas contra los `boundaries` del centro asociado.
* **Paso 3.3:** Si están fuera de rango, no uses `.delete()`. En su lugar, rechaza la operación lanzando un error HTTP explícito o marcando el documento con `status: "rejected"`.

### 4. Caché de Metadatos en Storage
**Objetivo:** Optimizar la validación de caché del frontend.
* **Paso 4.1:** Abre `functions/src/storage/onImageUploaded.ts`. Al procesar/guardar la imagen optimizada (WebP), establece explícitamente los metadatos de `Cache-Control` en `public, max-age=3600, s-maxage=3600`.