# Reglas de Firebase Storage

Documento alineado con `storage/rules/storage.rules`.

## Politica general

- El limite de subida es 5 MB.
- Las reglas aceptan cualquier `contentType` que cumpla `image/.*` y tambien `application/octet-stream`.
- La lectura de imagenes de posts y perfil es publica (`allow read: if true`).
- Las imagenes de chat solo se leen con usuario autenticado.
- La version optimizada `users/{userId}/profile_image.webp` no puede escribirse desde cliente.

## Rutas

### `/posts/{postId}/{imageName}`

| Operacion | Regla |
| :--- | :--- |
| Read | Publica. |
| Create / update | Usuario autenticado, archivo menor de 5 MB y tipo `image/.*` o `application/octet-stream`. |
| Delete | Usuario autenticado. |

La autoria final del post y la consistencia con RTDB se controlan fuera de Storage. El cliente actual sube imagenes de post ya comprimidas como WebP; el trigger `onImageUploaded` extrae etiquetas Vision y actualiza `vision_labels`.

### `/users/{userId}/profile_image`

| Operacion | Regla |
| :--- | :--- |
| Read | Publica. |
| Write | Usuario autenticado cuyo `uid` coincide con `userId`, archivo menor de 5 MB y tipo `image/.*` o `application/octet-stream`. |

### `/users/{userId}/profile_image.webp`

| Operacion | Regla |
| :--- | :--- |
| Read | Publica. |
| Write | Bloqueada para cliente. Solo Admin SDK / Cloud Functions puede escribirla. |

### `/chats/{chatId}/{imageId}`

| Operacion | Regla |
| :--- | :--- |
| Read | Usuario autenticado. |
| Write | Usuario autenticado, archivo menor de 5 MB y tipo `image/.*` o `application/octet-stream`. |

Firebase Storage Rules no puede consultar Realtime Database directamente; por eso la pertenencia real al chat se valida en las capas de aplicacion/backend, no en esta regla.

## Consideraciones para clientes

- Comprimir antes de subir para respetar el limite de 5 MB.
- En posts, mantener `imageUrl` / `postImageUrl` en RTDB sincronizados con la URL descargable.
- En perfil, subir a `users/{uid}/profile_image` o ruta compatible con los triggers de perfil.
