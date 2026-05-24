# Sistema de notificaciones de matches

El backend envía notificaciones de coincidencias en dos escenarios:
1. **Flujo Automático (`onPostCreated`):** Al crearse un nuevo post en la base de datos, el trigger busca automáticamente posts activos compatibles del tipo opuesto y notifica a sus autores (con umbral de score `>= 1.5`).
2. **Flujo de Smart Matcher Callable (`checkPotentialMatches`):** Si el cliente invoca esta función enviando los datos del post (incluyendo su ID de origen), y la coincidencia con el post más relevante supera el umbral de `0.80`, se ejecuta una transacción atómica que establece el estado de ambos posts como `'matched'` y envía notificaciones push e in-app (`notifyMatchFound`) a ambos usuarios.

## Flujo automático (onPostCreated)

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

## Comportamiento de `checkPotentialMatches`

`checkPotentialMatches` se usa principalmente para mostrar sugerencias en el cliente antes de la publicación definitiva. Sin embargo, si se le pasa el ID del post de origen (en `id`, `postId` o `post_id`) y la mejor coincidencia supera el umbral de `0.80`, actúa de forma activa en la base de datos realizando lo siguiente:
- Cambia atómicamente el estado de ambos posts a `'matched'` en `/posts/{id}/status`.
- Dispara notificaciones push e in-app (`notifyMatchFound`) a ambos usuarios destinatarios.

Si no se proporciona el ID del post o no se alcanza el umbral de `0.80`, únicamente retorna las mejores sugerencias a la interfaz de usuario sin alterar los datos ni enviar notificaciones.

## Testing

Tests relevantes:

- `functions/tests/unit/matchNotifications.test.js`
- `functions/tests/unit/postTriggers.test.js`
- `functions/tests/unit/saveFcmToken.test.js`
- `functions/tests/unit/markNotificationsRead.test.js`
- `functions/tests/unit/onMessageCreated.test.js`
