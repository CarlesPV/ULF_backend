# Esquema de Firebase Realtime Database

Documento alineado con reglas, seed y Cloud Functions actuales.

## `/centers/{center_id}`

Configuracion de centros universitarios autorizados.

| Campo | Tipo | Uso |
| :--- | :--- | :--- |
| `id` | `string` | Identificador del centro, por ejemplo `uab`. |
| `name` | `string` | Nombre publico. |
| `email_domains` | `object` | Mapa de dominios autorizados; `uab_cat: true` representa `uab.cat`. |
| `boundary_coords` | `object` | Bounds heredados con `lat_min`, `lat_max`, `lng_min`, `lng_max`. Requerido por reglas. |
| `bounds` | `object` | Bounds usados por cliente/seed con `latMin`, `latMax`, `lngMin`, `lngMax`. |
| `location` | `object` | Centro del campus: `{ lat, lng }`. Usado por geovallado backend. |
| `radius_meters` | `number` | Radio permitido para Haversine en backend. |
| `boundaries` | `array` | Poligono opcional `{ lat, lng }[]` para validacion/visualizacion de cliente. |
| `is_active` | `boolean` | Habilita o deshabilita el centro. |

## `/users/{uid}`

Perfil del usuario.

| Campo | Tipo | Uso |
| :--- | :--- | :--- |
| `id` | `string` | UID de Firebase Auth. |
| `center_id` | `string` | Centro asociado. |
| `role` | `string` | `student` o `admin`; el auto-registro fuerza `student`. |
| `email` | `string` | Email institucional. |
| `name` | `string` | Nombre mostrado. |
| `photo_path` | `string` | Ruta de Storage heredada/opcional. |
| `photoUrl` | `string` | URL de avatar usada por frontend y chats. |
| `photoUpdatedAt` | `number` | Timestamp opcional de refresco de foto. |
| `settings` | `object` | Preferencias sincronizadas. |
| `preferredLanguage` | `string` | `es`, `en` o `ca`. |
| `fcm_tokens` | `object` | Tokens FCM: `{ token: true }`. |
| `notifications` | `object` | Bandeja in-app. |
| `legal` | `object` | Terminos y privacidad aceptados. |
| `acceptedTermsVersion` | `string|null` | Version legal aceptada. |
| `created_at` | `number` | Timestamp de creacion. |
| `updated_at` | `number` | Timestamp de actualizacion. |
| `is_deleted` | `boolean` | Borrado logico. |

### `settings`

```json
{
  "language": "es",
  "themeMode": "system",
  "isDarkMode": false,
  "pushNotificationsEnabled": true,
  "push_notifications": true,
  "dark_mode": false
}
```

El codigo mantiene compatibilidad con claves heredadas (`push_notifications`, `dark_mode`) y actuales (`pushNotificationsEnabled`, `themeMode`).

### `notifications/{notificationId}`

```json
{
  "id": "notificationId",
  "type": "new_message",
  "title": "Nuevo mensaje",
  "body": "Hola",
  "read": false,
  "timestamp": 1715731200000,
  "data": {
    "type": "chat",
    "chatId": "chat_123",
    "messageId": "msg_123",
    "timestamp": 1715731200000
  }
}
```

## `/posts/{post_id}`

Publicaciones de objetos.

| Campo | Tipo | Uso |
| :--- | :--- | :--- |
| `id` | `string` | ID del post. |
| `user_id` | `string` | Autor. |
| `center_id` | `string` | Centro. |
| `type` | `string` | `lost` o `found`. |
| `title` | `string` | Titulo. |
| `translated_title` | `string` | Titulo traducido al idioma base por trigger. |
| `description` | `string` | Descripcion opcional. |
| `translated_description` | `string` | Descripcion traducida al idioma base. |
| `category` | `string` | `accessories`, `clothes`, `devices`, `wallets`, `keys`, `bags`, `study`, `others`. |
| `status` | `string` | `active`, `matched`, `returned` o `rejected`. |
| `rejection_reason` | `string` | Motivo si el trigger rechaza la ubicacion. |
| `location` | `string` | Texto de ubicacion mostrado. |
| `coords` | `object` | `{ lat, lng, geohash }`. |
| `photo_path` | `string` | Ruta de Storage. |
| `imageUrl` | `string` | URL publica de imagen. |
| `postImageUrl` | `string` | Alias usado por chats/feed. |
| `vision_labels` | `string[]` | Etiquetas Vision traducidas. |
| `date` | `number` | Fecha declarada por usuario. |
| `created_at` | `number` | Timestamp de creacion. |
| `updated_at` | `number` | Timestamp de actualizacion. |
| `is_deleted` | `boolean` | Borrado logico. |

## `/active_posts/{center_id}`

Indice mantenido por Cloud Functions.

```json
{
  "active_posts": {
    "uab": {
      "post_1": 1715731200000,
      "lost": {
        "post_1": 1715731200000
      },
      "found": {
        "post_2": 1715731300000
      }
    }
  }
}
```

`getFilteredFeed` y `checkPotentialMatches` usan principalmente la forma tipada `/active_posts/{center_id}/{type}`.

## `/post_views/{post_id}/{user_id}`

```json
{
  "timestamp": 1715731200000
}
```

Registra visualizaciones de usuarios que no son autores del post.

## `/chats/{chat_id}`

```json
{
  "id": "chat_123",
  "center_id": "uab",
  "post_id": "post_123",
  "post_owner_id": "uid_owner",
  "postTitle": "Llaves",
  "postImageUrl": "https://...",
  "members": {
    "uid_a": true,
    "uid_b": true
  },
  "usersInfo": {
    "uid_a": { "displayName": "Ana", "photoUrl": null },
    "uid_b": { "displayName": "Bernat", "photoUrl": "https://..." }
  },
  "last_message": "SYSTEM_MSG_CHAT_STARTED",
  "last_message_time": 1715731200000,
  "created_at": 1715731200000
}
```

## `/user_chats/{uid}/{chat_id}`

Indice por usuario para listar chats. El valor es el timestamp usado para ordenar.

## `/messages/{chat_id}/{message_id}`

Mensaje de texto:

```json
{
  "id": "msg_1",
  "sender_id": "uid_a",
  "text": "Hola",
  "timestamp": 1715731200000,
  "messageType": "text"
}
```

Mensaje de imagen:

```json
{
  "id": "msg_2",
  "sender_id": "uid_a",
  "imageUrl": "https://...",
  "timestamp": 1715731300000,
  "messageType": "image"
}
```
