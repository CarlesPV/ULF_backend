# UniLost & Found (ULF) - Realtime Database Schema

## /centers/{center_id}
Almacena la configuración y metadatos de cada universidad o centro adherido.

### Estructura de datos

| Campo | Tipo | Descripción y validaciones |
| :--- | :--- | :--- |
| `id` | `string` | ID único del centro. |
| `name` | `string` | Nombre oficial de la institución (ej. "Universidad Autónoma de Barcelona"). |
| `email_domains` | `object` | Mapa de dominios para validar automáticamente a qué centro pertenece un usuario al registrarse. Las claves usan guiones bajos en lugar de puntos porque Firebase no permite puntos en claves (ej. `"uab_cat"` representa `uab.cat`). Se usa un objeto en lugar de una lista para evitar bloqueos de concurrencia. |
| `boundary_coords` | `object` | Objeto que contiene `lat_min`, `lat_max`, `lng_min`, `lng_max` para delimitar el área del mapa donde se pueden poner "chinchetas". |
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
      "lat_min": 1.123, "lat_max": 1.123,
      "lng_min": 1.123, "lng_max": 1.123
    },
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
| `photo_path` | `string` | URL o ID interno de Storage para la foto de perfil. |
| `last_gps` | `object` | Objeto con latitud y longitud de la última ubicación conocida. |
| `settings` | `object` | Configuración interna: `push_notifications` (boolean) y `dark_mode` (boolean). |
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
    "photo_path": "profiles/uid_abc123.jpg",
    "last_gps": { "lat": 1.123, "lng": 1.123 },
    "settings": { "push_notifications": true, "dark_mode": false },
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
| `category` | `string` | ENUM validado en Security Rules: `"accessories"`, `"clothing"`, `"devices"`, `"wallet"`, `"keys"`, `"bags"`, `"study"`, `"other"`. |
| `status` | `string` | ENUM validado en Security Rules que representa el ciclo de vida de la publicación: `"active"`, `"matched"`, `"returned"`. |
| `coords` | `object` | Objeto con latitud y longitud que marcan la ubicación exacta o probable. |
| `photo_path` | `string` | URL o ruta de Storage para la imagen adjunta. |
| `created_at` | `number` | Unix timestamp en milisegundos de la creación del reporte. |
| `updated_at` | `number` | Unix timestamp en milisegundos de la última modificación del reporte. |
| `is_deleted` | `boolean` | Bandera para borrado lógico. |

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
    "category": "keys",
    "status": "active",
    "coords": { "lat": 1.123, "lng": 1.123 },
    "photo_path": "posts/post_xyz789.jpg",
    "created_at": 1705325000000,
    "updated_at": 1705325000000,
    "is_deleted": false
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
| `members` | `object` | Mapa de IDs de usuario con valor `true` (ej. `{"userA": true, "userB": true}`). Esta estructura facilita las consultas de lectura y la definición de Security Rules. |
| `last_message` | `string` | Texto corto para mostrar en la previsualización de la lista de chats. |
| `last_message_time` | `number` | Unix timestamp en milisegundos del último mensaje, usado para ordenar la bandeja de entrada. |
| `created_at` | `number` | Unix timestamp en milisegundos de la creación de la sala. |

### Ejemplo JSON
```json
"chats": {
  "chat_def000": {
    "id": "chat_def000",
    "center_id": "center_id_001",
    "post_id": "post_xyz789",
    "members": {
      "uid_abc123": true,
      "uid_viewer456": true
    },
    "last_message": "Hola",
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