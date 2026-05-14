# Reglas de Seguridad - Firebase Realtime Database (ULF)

Este documento detalla la configuración de seguridad aplicada a la base de datos de **UniLost & Found**, diseñada para garantizar la integridad de los datos y la privacidad de los usuarios.

## Política General de Acceso
Las operaciones protegidas requieren un usuario autenticado mediante Firebase Auth. Para las funciones críticas (crear posts, chatear, marcar como devuelto o registrar visualizaciones), se exige adicionalmente que el usuario haya **verificado su dirección de correo institucional**.

## Desglose de Reglas por Nodo

### 1. Centros Universitarios (`/centers`)
* **Lectura:** Permitida para cualquier usuario autenticado.
* **Escritura:** Restringida exclusivamente a usuarios con el rol `admin`.
* **Validación:** Se asegura que los centros contengan campos obligatorios (`id`, `name`, `email_domains`, `boundary_coords`).

### 2. Perfiles de Usuario (`/users`)
* **Seguridad:** Un usuario solo puede leer y escribir su propio perfil (`auth.uid === $user_id`).
* **Integridad:** El campo `role` está protegido; al crearse una cuenta nueva, se fuerza el rol `student`. No se puede cambiar el rol una vez creado desde el cliente.
* **Verificación:** Es obligatorio tener el correo verificado para realizar cualquier escritura.

### 3. Publicaciones de Objetos (`/posts`)
* **Lectura:** Visible para todos los usuarios con correo verificado.
* **Escritura:** Solo el creador original del post (`user_id`) puede modificar o eliminar la publicación.
* **Validación:** Se validan estrictamente los tipos de datos y Enums:
    * **Categorías:** `accessories`, `clothes`, `devices`, `wallets`, `keys`, `bags`, `study`, `others`.
    * **Tipos:** `lost`, `found`.
    * **Estados:** `active`, `matched`, `returned`.
* **Indexación:** Optimizado para búsquedas por `center_id`, `type`, `status`, `category`, `user_id`, `created_at` y `geohash`.

### 4. Índice de Posts Activos (`/active_posts`)
* **Propósito:** Nodo de solo lectura para el cliente, sincronizado automáticamente por Cloud Functions.
* **Acceso:** Lectura permitida para usuarios autenticados para agilizar el Feed y el Matcher.

### 5. Historial de Visualizaciones (`/post_views`)
* **Seguridad:** Un usuario puede registrar su propia visita (con `timestamp` validado contra el tiempo del servidor), pero solo el dueño del post o el propio espectador pueden consultar dicho registro.

### 6. Sistema de Mensajería (`/chats` y `/messages`)
* **Privacidad:** Las conversaciones son privadas. Solo los miembros del chat (`members`) tienen permisos de lectura y escritura.
* **Validación de Mensajes:** Se comprueba que el `sender_id` sea el usuario autenticado y que el mensaje contenga texto válido. La escritura es de tipo *append-only* (no se pueden borrar ni editar mensajes una vez enviados).

## Resumen de Cumplimiento Técnico
| Requisito | Implementación en Reglas |
| :--- | :--- |
| **Autenticación** | Bloqueo global mediante `auth != null`. |
| **Integridad de Roles** | Validación estricta del campo `role` en `/users`. |
| **Validación de Contenido** | Regex y validaciones de esquema en `/posts`. |
| **Privacidad de Chats** | Control de acceso basado en el mapa de `members`. |
