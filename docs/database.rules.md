# Reglas de Seguridad - Firebase Realtime Database (ULF)

Este documento detalla la configuración de seguridad aplicada a la base de datos de **UniLost & Found**, diseñada para cumplir con los requisitos de integridad (RNF03) y privacidad del contrato.

## Política General de Acceso
Las operaciones protegidas requieren un usuario autenticado mediante Firebase Auth. Para las funciones críticas de la aplicación (crear posts, chatear, marcar como devuelto o registrar visualizaciones), se exige adicionalmente que el usuario haya verificado su dirección de correo institucional (@uab.cat).

Algunos nodos de lectura auxiliar, como `/centers` y `/active_posts`, aceptan usuarios autenticados sin exigir `email_verified`; esto permite resolver datos base de la aplicación, pero las escrituras funcionales siguen restringidas.

## Desglose de Reglas por Nodo

### 1. Centros Universitarios (`/centers`)
* **Lectura:** Permitida para cualquier usuario autenticado.
* **Escritura:** Restringida exclusivamente a usuarios con el rol `admin`.
* **Validación:** Se asegura que los centros contengan campos obligatorios como `email_domains` y `boundary_coords` para el correcto funcionamiento de la geocerca.

### 2. Perfiles de Usuario (`/users`)
* **Seguridad:** Un usuario solo puede leer y escribir su propio perfil (`auth.uid === $user_id`).
* **Integridad:** El campo `role` está protegido; al crearse una cuenta nueva, el sistema fuerza el rol `student` por defecto.
* **Verificación:** Es obligatorio tener el correo verificado para realizar modificaciones.

### 3. Publicaciones de Objetos (`/posts`)
* **Lectura:** Visible para todos los usuarios con correo verificado.
* **Escritura:** Solo el creador original del post (`user_id`) puede modificar o eliminar la publicación.
* **Gestión de Estados (RF13):** La Cloud Function `updatePostStatus` existe y concentra el cambio de estado desde cliente. Las reglas actuales protegen la propiedad del post y mantienen `user_id` inmutable, pero la validación estricta de enums (`active`, `matched`, `returned`) queda pendiente de endurecimiento en reglas.
* **Indexación:** Optimizado para búsquedas por `center_id`, `status`, `category` y `geohash`.

### 4. Índice de Posts Activos (`/active_posts`)
* **Propósito:** Nodo optimizado para el Matcher Inteligente y el Feed.
* **Acceso:** Lectura permitida para usuarios autenticados para garantizar la carga rápida del mapa.

### 5. Historial de Visualizaciones (`/post_views`)
* **Cumplimiento RF19:** La Cloud Function `recordPostView` existe y registra qué usuarios han entrado en una publicación.
* **Seguridad:** El espectador puede escribir su registro de visita (con `timestamp` del servidor), pero solo el dueño del post o el propio espectador pueden consultar dicho registro.

### 6. Sistema de Mensajería (`/chats` y `/messages`)
* **Privacidad Estricta:** Las conversaciones son privadas. Solo los usuarios listados como miembros del chat (`members`) tienen permisos de lectura y escritura.
* **Validación de Mensajes:** Se comprueba que el `sender_id` coincida con el usuario autenticado y que el mensaje contenga texto válido antes de guardarse.

## Resumen de Cumplimiento Técnico
| Requisito | Implementación en Reglas |
| :--- | :--- |
| **RF01 (Autenticación)** | Bloqueo global mediante `auth != null`. |
| **RF13 (Estados)** | Callable `updatePostStatus` existente y validación de propiedad en `/posts`; falta endurecer enums en reglas. |
| **RF19 (Historial)** | Callable `recordPostView` existente y nodo `/post_views` con escritura restringida. |
| **RNF03 (Seguridad)** | Validación `email_verified === true` en todos los flujos de escritura. |

## Pendientes Técnicos
* Añadir tests automatizados para funciones callable y triggers principales.
* Endurecer `/posts` con validación real de enums, tipos básicos, `id === $post_id`, `user_id === auth.uid` en creación y centro existente.
* Mantener la documentación sincronizada después de cambiar reglas o contratos públicos.
