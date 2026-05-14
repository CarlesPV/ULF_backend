# Reglas de Seguridad - Firebase Storage (ULF)

Este documento detalla las políticas de almacenamiento para imágenes de posts y perfiles de usuario.

## Conceptos Clave
- **Restricción de Tamaño:** Límite global de **5MB** por archivo.
- **Formatos Permitidos:** El cliente puede subir imágenes en formato **JPEG y PNG**.
- **Optimización WebP:** El sistema (vía Cloud Functions o extensiones) convierte las imágenes a **WebP** para optimizar la carga en el dispositivo móvil.
- **Verificación Obligatoria:** Solo usuarios con correo institucional verificado pueden leer o escribir en el storage.

## Estructura de Directorios y Permisos

### 1. Imágenes de Posts (`/posts/{postId}/{imageName}`)
* **Lectura:** Cualquier usuario verificado (incluye originales y .webp).
* **Escritura (Originales):** Cualquier usuario verificado.
    * **Restricciones:** < 5MB, tipo `image/jpeg` o `image/png`.
* **Escritura (Optimizadas):** Bloqueada para clientes. Solo el Backend (Admin SDK) genera las versiones WebP.

### 3. Fotos de Perfil (`/users/{userId}/profile_image`)
* **Lectura:** Cualquier usuario verificado.
* **Escritura:** Solo el dueño del perfil (`request.auth.uid == userId`).
* **Restricciones:** < 5MB, tipo `image/jpeg` o `image/png`.

### 4. Fotos de Perfil Optimizadas (`/users/{userId}/profile_image.webp`)
* **Lectura:** Cualquier usuario verificado.
* **Escritura:** Bloqueada para clientes. Generadas automáticamente por Cloud Functions en formato WebP (512x512).

## Consideraciones para el Frontend (Flutter)
1. **Compresión Local:** Se recomienda comprimir las imágenes en el dispositivo antes de subirlas para asegurar que no superen los 5MB y ahorrar datos al usuario.
2. **Formatos:** La cámara de Flutter suele generar JPEGs; asegúrese de que el `Content-Type` de la cabecera de subida sea correcto.
3. **Caché:** Las imágenes optimizadas en WebP ofrecen un rendimiento superior en la lista de feeds.