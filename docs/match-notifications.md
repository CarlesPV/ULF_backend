# Sistema de Notificaciones para Matches

**Fecha:** Mayo 2026  
**Estado:** ✅ Implementado  
**Prioridad:** Alta (RF06 - Matcher con Notificaciones)

## Descripción General

El sistema de notificaciones de matches asegura que cuando se detecta una potencial coincidencia entre un objeto perdido y uno encontrado, **los usuarios relevantes son notificados automáticamente en tiempo real** mediante Firebase Cloud Messaging (FCM).

## Flujos de Notificación

### Flujo 1: Búsqueda Manual (checkPotentialMatches)

```
Usuario A (buscando "Llavero rojo")
           ↓
Llama: checkPotentialMatches({
    center_id: "uab",
    type: "lost",
    category: "keys",
    color: "rojo",
    description: "llavero con cinta"
})
           ↓
Sistema busca matches activos (type="found")
           ↓
Encuentra 3 matches con scores 2.0, 1.5, 1.0
           ↓
Para cada match (async, sin bloquear):
  - Obtiene user_id del post
  - Obtiene tokens FCM del usuario
  - Envía notificación push
           ↓
Retorna al cliente: { matches: [...] }
```

**Ejemplo de Notificación Recibida:**
```json
{
  "notification": {
    "title": "¡Coincidencia encontrada!",
    "body": "Se encontró un objeto que podría coincidir: 'Llavero rojo con cinta'"
  },
  "data": {
    "type": "match_found",
    "matchPostId": "post_xyz789",
    "matchTitle": "Llavero encontrado en biblioteca",
    "matchScore": "2.0",
    "matchPhotoUrl": "https://...",
    "timestamp": "1715731200000"
  }
}
```

### Flujo 2: Auto-Detección (onPostCreated Trigger)

```
Usuario B publica: "Encontré un llavero rojo"
           ↓
Trigger: onPostCreated se ejecuta
           ↓
Paralelamente:
  A) Indexar en /active_posts/{center_id}
  B) Traducir descripción
  C) Buscar matches automáticamente
           ↓
notifyMatchesForNewPost() busca:
  - Posts activos con type="lost"
  - Misma categoría
  - Similitud de descripción
           ↓
Top 5 matches encontrados
           ↓
Para cada usuario que tiene un match:
  - Obtiene tokens FCM
  - Envía notificación
           ↓
Trigger completa (sin bloquear el flujo)
```

## Estructura de Código

### 1. Utilidad de Notificaciones (`shared/notifications.ts`)

**Funciones Principales:**

```typescript
// Envía notificación a un usuario (todos sus dispositivos)
async function sendNotificationToUser(
    userId: string,
    payload: NotificationPayload
): Promise<boolean>

// Notifica sobre un match específico
async function notifyMatchFound(
    userId: string,
    matchPost: { id, title, description, photo_url },
    matchScore: number
): Promise<boolean>

// Notifica a múltiples usuarios en paralelo
async function notifyMultipleUsersOfMatch(
    userIds: string[],
    matchPost: {...},
    matchScore: number
): Promise<{ success: number, failed: number }>
```

**Características:**

- ✅ Envío a múltiples tokens FCM del mismo usuario (múltiples dispositivos)
- ✅ Eliminación automática de tokens inválidos
- ✅ Manejo de errores sin interrumpir el flujo
- ✅ Logging detallado para debugging
- ✅ Payloads multiidioma (i18n)

### 2. Actualización de checkPotentialMatches

**Cambios:**

```typescript
// Nuevo parámetro (opcional, default: true)
const { notifyMatches = true } = request.data;

// Después de encontrar matches:
if (notifyMatches && topMatches.length > 0) {
    // Enviar notificaciones en paralelo (no bloquea)
    Promise.all(notificationPromises).catch(...)
}
```

**Ventajas:**

- El cliente puede opcionalmente desactivar notificaciones (`notifyMatches: false`)
- Las notificaciones se envían sin bloquear la respuesta al cliente
- Manejo robusto de errores

### 3. Trigger en postTriggers.ts

**Nueva Función:**
```typescript
async function notifyMatchesForNewPost(postId: string, newPost: any): Promise<void>
```

**Algoritmo:**

1. Validar que el post sea activo
2. Buscar posts activos del tipo opuesto
3. Obtener descripción traducida para mejor matching
4. Calcular scores de relevancia
5. Notificar a top 5 usuarios
6. Loguear resultados

