# Reglas de Firebase Realtime Database

Documento alineado con `database/rules/database.rules.json`.

## Politica general

Las reglas se aplican por nodo. Las lecturas/escrituras criticas de posts, chats, mensajes y vistas requieren usuario autenticado y, en varios casos, `auth.token.email_verified === true`. Los perfiles de usuario se leen y escriben por el propio usuario aunque el email no se verifique aun, para soportar registro y aceptacion legal.

## Centros: `/centers`

- Lectura: cualquier usuario autenticado.
- Escritura: usuarios cuyo perfil tenga `role === "admin"`.
- Validacion: el centro debe incluir `id`, `name`, `email_domains`, `boundary_coords`, `location` e `is_active`; `location.lat` y `location.lng` deben ser numeros.
- Indice: `.indexOn: ["is_active"]`.

## Usuarios: `/users/{uid}`

- Lectura/escritura: solo el propio usuario (`auth.uid === uid`).
- Validacion base: requiere `id`, `center_id`, `role`, `email`, `name`; `id` debe coincidir con `{uid}`.
- `role`: solo puede ser `student` al crear desde cliente y no puede cambiarse despues.
- `center_id`: debe existir en `/centers`.
- `photoUrl`: opcional string.
- `settings`: el propio usuario puede leer/escribir. Las reglas validan explicitamente `language`, `theme`, `notificationsEnabled`, `pushNotificationsEnabled`, `push_notifications` y `dark_mode`; no hay `$other` que bloquee claves adicionales como `themeMode` o `isDarkMode`.
- `preferredLanguage`: `es`, `en` o `ca`.
- `notifications`: lectura/escritura del propio usuario, con indice por `read`.
- `legal`: `termsAccepted`, `privacyAccepted`, `acceptedAt`.
- `acceptedTermsVersion`: opcional, formato semver `x.y.z`.

## Posts: `/posts/{post_id}`

- Lectura: usuarios autenticados con email verificado.
- Escritura: usuarios autenticados con email verificado; al crear, cualquier usuario verificado puede escribir; al actualizar, el `user_id` existente debe coincidir con `auth.uid`.
- Validacion base: requiere `id`, `user_id`, `center_id`, `type`, `title`, `category`, `status`, `coords`, `created_at`, `updated_at`, `is_deleted`.
- `id` debe coincidir con `{post_id}`.
- `updated_at` debe ser `now`.
- `coords` debe incluir `lat`, `lng`, `geohash`.
- Categorias validas: `accessories`, `clothes`, `devices`, `wallets`, `keys`, `bags`, `study`, `others`.
- Tipos validos: `lost`, `found`.
- Estados validos: `active`, `matched`, `returned`, `rejected`.
- Indices: `center_id`, `type`, `status`, `category`, `user_id`, `created_at`, `coords/geohash`.

## Indice de activos: `/active_posts`

- Lectura: usuarios autenticados.
- Escritura: no se concede al cliente, por defecto queda denegada.
- Estructuras soportadas por codigo:
  - `/active_posts/{center_id}/{post_id}`
  - `/active_posts/{center_id}/{type}/{post_id}`

Los triggers `onPostCreated`, `onPostUpdated` y `onPostDeleted` mantienen este indice.

## Visualizaciones: `/post_views/{post_id}/{user_id}`

- Escritura: el usuario verificado puede registrar su propia vista si el post existe y no es el autor.
- Lectura: el propio viewer o el propietario del post.
- Validacion: objeto con `timestamp` numerico menor o igual que `now`.

## Chats: `/chats/{chat_id}`

- Lectura: miembros del chat con email verificado.
- Escritura: miembros del chat con email verificado; se permite crear si el nuevo `members` contiene al usuario autenticado.
- Validacion base: `id`, `center_id`, `post_id`, `members`, `created_at`; `created_at` numerico.
- Indices: `center_id`, `post_id`.

## Mensajes: `/messages/{chat_id}/{message_id}`

- Lectura: miembros del chat con email verificado.
- Escritura: miembros del chat con email verificado, append-only (`!data.exists()`).
- Validacion: `id`, `sender_id`, `timestamp`; `sender_id` debe ser `auth.uid`.
- Soporta `messageType` opcional `text` o `image`.
- Si `messageType == "image"`, requiere `imageUrl`; en caso contrario requiere `text`.

## Indice de chats de usuario: `/user_chats/{user_id}`

- Lectura: solo el propio usuario.
- Escritura: bloqueada para cliente. La mantiene backend.
