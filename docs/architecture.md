# Arquitectura backend serverless

Revision: 22 de mayo de 2026.

El backend de ULF se organiza como un proyecto Firebase con Cloud Functions en TypeScript, Realtime Database, Storage, Auth, FCM, Translation API y Vision API.

## Estructura

```text
functions/
├── src/
│   ├── auth/                 # Registro seguro
│   ├── chats/                # Chat callables y triggers
│   ├── feed/                 # Feed filtrado
│   ├── maintenance/          # Jobs y migraciones
│   ├── matcher/              # Motor de matches
│   ├── notifications/        # Callables de notificaciones
│   ├── posts/                # Posts, vistas y triggers
│   ├── shared/               # Firebase, i18n, translate, vision, tipos
│   ├── storage/              # Triggers de Storage
│   ├── users/                # Sincronizacion de perfil
│   └── index.ts              # Export global
├── tests/unit/
├── tests/integration/
├── package.json
└── tsconfig.json
database/rules/database.rules.json
storage/rules/storage.rules
database/seed/
```

## Principios de diseno

- **Client-to-serverless para operaciones sensibles:** registro, chats, matcher, feed filtrado, notificaciones, vistas y cambios de estado se exponen como callables.
- **RTDB reactiva:** posts, mensajes, chats, notificaciones y settings se sincronizan en tiempo real.
- **Indices denormalizados:** `/active_posts/{center_id}` y `/active_posts/{center_id}/{type}` reducen lecturas para feed y matcher.
- **Zero trust por capas:** reglas de RTDB/Storage limitan al cliente; Cloud Functions validan Auth, email verificado, dominio, autoria y geovallado cuando aplica.
- **i18n de backend:** textos de notificaciones y traducciones de busqueda soportan `es`, `en` y `ca`, con `es` como idioma comun.

## Registro seguro

`secureUniversityRegistration` reemplaza la creacion directa desde el cliente:

1. Valida `email`, `password`, `name` y aceptacion legal.
2. Resuelve `language` o `preferredLanguage`.
3. Busca un centro activo cuyo `email_domains/{domain_with_underscores}` sea `true`.
4. Crea el usuario en Firebase Auth con Admin SDK.
5. Escribe `/users/{uid}` con `role: "student"`, settings iniciales, legal y `acceptedTermsVersion`.
6. Si falla la escritura en RTDB, elimina el usuario creado en Auth.

## Catalogo de callables

| Funcion | Payload real | Resultado |
| :--- | :--- | :--- |
| `secureUniversityRegistration` | `email`, `password`, `name`, `language` o `preferredLanguage`, `termsAccepted`, `privacyAccepted`, `acceptedTermsVersion` opcional | `{ success, uid }` |
| `createPostReport` | `center_id`, `type`, `title`, `description?`, `category`, `lat`, `lng`, `photo_path?` | `{ success, post_id }` |
| `updatePostStatus` | `postId`, `newStatus` | `{ success }` |
| `recordPostView` | `postId` | `{ success }` |
| `getFilteredFeed` | `center_id`, `type`, `category?`, `search_term?`, `max_results?`, `user_lat?`, `user_lng?`, `sort_by?` | `{ feed }` |
| `checkPotentialMatches` | `center_id`, `category`, `type`, `title?`, `description?`, `location?`, `postImageUrl?`, `created_at?` | `{ matches }` |
| `saveFcmToken` | `token` | `{ success, message }` |
| `markNotificationsRead` | `notificationId?`, `notificationIds?`, `all?` | `{ success }` |
| `getOrCreateChat` | `postId`, `postOwnerId`, `centerId`, `postTitle` | `{ chatId }` |
| `backfillTermsVersion` | sin payload | `{ success, processed, updated }` para administradores |

## Triggers y jobs

| Funcion | Evento | Accion |
| :--- | :--- | :--- |
| `onPostCreated` | RTDB `/posts/{postId}` create | Valida geovallado, indexa activos, traduce titulo/descripcion y busca matches para notificar a propietarios de posts compatibles. |
| `onPostUpdated` | RTDB `/posts/{postId}` update | Sincroniza indices activos, actualiza metadatos de chats y elimina imagen anterior si cambia la URL. |
| `onPostDeleted` | RTDB `/posts/{postId}` delete | Elimina entradas en `/active_posts`. |
| `onMessageCreated` | RTDB `/messages/{chatId}/{messageId}` create | Actualiza `last_message`, reordena `user_chats`, guarda notificacion in-app y envia FCM al resto de miembros. |
| `onImageUploaded` | Storage `onObjectFinalized` | En posts extrae etiquetas Vision y actualiza `vision_labels`; en perfiles dinamicos puede generar `profile_image.webp`. |
| `onProfileImageUploaded` | Storage `users/{uid}/profile_image` | Sincroniza `photoUrl` del usuario con una URL Firebase Storage persistente. |
| `onUserProfileUpdated` | RTDB `/users/{userId}` update | Propaga cambios de nombre/foto a `usersInfo` de chats. |
| `purgeUnverifiedAccounts` | Schedule diario 02:00 | Elimina cuentas de Auth no verificadas con mas de 48 horas. |

## Feed y matcher

`getFilteredFeed` lee claves desde `/active_posts/{center_id}/{type}`, recupera posts completos en paralelo, traduce `search_term` al idioma comun y filtra por tipo, categoria, texto y etiquetas visuales. Puede ordenar por fecha o distancia.

`checkPotentialMatches` busca el tipo opuesto en `/active_posts/{center_id}/{targetType}`. El scoring actual combina:

- ratio de tokens del titulo contra `translated_title` o `title`;
- ratio de tokens de descripcion contra `translated_description` o `description`;
- bonus si ambos posts tienen imagen;
- proximidad temporal con decaimiento exponencial.

La callable devuelve hasta 5 matches y no envia notificaciones por si sola. Las notificaciones automaticas de matches se disparan desde `onPostCreated`.

## Notificaciones

El backend soporta dos canales:

- FCM via `/users/{uid}/fcm_tokens`.
- Bandeja in-app en `/users/{uid}/notifications`.

`sendNotificationToUser` respeta `settings/pushNotificationsEnabled`; solo un `false` explicito desactiva push. Tokens invalidos se eliminan automaticamente. `notifyMatchFound` y `onMessageCreated` tambien guardan notificaciones in-app.

## Storage

Las reglas permiten lectura publica de imagenes de posts y perfiles, y escritura autenticada con limite de 5 MB. Las imagenes de chat requieren autenticacion para lectura y escritura. El backend no convierte actualmente las imagenes de posts a WebP; el cliente ya las sube como WebP y el trigger de posts se ocupa de Vision labels.

## CI/CD

`.github/workflows/deploy.yml` define:

- `backend-unit-tests`: Node 20, `npm run test:unit`.
- `backend-integration-tests`: Node 20, Java 21, `npm run test:integration`.
- `deploy-backend`: en push, despliega `database,functions,storage`.
- `seed-database`: en push, ejecuta el seed despues del deploy.

El workflow se activa en PR y push hacia `develop` y `master`.
