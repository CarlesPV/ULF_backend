# UniLost & Found (ULF) - Realtime Database Schema

## /centers/{center_id}
Almacena la configuración y metadatos de cada universidad o centro adherido.

### Estructura de datos

| Campo | Tipo | Descripción y validaciones |
| :--- | :--- | :--- |
| `id` | `string` | ID único del centro. |
| `name` | `string` | Nombre oficial de la institución (ej. "Universidad Autónoma de Barcelona"). |
| `email_domains` | `object` | Mapa de dominios para validar automáticamente a qué centro pertenece un usuario al registrarse. Las claves usan guiones bajos en lugar de puntos porque Firebase no permite puntos en claves (ej. `"uab_cat"` representa `uab.cat`). Se usa un objeto en lugar de una lista para evitar bloqueos de concurrencia. |
| `boundary_coords` | `object` | Objeto que contiene `lat_min`, `lat_max`, `lng_min`, `lng_max` para delimitar el área del mapa (Bounding Box). |
| `boundaries` | `array` | Lista de objetos `{lat, lng}` que forman un polígono para validación precisa de geocerca. |
| `is_active` | `boolean` | Bandera para activar o desactivar un centro entero en la plataforma. |

### Ejemplo JSON
```json
"centers": {
  "center_id_001": {
    "id": "center_id_001",
    "name": "Universidad Autónoma de Barcelona",
    "email_domains": {
      "uab_cat": true,
      "e-campus_uab_cat": true
    },
    "boundary_coords": {
      "lat_min": 41.49, "lat_max": 41.51,
      "lng_min": 2.09, "lng_max": 2.12
    },
    "boundaries": [
      { "lat": 41.50, "lng": 2.11 },
      { "lat": 41.50, "lng": 2.12 },
      { "lat": 41.49, "lng": 2.11 }
    ],
    "is_active": true
  }
}
```

## /users/{user_id}
Gestiona los perfiles de los usuarios de la plataforma.

### Estructura de datos

| Campo | Tipo | Descripción y validaciones |
| :--- | :--- | :--- |
| `id` | `string` | Hash generado de forma segura por Firebase Auth. |
| `center_id` | `string` | Referencia al centro al que pertenece el usuario. |
| `role` | `string` | ENUM validado en Security Rules: `"student"`, `"janitor"`, `"admin"`. |
| `email` | `string` | Correo institucional UAB, validado en el registro. |
| `name` | `string` | Nombre público del usuario. |
| `photo_path` | `string` | Ruta interna en Firebase Storage (ej. `users/{uid}/profile_image.webp`). |
| `photoUrl` | `string` | URL pública de la foto de perfil (generada tras optimización). |
| `settings` | `object` | Configuración: `language` ("es"|"en"|"ca"), `push_notifications` (boolean) y `dark_mode` (boolean). |
| `legal` | `object` | Aceptación de términos legales: `termsAccepted` (boolean), `privacyAccepted` (boolean) y `acceptedAt` (number). |
| `created_at` | `number` | Unix timestamp en milisegundos de la creación de la cuenta. |
| `updated_at` | `number` | Unix timestamp en milisegundos de la última modificación. |
| `is_deleted` | `boolean` | Bandera para borrado lógico. |

### Ejemplo JSON
```json
"users": {
  "uid_abc123": {
    "id": "uid_abc123",
    "center_id": "center_id_001",
    "role": "student",
    "email": "1111111@uab.cat",
    "name": "Gabriel",
    "photo_path": "users/uid_abc123/profile_image.webp",
    "photoUrl": "https://storage.googleapis.com/...",
    "settings": { "language": "es", "push_notifications": true, "dark_mode": false },
    "legal": { "termsAccepted": true, "privacyAccepted": true, "acceptedAt": 1705320000000 },
    "created_at": 1705320000000,
    "updated_at": 1705320000000,
    "is_deleted": false
  }
}
```

## /posts/{post_id}
Catálogo de objetos.

### Estructura de datos

| Campo | Tipo | Descripción y validaciones |
| :--- | :--- | :--- |
| `id` | `string` | Identificador único autogenerado de la publicación. |
| `user_id` | `string` | ID del usuario creador de la alerta. |
| `center_id` | `string` | Referencia al centro para agrupar consultas del mapa. |
| `type` | `string` | ENUM validado en Security Rules: `"lost"` o `"found"`. Indica si el usuario perdió o encontró el objeto. |
| `title` | `string` | Título principal de la publicación. |
| `description` | `string` | Texto descriptivo detallado. |
| `translated_description` | `string` | Descripción traducida automáticamente al idioma común (Español) para búsquedas. |
| `category` | `string` | ENUM validado en Security Rules: `"accessories"`, `"clothes"`, `"devices"`, `"wallets"`, `"keys"`, `"bags"`, `"study"`, `"others"`. |
| `status` | `string` | ENUM: `"active"`, `"matched"`, `"returned"`. |
| `coords` | `object` | Objeto con `lat`, `lng` y `geohash` (para búsquedas por cercanía). |
| `photo_path` | `string` | Ruta de Storage para la imagen original (ej. `posts/{post_id}/{image_id}`). |
| `imageUrl` | `string` | URL pública de la imagen optimizada (WebP). |
| `vision_labels` | `string[]` | Etiquetas generadas por AI (Vision API) para mejorar las búsquedas. |
| `created_at` | `number` | Unix timestamp de creación. |
| `updated_at` | `number` | Unix timestamp de modificación. |
| `is_deleted` | `boolean` | Borrado lógico. |

