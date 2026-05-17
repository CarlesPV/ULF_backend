# Documentación Arquitectónica: Backend Serverless

## 1. Resumen del Cambio
Para garantizar la integridad de la base de datos y evitar vulnerabilidades de escalada de privilegios, el flujo de registro de nuevos usuarios ha sido migrado de una arquitectura "Client-to-Auth" a una arquitectura **"Client-to-Serverless"**. 

El cliente (App Flutter) ya no se comunica directamente con Firebase Authentication para crear cuentas. En su lugar, consume una **Callable Cloud Function** (`secureUniversityRegistration`) que actúa como barrera de seguridad, validando el dominio del correo y forzando la asignación de roles.

Además del registro, el backend expone callables para posts, feed, matcher, chats y notificaciones. Las funciones RF13 (`updatePostStatus`) y RF19 (`recordPostView`) ya existen y están exportadas desde `functions/src/index.ts`.

## 2. Flujo de Registro Actualizado
1. **Petición del Cliente:** La app envía las credenciales (`email`, `password`, `name`) a la Cloud Function.
2. **Validación de Dominio:** La función extrae el dominio (ej. `uab.cat` -> `uab_cat`) y consulta el nodo `/centers` en la Realtime Database (RTDB) para verificar si la universidad existe y está activa.
3. **Creación Atómica:** - Se crea el usuario en Firebase Authentication usando el **Admin SDK**.
   - Se genera el perfil en `/users/{uid}` dentro de la RTDB.
4. **Seguridad (Zero Trust):** La función ignora cualquier rol enviado por el cliente e inyecta forzosamente `role: 'student'`.
5. **Mecanismo de Rollback:** Si el paso de escritura en la RTDB falla (por error de red o de servidor), la función captura el error y **elimina al usuario de Authentication** para evitar perfiles "huérfanos" o bases de datos corruptas.

## 3. Cambios en la Estructura del Proyecto
Se ha introducido el ecosistema de Node.js/TypeScript al repositorio:

```
/ (raíz)
 ├── functions/                          # Entorno Backend Serverless
 │    ├── src/index.ts                   # Exporta las Cloud Functions públicas
 │    ├── src/auth/                      # Registro seguro
 │    ├── src/posts/                     # Reportes, estados, vistas y triggers
 │    ├── src/matcher/                   # Búsqueda de coincidencias
 │    ├── src/feed/                      # Feed filtrado por índice de activos
 │    ├── package.json                   # Dependencias (firebase-admin, firebase-functions)
 │    └── tsconfig.json                  # Reglas de compilación de TypeScript
 ├── .github/workflows/deploy.yml        # Pipeline CI/CD
 ├── firebase.json                       # Referencia a la compilación de functions
 └── database/rules/database.rules.json  # Índices de optimización añadidos
```

## 4. Componentes Críticos Modificados

### A. CI/CD Pipeline (`deploy.yml`)
El flujo de GitHub Actions ejecuta un paso de construcción (`npm run build`) dentro de la carpeta `/functions` antes de desplegar. El comando de despliegue es:
`firebase deploy --only database,functions,storage`

La suite de tests unitarios robusta ya está completamente integrada y alojada en `/functions/tests/unit/` utilizando Jest. Ejecuta 105 tests unitarios que simulan de manera aislada y simulada (mocks) el comportamiento de base de datos, triggers, autenticación y notificaciones push.

### B. Índices en Realtime Database
Se ha añadido la regla `.indexOn: ["is_active"]` al nodo `/centers` en `database.rules.json` para optimizar el filtrado al registrar usuarios, evitando la descarga completa de la colección.

El feed y el matcher usan el índice secundario `/active_posts/{center_id}` para leer solo publicaciones activas. Ese índice lo mantienen los triggers `onPostCreated`, `onPostUpdated` y `onPostDeleted`.

### C. Consumo desde Flutter (Guía para Frontend)
Los desarrolladores de la app móvil ya no deben usar `FirebaseAuth.instance.createUserWithEmailAndPassword`. Deben invocar la función de la siguiente manera:

