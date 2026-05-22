# Sistema de notificaciones de matches

Revision: 22 de mayo de 2026.

El backend envia notificaciones de coincidencias cuando se crea un post nuevo y el trigger `onPostCreated` encuentra posts activos compatibles. La callable `checkPotentialMatches` solo devuelve sugerencias al cliente; no dispara notificaciones en el codigo actual.

## Flujo automatico

```text
Usuario publica un post en /posts/{postId}
    -> onPostCreated valida geovallado
    -> indexa en /active_posts/{center_id} y /active_posts/{center_id}/{type}
    -> traduce titulo/descripcion
    -> notifyMatchesForNewPost busca posts del tipo opuesto
    -> notifyMultipleUsersOfMatch envia FCM y guarda notificacion in-app
```

## Componentes

| Archivo | Responsabilidad |
| :--- | :--- |
| `functions/src/posts/postTriggers.ts` | Busca matches automaticos en `notifyMatchesForNewPost`. |
| `functions/src/shared/notifications.ts` | Construye payloads, respeta preferencias, envia FCM, guarda in-app y limpia tokens invalidos. |
| `functions/src/notifications/saveFcmToken.ts` | Registra tokens en `/users/{uid}/fcm_tokens/{token}`. |
| `functions/src/notifications/markNotificationsRead.ts` | Marca una, varias o todas las notificaciones como leidas. |
| `functions/src/shared/i18n.ts` | Textos localizados de notificacion. |

## Datos usados

Tokens FCM:

```json
{
  "users": {
    "uid_123": {
      "fcm_tokens": {
        "token_1": true
      },
      "settings": {
        "pushNotificationsEnabled": true
      }
    }
  }
}
```

Notificacion in-app:

```json
{
  "id": "notif_123",
  "type": "match_found",
  "title": "Coincidencia encontrada",
  "body": "Se encontro un objeto que podria coincidir con tu busqueda.",
  "read": false,
  "timestamp": 1715731200000,
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

## Preferencias y entrega

- `sendNotificationToUser` no envia push si `/users/{uid}/settings/pushNotificationsEnabled` es `false`.
- Si no hay tokens FCM, la funcion devuelve `false` sin romper el flujo.
- Tokens con `messaging/invalid-registration-token` o `messaging/registration-token-not-registered` se eliminan automaticamente.
- La notificacion in-app se intenta guardar antes del envio push.

## Diferencia con `checkPotentialMatches`

`checkPotentialMatches` se usa para que el cliente muestre sugerencias antes de publicar. No llama a `notifyMatchFound` y no acepta `notifyMatches`.

El flujo de notificacion real depende de que exista un post nuevo en RTDB y se active `onPostCreated`.

## Testing

Tests relevantes:

- `functions/tests/unit/matchNotifications.test.js`
- `functions/tests/unit/postTriggers.test.js`
- `functions/tests/unit/saveFcmToken.test.js`
- `functions/tests/unit/markNotificationsRead.test.js`
- `functions/tests/unit/onMessageCreated.test.js`
