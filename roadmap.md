## Corrección Definitiva: Permisos de Storage y URLs de Imágenes

### 1. Relajar Reglas de Firebase Storage (Error 403 y Lectura de Imágenes)
**Objetivo:** Permitir que Flutter suba archivos sin rechazos por el MIME Type y que las imágenes se puedan leer sin enviar tokens Auth desde la red (requerido para `CachedNetworkImage`).
* **Archivo principal:** `storage/rules/storage.rules`.
* **Instrucciones:**
  1. En las reglas de escritura (`allow write`) para `/posts/{postId}/{imageName}` y `/users/...`, relajar el filtro del tipo de contenido: `request.resource.contentType.matches('image/.*') || request.resource.contentType == 'application/octet-stream'`.
  2. Modificar el permiso de lectura a público. Cambiar `allow read: if isAuthenticated();` por `allow read: if true;` para TODAS las imágenes (perfiles y posts). Esto es crítico para que las URLs manuales del backend se rendericen en el frontend.

### 2. Generar la URL Correcta de Firebase Storage
**Objetivo:** Evitar guardar URLs de `storage.googleapis.com` (privadas) y guardar las URLs compatibles con Firebase (`firebasestorage.googleapis.com`).
* **Archivos principales:** `functions/src/storage/onImageUploaded.ts` (y cualquier función que procese/guarde la imagen de perfil webp).
* **Instrucciones:**
  1. Al guardar la URL de la imagen procesada en Firestore, NO usar la URL pública del bucket directo de GCS.
  2. Generar la URL manualmente usando este formato exacto:
     `const downloadUrl = \`https://firebasestorage.googleapis.com/v0/b/\${bucket.name}/o/\${encodeURIComponent(filePath)}?alt=media\`;`
  3. Guardar este `downloadUrl` en `photoUrl` y `postImageUrl`.