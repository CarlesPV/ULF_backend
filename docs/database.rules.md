# UniLost & Found (ULF) - Realtime Database Rules

Documentación de las reglas de seguridad de Firebase Realtime Database. El archivo de reglas se encuentra en `database/rules/database.rules.json`.

## Conceptos clave

- **`auth`**: Objeto del usuario autenticado. `auth.uid` es su identificador único.
- **`data`**: Datos actuales en la base de datos antes de la escritura.
- **`newData`**: Datos que quedarán tras la escritura.
- **`root`**: Referencia a la raíz de la base de datos, útil para hacer cross-reads entre colecciones.
- **`$wildcard`**: Variable de ruta que captura el ID del nodo (ej. `$user_id`, `$post_id`).
- **`.read`**: Controla quién puede leer un nodo.
- **`.write`**: Controla quién puede escribir un nodo. Se evalúa antes que `.validate`.
- **`.validate`**: Valida la estructura y los valores del dato. Si falla, la escritura se rechaza aunque `.write` sea `true`.

## /centers
```json
"centers": {
    ".read": "auth != null",
    ".indexOn": ["is_active"],
    "$center_id": {
        ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'",
        ".validate": "newData.hasChildren(['id', 'name', 'email_domains', 'boundary_coords', 'is_active'])"
    }
}
```

| Regla | Decisión |
| :--- | :--- |
| `.read` | Cualquier usuario autenticado puede leer los centros. Es necesario para que la app pueda mostrar el centro al que pertenece el usuario. |
| `.indexOn` | Índices sobre `is_active` para que Firebase filtre los centros en servidor. |
| `.write` | Solo usuarios con `role === 'admin'` pueden crear o modificar centros. Se hace un cross-read a `/users/{auth.uid}/role` para comprobarlo. |
| `.validate` | Exige que estén presentes los campos mínimos obligatorios del esquema. |

## /users
```json
"users": {
    "$user_id": {
        ".read": "auth != null && auth.uid === $user_id",
        ".write": "auth != null && auth.uid === $user_id",
        ".validate": "newData.hasChildren([...]) && newData.child('id').val() === $user_id && ...",
        "role": {
            ".validate": "(!data.exists() && newData.val() === 'student') || (data.exists() && newData.val() === data.val())"
        },
        "center_id": {
            ".validate": "root.child('centers').child(newData.val()).exists()"
        }
    }
}
```

| Regla | Decisión |
| :--- | :--- |
| `.read` | Un usuario solo puede leer su propio perfil. No hay lectura cruzada de perfiles entre usuarios. |
| `.write` | Un usuario solo puede escribir su propio perfil. |
| `.validate` | Exige los campos obligatorios, que `id` coincida con el `$user_id` de la ruta, y que `created_at`, `updated_at` sean números y `is_deleted` sea booleano. |
| `role > .validate` | Protección en dos niveles: en **creación**, el único rol permitido desde el cliente es `student`; los roles `janitor` y `admin` son de confianza y solo pueden asignarse desde un Cloud Function con permisos de servidor. En **modificación**, el rol no puede cambiarse una vez asignado. |
| `center_id > .validate` | Verifica que el `center_id` proporcionado exista realmente en `/centers`. Evita que un usuario se registre con un centro inventado. |

## /posts
```json
"posts": {
    ".read": "auth != null",
    ".indexOn": ["center_id", "type", "status", "category", "user_id"],
    "$post_id": {
        ".write": "auth != null && (!data.exists() || data.child('user_id').val() === auth.uid) && (!newData.exists() || newData.child('user_id').val() === auth.uid)",
        ".validate": "newData.hasChildren([...]) && ...",
        "user_id": {
            ".validate": "!data.exists() || newData.val() === data.val()"
        }
    }
}
```

