# Roadmap Backend - Uni Lost & Found

Este documento detalla las tareas atómicas que el agente de IA debe implementar en el backend (Firebase) para resolver errores y añadir las nuevas funcinalidades.

## 1. Optimización de Caché en Imágenes de Perfil
**Objetivo:** Evitar descargas constantes de la misma imagen de perfil.
* **Paso 1.1:** Modificar la función `onImageUploaded.ts` (o crear una si no existe para imágenes de perfil) para establecer los metadatos de `Cache-Control` a `public, max-age=31536000` (1 año).
* **Paso 1.2:** Asegurar que cuando el usuario sube una nueva imagen, la URL generada contenga un token único o se agregue un campo `photoUpdatedAt` (Timestamp) en el documento del usuario en la colección `users`, para forzar la invalidación en el cliente solo cuando sea necesario.

## 2. Sincronización de Datos Denormalizados en Chats
**Objetivo:** Actualizar foto y nombre de usuario en conversaciones existentes cuando un usuario edita su perfil.
* **Paso 2.1:** Crear una nueva Cloud Function en `functions/src/users/onUserProfileUpdated.ts`.
* **Paso 2.2:** La función debe ejecutarse con el trigger `onDocumentUpdated('users/{userId}')`.
* **Paso 2.3:** Si detecta cambios en `displayName` o `photoUrl`, debe buscar todos los documentos en la colección `chats` donde el array `participants` contenga el `userId`.
* **Paso 2.4:** Ejecutar un `batch.update()` para actualizar la información de ese participante dentro del mapa o subcolección de participantes de cada chat afectado.

## 3. Configuración de Límites Geográficos de Centros
**Objetivo:** Definir los límites válidos (Bounding Box) de cada centro (ej. UAB) para validación.
* **Paso 3.1:** Modificar el esquema de la base de datos (y `centers.json`) para incluir coordenadas límite en cada documento de la colección `centers`. Añadir `bounds`: `{ latMin: number, latMax: number, lngMin: number, lngMax: number }`.
* **Paso 3.2:** Calcular y establecer los valores de `bounds` para la UAB y otros centros existentes sumando un margen de unos pocos kilómetros a las coordenadas centrales.

## 4. Validación de Ubicación en Publicaciones
**Objetivo:** Asegurar por seguridad que no se puedan crear posts fuera del rango del centro.
* **Paso 4.1:** Modificar `functions/src/posts/postTriggers.ts` (o el endpoint de creación).
* **Paso 4.2:** Antes de confirmar la creación de un post, si contiene coordenadas de ubicación, verificar que estén dentro del rango `bounds` del centro asociado al post/usuario.
* **Paso 4.3:** Si está fuera de rango, lanzar un `functions.https.HttpsError` del tipo `out-of-range` para que el frontend lo capture.