```dart
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_functions/cloud_functions.dart';

Future<void> registerAndVerify(String email, String password, String name) async {
  final HttpsCallable callable = FirebaseFunctions.instance.httpsCallable('secureUniversityRegistration');
  
  try {
    // 1. El backend crea el usuario de forma segura
    await callable.call(<String, dynamic>{
      'email': email,
      'password': password,
      'name': name,
    });
    
    // 2. El frontend inicia sesión inmediatamente
    UserCredential userCredential = await FirebaseAuth.instance.signInWithEmailAndPassword(
      email: email,
      password: password,
    );

    // 3. El frontend dispara el correo de verificación nativo de Firebase
    if (userCredential.user != null && !userCredential.user!.emailVerified) {
      await userCredential.user!.sendEmailVerification();
      print("Por favor, verifica tu bandeja de entrada.");
    }
    
  } on FirebaseFunctionsException catch (e) {
    print("Error del servidor: ${e.message}"); 
  }
}
```

## 5. Requisitos de Infraestructura (Firebase Console)
Para que esta arquitectura funcione de forma estricta y segura, los administradores del proyecto deben asegurar dos configuraciones manuales en la consola web de Firebase:
1. **Bloquear registro por defecto:** En *Authentication > Settings > User actions*, deshabilitar "Enable create (sign-up)". Esto evita que un atacante salte la Cloud Function usando la API pública de Firebase.
2. **Backups:** En *Realtime Database > Backups*, habilitar las copias de seguridad diarias automatizadas (Requiere Plan Blaze). **AÚN SIN REALIZAR**.

## 6. Catálogo de Cloud Functions

El sistema utiliza Firebase Cloud Functions (Node.js/TypeScript) para procesar lógica de negocio de forma segura.

### 6.1 Funciones Callables (Invocables desde el cliente)
| Función | Propósito | Payload Requerido |
| :--- | :--- | :--- |
| `secureUniversityRegistration` | Registro seguro de usuarios con validación de dominio. | `email`, `password`, `name`, `language` (opcional). |
| `createPostReport` | Crea una nueva publicación de objeto perdido/encontrado. | `center_id`, `type`, `title`, `description`, `category`, `lat`, `lng`, `photo_path`. |
| `updatePostStatus` | Cambia el estado de un post (`matched`, `returned`). | `post_id`, `new_status`. |
| `recordPostView` | Registra que un usuario ha visualizado un post. | `post_id`. |
| `getFilteredFeed` | Recupera el feed de posts activos filtrado. | `center_id`, `type`, `search_term` (opcional). |
| `checkPotentialMatches` | Busca coincidencias inteligentes para un objeto. | `center_id`, `type`, `category`, `color`, `description`. |
| `saveFcmToken` | Registra el token de notificaciones push del usuario. | `token`. |
| `getOrCreateChat` | Inicia o recupera una conversación privada. | `post_id`, `owner_id`. |

### 6.2 Triggers (Eventos de base de datos / storage)
| Trigger | Evento | Acción |
| :--- | :--- | :--- |
| `onPostCreated` | `posts/{id}` (Creación) | Indexa en `/active_posts` y traduce la descripción al idioma común. |
| `onPostUpdated` | `posts/{id}` (Escritura) | Sincroniza el índice de activos según el `status` y `is_deleted`. |
| `onPostDeleted` | `posts/{id}` (Borrado) | Elimina la referencia del índice de activos. |
| `onMessageCreated` | `messages/{chatId}/{id}` | Envía notificación push localizada al destinatario del mensaje. |
| `onImageUploaded` | Cloud Storage (Upload) | Si es perfil: optimiza a WebP. Si es post: detecta etiquetas con Vision AI. |

### 6.3 Tareas Programadas (Cron)
| Función | Frecuencia | Acción |
| :--- | :--- | :--- |
| `purgeUnverifiedAccounts` | Diario (02:00 AM) | Elimina cuentas registradas hace >48h que no han verificado su correo. |

## 7. Próximos Pasos Técnicos
1. Mantener la suite de tests sincronizada con los cambios de contrato.
2. Implementar logs de auditoría en BigQuery para analíticas de objetos encontrados vs. devueltos.
3. Refinar los umbrales de coincidencia en el Matcher basado en feedback real.
