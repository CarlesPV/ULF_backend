# Resumen tecnico de notificaciones

Revision: 22 de mayo de 2026.

## Implementado

| Pieza | Estado |
| :--- | :--- |
| `shared/notifications.ts` | Envia FCM, guarda notificaciones in-app y limpia tokens invalidos. |
| `saveFcmToken` | Callable para registrar tokens FCM del usuario autenticado y verificado. |
| `markNotificationsRead` | Callable para marcar una, varias o todas las notificaciones como leidas. |
| `onMessageCreated` | Trigger de mensajes que actualiza chats, guarda in-app y envia FCM a destinatarios. |
| `onPostCreated` | Trigger de posts que busca matches automaticos y notifica propietarios de posts compatibles. |
| i18n | Textos de `match_found`, `new_message` e imagen en `shared/i18n.ts`. |

## Flujo de match real

```text
Nuevo post en /posts
  -> onPostCreated
  -> notifyMatchesForNewPost
  -> notifyMultipleUsersOfMatch
  -> notifyMatchFound
  -> saveInAppNotification + sendNotificationToUser
```

`checkPotentialMatches` no envia notificaciones ni acepta `notifyMatches`; solo devuelve matches para la UI.

## Payload de match

```json
{
  "type": "match_found",
  "title": "Coincidencia encontrada",
  "body": "Se encontro un objeto que podria coincidir con tu busqueda.",
  "data": {
    "type": "match",
    "postId": "post_123",
    "matchPostId": "post_123",
    "matchTitle": "Llavero rojo",
    "matchScore": 1.5,
    "matchPhotoUrl": "https://...",
    "timestamp": 1715731200000
  }
}
```

## Persistencia

- Tokens: `/users/{uid}/fcm_tokens/{token}: true`.
- Preferencia push: `/users/{uid}/settings/pushNotificationsEnabled`.
- Bandeja: `/users/{uid}/notifications/{notificationId}`.

## Tests

- `functions/tests/unit/matchNotifications.test.js`
- `functions/tests/unit/saveFcmToken.test.js`
- `functions/tests/unit/markNotificationsRead.test.js`
- `functions/tests/unit/onMessageCreated.test.js`
- `functions/tests/unit/postTriggers.test.js`
