# Resumen de implementacion

Revision: 22 de mayo de 2026.

## Backend actual

El backend implementa:

- Registro seguro con `secureUniversityRegistration`.
- Feed filtrado con `getFilteredFeed`.
- Matcher con `checkPotentialMatches`.
- Notificaciones FCM e in-app con `saveFcmToken`, `markNotificationsRead`, `shared/notifications.ts`, `onMessageCreated` y `onPostCreated`.
- Chat privado con `getOrCreateChat` y triggers de mensajes.
- Indices `/active_posts` mantenidos por triggers de posts.
- Geovallado Haversine en `createPostReport` y `onPostCreated`.
- Vision labels para imagenes de posts en `onImageUploaded`.
- Sincronizacion de perfiles en chats con `onUserProfileUpdated`.
- Mantenimiento con `purgeUnverifiedAccounts`, `backfillTermsVersion`, `cleanupOldImages` y `purgeOrphanFields`.

## Notificaciones de matches

Flujo real:

```text
Nuevo post en /posts
  -> onPostCreated
  -> notifyMatchesForNewPost
  -> notifyMultipleUsersOfMatch
  -> saveInAppNotification + sendNotificationToUser
```

`checkPotentialMatches` devuelve sugerencias al cliente. Si se proporciona el ID del post de origen y la puntuación de la mejor coincidencia es superior o igual a `0.80`, se realiza una transacción atómica que actualiza el estado de ambos posts a `'matched'` y envía notificaciones push e in-app a ambos usuarios. Las notificaciones automáticas de matches también se disparan desde `onPostCreated` al crearse una nueva publicación compatible.

## Pruebas

El arbol de tests contiene:

- 20 suites unitarias con 166 casos declarados.
- 6 suites de integracion con 25 casos declarados.

Comandos:

```bash
cd functions
npm run test:unit
npm run test:integration
npm run test:all
```

## Documentacion principal

- `docs/architecture.md`
- `docs/database.schema.md`
- `docs/database.rules.md`
- `docs/storage.rules.md`
- `docs/testing.md`
- `docs/feed.md`
- `docs/matcher.md`
- `docs/match-notifications.md`
