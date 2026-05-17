# Guía Técnica: Sistema de Notificaciones de Matches

## Índice
1. [Uso de la API](#uso-de-la-api)
2. [Errores y Recuperación](#errores-y-recuperación)
3. [Integración en Client](#integración-en-client)
4. [Debugging](#debugging)

## Uso de la API

### 1. Enviar Notificación a Un Usuario

```typescript
import { notifyMatchFound } from "./shared/notifications";

const success = await notifyMatchFound(
    userId: "user_123",
    matchPost: {
        id: "post_456",
        title: "Llavero rojo encontrado",
        description: "Llavero con cinta azul, encontrado en biblioteca",
        photo_url: "https://storage.example.com/photo.jpg"
    },
    matchScore: 2.0
);

if (success) {
    console.log("Notificación enviada correctamente");
} else {
    console.log("Usuario no tiene tokens FCM registrados");
}
```

**Parámetros:**
- `userId` (string): UID del usuario receptor
- `matchPost` (object): Información del post que coincide
- `matchScore` (number): Score de relevancia (1.0 = base, +0.5 por palabra)

**Retorna:** `boolean` - true si se envió al menos a un dispositivo

---

### 2. Enviar Notificación a Múltiples Usuarios

```typescript
import { notifyMultipleUsersOfMatch } from "./shared/notifications";

const result = await notifyMultipleUsersOfMatch(
    userIds: ["user_123", "user_456", "user_789"],
    matchPost: {
        id: "post_xyz",
        title: "Pasaporte encontrado",
        description: "Pasaporte rojo, encontrado en centro de estudiantes",
        photo_url: "https://..."
    },
    matchScore: 1.5
);

console.log(result); // { success: 2, failed: 1 }
// 2 usuarios recibieron, 1 sin tokens registrados
```

**Parámetros:**
- `userIds` (string[]): Array de UIDs de usuarios
- `matchPost` (object): Información del post coincidencia
- `matchScore` (number): Score de relevancia

**Retorna:** `{ success: number, failed: number }` - Conteo de resultados

---

### 3. Envío Manual con Control Total

```typescript
import { sendNotificationToUser, NotificationType } from "./shared/notifications";

const payload = {
    type: NotificationType.MATCH_FOUND,
    title: "¡Coincidencia encontrada!",
    body: "Se encontró un objeto que podría ser el que buscas",
    data: {
        matchPostId: "post_123",
        matchTitle: "Anillo de oro",
        matchScore: 2.5,
        matchPhotoUrl: "https://...",
        timestamp: Date.now()
    }
};

const success = await sendNotificationToUser("user_456", payload);
```

---

## Errores y Recuperación

### Escenario 1: Usuario Sin Tokens FCM

```javascript
const result = await notifyMatchFound(userId, match, score);
// result === false

// Acción recomendada:
if (!result) {
    console.log("Usuario aún puede buscar manualmente con checkPotentialMatches");
    // No lanzar error, es un caso normal
}
```

### Escenario 2: Token FCM Inválido

```javascript
// El sistema detecta automáticamente:
// - messaging/invalid-registration-token
// - messaging/registration-token-not-registered

// Acción automática:
// 1. Error capturado en sendNotificationToUser()
// 2. Token eliminado de /users/{userId}/fcm_tokens/{token}
// 3. Siguiente notificación usa tokens válidos
// 4. Logging del evento para debugging
```

### Escenario 3: Fallo en Búsqueda de Matches

```javascript
// En onPostCreated trigger:
try {
    await notifyMatchesForNewPost(postId, post);
} catch (error) {
    console.error("Error en búsqueda de matches:", error);
    // El post se indexa de todas formas
    // El usuario puede buscar manualmente después
}
```

---

## Integración en Client (Flutter)

### 1. Registrar Token FCM

```dart
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:cloud_functions/cloud_functions.dart';

Future<void> registerFcmToken() async {
    try {
        // 1. Obtener token FCM
        final token = await FirebaseMessaging.instance.getToken();
        
        if (token == null) {
            print("No FCM token available");
            return;
        }

        // 2. Enviar al backend
        final callable = FirebaseFunctions.instance.httpsCallable('saveFcmToken');
        final result = await callable.call({'token': token});
        
        print("Token registrado: ${result.data['message']}");

        // 3. Escuchar cambios de token
        FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
            registerFcmTokenOnRefresh(newToken);
        });

    } catch (error) {
        print("Error registrando FCM token: $error");
    }
}
```

### 2. Escuchar Notificaciones de Matches

```dart
Future<void> setupNotificationListeners() async {
    // Notificación en foreground (app abierta)
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        print("Notificación en foreground: ${message.notification?.title}");
        
        if (message.data['type'] == 'match_found') {
            // Mostrar diálogo o banner
            _handleMatchNotification(message.data);
        }
    });

    // Notificación en background (app cerrada)
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        print("App abierta desde notificación: ${message.notification?.title}");
        
        if (message.data['type'] == 'match_found') {
            // Navegar a post del match
            Navigator.of(context).pushNamed('/post', arguments: {
                'postId': message.data['matchPostId'],
                'title': message.data['matchTitle']
            });
        }
    });
}

void _handleMatchNotification(Map<String, dynamic> data) {
    final String matchPostId = data['matchPostId'];
    final String matchTitle = data['matchTitle'];
    final double matchScore = double.parse(data['matchScore']);

    // Mostrar UI con información del match
    showDialog(
        context: context,
        builder: (context) => AlertDialog(
            title: Text("¡Coincidencia encontrada!"),
            content: Text("Se encontró: '$matchTitle' (Score: $matchScore)"),
            actions: [
                TextButton(
                    onPressed: () {
                        // Navegar al post
                        Navigator.of(context).pushNamed('/post', 
                            arguments: matchPostId);
                    },
                    child: Text("Ver Match")
                )
            ],
        )
    );
}
```

### 3. Buscar Matches (Con Notificaciones)

```dart
Future<void> searchMatches() async {
    try {
        final callable = FirebaseFunctions.instance
            .httpsCallable('checkPotentialMatches');
        
        final result = await callable.call({
            'center_id': 'uab',
            'type': 'lost',
            'category': 'keys',
            'color': 'rojo',
            'description': 'llavero con cinta',
            'notifyMatches': true  // Enviar notificaciones (default: true)
        });

        final matches = result.data['matches'] as List;
        
        // UI muestra matches + usuarios reciben notificaciones
        setState(() {
            potentialMatches = matches;
        });

    } catch (error) {
        print("Error buscando matches: $error");
    }
}

// O sin notificaciones (búsqueda silenciosa)
Future<void> searchMatchesSilent() async {
    await callable.call({
        // ... otros parámetros
        'notifyMatches': false  // No enviar notificaciones
    });
}
```

---

## Debugging

### 1. Verificar Tokens FCM en Base de Datos

```bash
# En Firebase Console → Realtime Database
/users/{userId}/fcm_tokens/
```

Debería mostrar:
```json
{
  "token_1": true,
  "token_2": true,
  "token_3": true
}
```

Si está vacío, el usuario no ha registrado tokens.

### 2. Verificar Logs en Cloud Functions

```bash
# En Firebase Console → Cloud Functions → Logs
# Buscar por userId o postId

"Notificación enviada a 2 dispositivos del usuario user_123"
"Error enviando notificación a token token_xyz: messaging/invalid-registration-token"
```

### 3. Test Local con Emulador

```javascript
// En test:
const mockMessaging = {
    send: jest.fn().mockResolvedValue("msg_123")
};

admin.messaging = jest.fn().mockReturnValue(mockMessaging);

// Verificar que se llamó correctamente:
expect(mockMessaging.send).toHaveBeenCalledWith(
    expect.objectContaining({
        token: expect.any(String),
        notification: expect.objectContaining({
            title: expect.stringContaining("Coincidencia")
        })
    })
);
```

### 4. Simular Notificación en Android Emulator

```bash
# Usar Firebase Console Test Notification
# O simular con adb:
adb shell am start -a android.intent.action.VIEW \
    -d "https://example.com/?matchPostId=post_123"
```

---

## Monitoreo en Producción

### Métricas Clave

```typescript
// Agregar a logs:

// 1. Tasa de entrega
console.log(`Notificaciones enviadas: ${successCount}/${totalCount}`);

// 2. Errores comunes
if (error.code === 'messaging/invalid-registration-token') {
    // Trackear tokens inválidos
}

// 3. Latencia
const startTime = Date.now();
const result = await notifyMatchFound(...);
const latency = Date.now() - startTime;
console.log(`Latencia notificación: ${latency}ms`);

// 4. Usuarios sin tokens
if (!hasTokens) {
    console.log(`Usuario ${userId} sin tokens FCM`);
}
```

### Alertas Recomendadas

```
- Tasa de fallo > 5% → Revisar configuración FCM
- Latencia promedio > 2s → Optimizar búsqueda de matches
- Usuarios sin tokens > 10% → Mejorar onboarding
```

---

## Troubleshooting Común

| Problema | Causa | Solución |
| :--- | :--- | :--- |
| Notificación no llega | Token FCM inválido/expirado | Volver a registrar token con saveFcmToken |
| Timeout en notificación | Búsqueda de matches lenta | Usar índice /active_posts correctamente |
| Duplicadas | Token registrado múltiples veces | Deduplicar tokens en cliente |
| No aparece en foreground | Manejador no configurado | Agregar listener en onMessage |
| App no abre al tocar | deeplink no configurado | Configurar intent filters en Android |

---

## Seguridad

- ✅ Solo usuarios verificados (email_verified) pueden disparar búsquedas
- ✅ Tokens FCM se validan automáticamente
- ✅ Notificaciones no contienen datos sensibles (solo IDs y titles)
- ✅ Base de datos protegida con reglas (solo usuarios ven sus propios tokens)

---

**¿Preguntas?** Revisar [docs/match-notifications.md](match-notifications.md) para más detalles.