### Ejemplo JSON
```json
"posts": {
  "post_xyz789": {
    "id": "post_xyz789",
    "user_id": "uid_abc123",
    "center_id": "center_id_001",
    "type": "found",
    "title": "Llaves de casa",
    "description": "En la calle.",
    "translated_description": "on the street.",
    "category": "keys",
    "status": "active",
    "coords": { "lat": 41.5, "lng": 2.1, "geohash": "sp3e..." },
    "photo_path": "posts/post_xyz789/image-001.jpg",
    "imageUrl": "https://storage.googleapis.com/.../image-001.jpg.webp",
    "vision_labels": ["key", "metal"],
    "created_at": 1705325000000,
    "updated_at": 1705325000000,
    "is_deleted": false
  }
}
```

## /active_posts/{center_id}/{post_id}
Índice secundario mantenido por Cloud Functions. Contiene únicamente las publicaciones con `status === 'active'` y `is_deleted === false`, agrupadas por centro. Permite que `getFilteredFeed` escanee solo los posts vigentes de una universidad sin tener que cargar el histórico completo de `/posts`.

Esta colección **no se escribe nunca desde el cliente**: los triggers `onPostCreated`, `onPostUpdated` y `onPostDeleted` la sincronizan automáticamente.

### Estructura de datos

| Campo | Tipo | Descripción y validaciones |
| :--- | :--- | :--- |
| `{post_id}` | `number` | El valor almacenado es el `created_at` del post (Unix ms), útil para ordenar resultados. La presencia de la clave es lo que indica que el post está activo. |

### Ejemplo JSON
```json
"active_posts": {
  "center_id_001": {
    "post_xyz789": 1705325000000,
    "post_abc456": 1705326500000
  }
}
```

## /post_views/{post_id}/{user_id}
Estructura para registrar las visitas de los usuarios a los posts.

### Estructura de datos

| Campo | Tipo | Descripción y validaciones |
| :--- | :--- | :--- |
| `timestamp` | `number` | Unix timestamp en milisegundos en el que el usuario visualizó el post. Sirve para mantener un registro de los usuarios que entran en cada publicación de objetos. |

### Ejemplo JSON
```json
"post_views": {
  "post_xyz789": {
    "uid_viewer456": {
      "timestamp": 1705330000000
    }
  }
}
```

## /chats/{chat_id}
Salas de comunicación privada.

### Estructura de datos

| Campo | Tipo | Descripción y validaciones |
| :--- | :--- | :--- |
| `id` | `string` | ID único del chat. |
| `center_id` | `string` | Referencia al centro. |
| `post_id` | `string` | Referencia a la publicación que originó el chat. |
| `postTitle` | `string` | Caché del título del post para visualización rápida. |
| `postImageUrl` | `string` | Caché de la URL de la imagen del post (WebP). Puede ser `null` si no hay imagen. |
| `members` | `object` | Mapa de IDs de usuario con valor `true` (ej. `{"userA": true, "userB": true}`). |
| `usersInfo` | `object` | Desnormalización de datos de los participantes: `{ [uid]: { displayName: string, photoUrl: string|null } }`. |
| `last_message` | `string` | Texto corto para mostrar en la previsualización o la constante `"SYSTEM_MSG_CHAT_STARTED"`. |
| `last_message_time` | `number` | Unix timestamp en milisegundos del último mensaje. |
| `created_at` | `number` | Unix timestamp en milisegundos de la creación de la sala. |

### Ejemplo JSON
```json
"chats": {
  "chat_def000": {
    "id": "chat_def000",
    "center_id": "center_id_001",
    "post_id": "post_xyz789",
    "postTitle": "Llaves de casa",
    "postImageUrl": "https://storage.googleapis.com/...webp",
    "members": {
      "uid_abc123": true,
      "uid_viewer456": true
    },
    "usersInfo": {
      "uid_abc123": {
        "displayName": "Gabriel",
        "photoUrl": "https://..."
      },
      "uid_viewer456": {
        "displayName": "Carles",
        "photoUrl": null
      }
    },
    "last_message": "SYSTEM_MSG_CHAT_STARTED",
    "last_message_time": 1705335000000,
    "created_at": 1705331000000
  }
}
```

## /messages/{chat_id}/{message_id}
Mensajes de las conversaciones.

### Estructura de datos

| Campo | Tipo | Descripción y validaciones |
| :--- | :--- | :--- |
| `id` | `string` | Identificador único del mensaje. |
| `sender_id` | `string` | ID del remitente (user_id de quien envía el mensaje). |
| `text` | `string` | Contenido del mensaje. |
| `timestamp` | `number` | Unix timestamp en milisegundos de la fecha y hora exacta de envío. |

### Ejemplo JSON
```json
"messages": {
  "chat_def000": {
    "msg_001": {
      "id": "msg_001",
      "sender_id": "uid_viewer456",
      "text": "Hola",
      "timestamp": 1705331500000
    }
  }
}
```