| Regla | Decisión |
| :--- | :--- |
| `.read` | Cualquier usuario autenticado puede leer el feed de publicaciones. Es el comportamiento esperado para que los usuarios puedan buscar objetos perdidos o encontrados. |
| `.indexOn` | Índices sobre `center_id`, `type`, `status`, `category` y `user_id` para que Firebase filtre en servidor al cargar el feed o el mapa, evitando descargar todos los posts al cliente. |
| `.write` | Cubre tres casos: **creación** (`!data.exists()`), donde el `user_id` del nuevo dato debe ser el del usuario autenticado; **edición**, donde el `user_id` del dato existente debe coincidir con `auth.uid`; y **borrado físico**, que solo el propietario puede hacer. |
| `.validate` | Valida campos obligatorios, los valores permitidos de `type` (`lost` o `found`) y de `status` (`active`, `matched` o `returned`), y los tipos de `created_at`, `updated_at` e `is_deleted`. |
| `user_id > .validate` | El campo `user_id` es inmutable: una vez creado el post no puede reasignarse a otro usuario. |

## /post_views
```json
"post_views": {
    "$post_id": {
        ".indexOn": ["timestamp"],
        "$user_id": {
            ".read": "auth != null && (auth.uid === $user_id || root.child('posts').child($post_id).child('user_id').val() === auth.uid)",
            ".write": "auth != null && auth.uid === $user_id",
            ".validate": "newData.hasChildren(['timestamp']) && newData.child('timestamp').isNumber() && newData.child('timestamp').val() <= now"
        }
    }
}
```

| Regla | Decisión |
| :--- | :--- |
| `.indexOn` | Índice sobre `timestamp` para ordenar las visitas cronológicamente en servidor. |
| `.read` | Pueden leer el registro de visitas de un post: el propio usuario que lo visitó, o el creador del post (para que pueda ver quién ha visto su publicación). |
| `.write` | Un usuario solo puede registrar su propia visualización. No puede escribir en el nodo de otro usuario. |
| `.validate` | El único campo requerido es `timestamp`, que debe ser un número (Unix ms). Además se valida que el `timestamp` no sea una fecha futura (`<= now`) para evitar corrupción del orden cronológico. |

## /chats
```json
"chats": {
    ".indexOn": ["center_id", "post_id"],
    "$chat_id": {
        ".read": "auth != null && data.child('members').child(auth.uid).val() === true",
        ".write": "auth != null && (!data.exists() || data.child('members').child(auth.uid).val() === true)",
        ".validate": "newData.hasChildren([...]) && newData.child('members').child(auth.uid).val() === true && ..."
    }
}
```

| Regla | Decisión |
| :--- | :--- |
| `.indexOn` | Índices sobre `center_id` y `post_id` para filtrar chats por centro o por publicación. |
| `.read` | Solo los miembros del chat pueden leerlo. Se comprueba que `auth.uid` esté presente en el mapa `members` con valor `true`. |
| `.write` | En **creación** (`!data.exists()`), cualquier usuario autenticado puede abrir un chat. En **modificación**, solo los miembros existentes pueden escribir. |
| `.validate` | Exige los campos obligatorios y además fuerza que el usuario que crea el chat se incluya a sí mismo como miembro, evitando que se creen chats sin propietario. |

## /messages
```json
"messages": {
    "$chat_id": {
        ".read": "auth != null && root.child('chats').child($chat_id).child('members').child(auth.uid).val() === true",
        "$message_id": {
            ".write": "auth != null && root.child('chats').child($chat_id).child('members').child(auth.uid).val() === true && !data.exists()",
            ".validate": "newData.hasChildren([...]) && newData.child('sender_id').val() === auth.uid && ..."
        }
    }
}
```

| Regla | Decisión |
| :--- | :--- |
| `.read` | Solo los miembros del chat pueden leer sus mensajes. Se hace un cross-read a `/chats/{chat_id}/members` para comprobarlo. |
| `.write` | Solo los miembros pueden escribir, y únicamente si el mensaje **no existe aún** (`!data.exists()`). Esto hace los mensajes inmutables: una vez enviados no se pueden editar ni borrar. |
| `.validate` | Exige los campos obligatorios, que `sender_id` coincida con `auth.uid` (no se puede enviar un mensaje en nombre de otro usuario), y que `timestamp` sea un número. Además se valida que el `timestamp` no sea una fecha futura (`<= now`) |