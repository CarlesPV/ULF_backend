# Guia de integracion de notificaciones

Documento alineado con el codigo actual.

## Registrar token FCM desde cliente

```dart
final token = await FirebaseMessaging.instance.getToken();
if (token != null) {
  final callable = FirebaseFunctions.instance.httpsCallable('saveFcmToken');
  await callable.call({'token': token});
}
```

`saveFcmToken` requiere usuario autenticado con email verificado y guarda:

```text
/users/{uid}/fcm_tokens/{token}: true
```

## Escuchar push en Flutter

```dart
FirebaseMessaging.onMessage.listen((RemoteMessage message) {
  final data = message.data;
  // type puede ser "match_found", "match", "new_message", "chat" o "message"
});

FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
  final data = message.data;
  // Navegar por chatId o matchPostId segun payload.
});
```

El frontend actual centraliza esta logica en `AppNotifications.initFCM` y `AppNotifications.handlePushNavigation`.

## Marcar notificaciones como leidas

Callable disponible:

```dart
final callable = FirebaseFunctions.instance.httpsCallable('markNotificationsRead');
await callable.call({
  'notificationIds': ['notif_1', 'notif_2'],
});
```

Payloads aceptados:

| Campo | Tipo | Uso |
| :--- | :--- | :--- |
| `notificationId` | `string` | Marca una notificacion. |
| `notificationIds` | `string[]` | Marca varias, maximo 500. |
| `all` | `boolean` | Si es `true`, marca todas las no leidas. |

Si no se envia ningun ID, la callable tambien marca todas.

## Cómo se envían matches y notificaciones

Las notificaciones de matches se disparan en dos flujos diferentes:

### 1. Flujo automático en base de datos (`onPostCreated`)
Cuando se crea físicamente un post en `/posts`:
```text
onPostCreated
  -> notifyMatchesForNewPost (umbral de score >= 1.5)
  -> notifyMatchFound (a los autores de las coincidencias de tipo opuesto)
  -> FCM + /users/{uid}/notifications
```

### 2. Flujo de coincidencia proactiva (`checkPotentialMatches`)
Cuando el cliente llama a la callable `checkPotentialMatches` pasando el ID del post de origen (en `id`, `postId` o `post_id`):
- Si el score del mejor match es `>= 0.80`, se ejecuta una transacción que marca ambos posts como `'matched'` en la base de datos.
- Se envían alertas `notifyMatchFound` de forma push e in-app a ambos usuarios destinatarios.
- Si no se suministra el ID del post o el score es inferior a `0.80`, solo se devuelven los posibles candidatos sin realizar cambios ni notificaciones.

## Utilidades internas

### `notifyMatchFound`

```typescript
await notifyMatchFound(
  userId,
  {
    id: "post_456",
    title: "Llavero rojo",
    description: "Encontrado en biblioteca",
    photo_url: "https://..."
  },
  1.5
);
```

Lee idioma del usuario, construye payload localizado, guarda una notificacion in-app y envia FCM si el usuario permite push.

### `notifyMultipleUsersOfMatch`

```typescript
const result = await notifyMultipleUsersOfMatch(
  ["uid_a", "uid_b"],
  { id: "post_456", title: "Llavero", description: "..." },
  1.5
);
// { success: number, failed: number }
```

### `sendNotificationToUser`

Envia a todos los tokens de `/users/{uid}/fcm_tokens`. Respeta `settings/pushNotificationsEnabled`; un `false` explicito desactiva push.

## Debugging

- Ver tokens en `/users/{uid}/fcm_tokens`.
- Ver bandeja en `/users/{uid}/notifications`.
- Revisar logs con textos como `Notificacion enviada` o errores `messaging/invalid-registration-token`.
- Comprobar que el usuario tenga email verificado para `saveFcmToken`.

## Errores normales

| Situacion | Comportamiento |
| :--- | :--- |
| Usuario sin tokens | `sendNotificationToUser` devuelve `false`; no rompe el flujo. |
| Token invalido | Se elimina de RTDB. |
| Push desactivado | No se envia FCM; puede existir notificacion in-app si el flujo la guarda. |
| Fallo buscando matches en trigger | Se loguea; el post ya puede seguir indexado/publicado. |