**Ejecución:**
- Corre en paralelo dentro de `onPostCreated`
- No bloquea indexing ni traducción
- Errores son capturados y logueados

## Estructura de Base de Datos

### Tokens FCM

```
/users/{userId}/fcm_tokens/
  {token_1}: true
  {token_2}: true
  {token_3}: true
```

**Gestión:**

- Cliente: Registra tokens con `saveFcmToken()` callable
- Servidor: Lee tokens para enviar notificaciones
- Auto-limpieza: Elimina tokens inválidos automáticamente

### Registros de Notificaciones (Opcional)

```
/notifications/{userId}/{notificationId}/
  type: "match_found"
  matchPostId: "post_xyz"
  createdAt: 1715731200000
  read: false
```

## Internacionalización (i18n)

Claves de notificación en `shared/i18n.ts`:

```typescript
notifications: {
  match_found_title: {
    es: "¡Coincidencia encontrada!",
    en: "Match found!",
    ca: "¡Coincidència trobada!"
  },
  match_found_body: {
    es: "Se encontró un objeto que podría coincidir con tu búsqueda.",
    en: "An item was found that might match your search.",
    ca: "Es va trobar un objecte que podria coincidir amb la teva recerca."
  }
}
```

## Garantías y Confiabilidad

| Aspecto | Implementación |
| :--- | :--- |
| **Entrega** | Firebase Cloud Messaging garantiza entrega con reintentos automáticos |
| **Duplicados** | Sistema evita notificaciones duplicadas (una por top-5 match) |
| **Ordering** | Notificaciones ordenadas por relevancia (score descendente) |
| **Timeout** | Notificaciones no bloquean el flujo principal |
| **Fallback** | Usuarios pueden consultar matches con `checkPotentialMatches` manualmente |

## Casos de Error

### 1. Usuario sin tokens FCM

```javascript
// Sistema retorna false pero no error
const success = await notifyMatchFound(userId, match, score);
// success === false → Usuario aún puede buscar manualmente
```

### 2. Token FCM inválido

```
- Firebase retorna: messaging/invalid-registration-token
- Sistema automáticamente elimina el token
- Siguiente notificación usa tokens válidos
```

### 3. Fallo en búsqueda de matches

```
try {
    await notifyMatchesForNewPost(postId, post);
} catch (error) {
    console.error("Error en búsqueda de matches:", error);
    // Post se indexa de todas formas
    // Usuario puede buscar manualmente
}
```

## Testing

Ver: [matchNotifications.test.js](../functions/tests/unit/matchNotifications.test.js)

**Casos Cubiertos:**

1. ✅ Envío a múltiples dispositivos
2. ✅ Eliminación de tokens inválidos
3. ✅ Información correcta en payload
4. ✅ Multiidioma en notificaciones
5. ✅ Parallelización sin bloqueos

## Flujos Completos (E2E)

### Escenario 1: Búsqueda Activa

```
Timeline:
T0:00 - Usuario A busca "Llavero rojo"
T0:01 - Sistema encuentra 3 matches
T0:02 - Notificaciones enviadas a usuarios B, C, D
T0:05 - Usuario D recibe notificación en su móvil
T0:10 - Usuario D abre la app y ve el post coincidencia
T0:15 - Usuario D inicia chat con Usuario A
```

### Escenario 2: Publicación Automática

```
Timeline:
T0:00 - Usuario B publica "Encontré llavero en biblioteca"
T0:01 - Trigger indexa el post
T0:02 - Trigger traduce descripción
T0:03 - Trigger busca matches → encuentra 5 posts de "Perdido"
T0:05 - Usuarios A, E, F, G, H reciben notificaciones
T0:15 - Usuarios empiezan a abrir sus apps
```

## Métricas a Monitorear

- **Latencia:** Tiempo desde match encontrado hasta notificación enviada
- **Tasa de entrega:** % de notificaciones que llegan al dispositivo
- **Engagement:** % de usuarios que abren notificación
- **Conversión:** % que resulta en chat iniciado

## Próximas Mejoras

1. **Historial de Notificaciones:** Guardar notificaciones leídas en BD
2. **Preferencias de Usuario:** Permitir desactivar notificaciones por categoría
3. **Geolocalización:** Priorizar matches cercanos
4. **Machine Learning:** Mejorar scoring basado en usuario-to-user matches históricos
5. **Batching:** Agrupar múltiples matches en una notificación si es apropiado
