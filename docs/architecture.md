# Documentación Arquitectónica: Registro Seguro con Cloud Functions

## 1. Resumen del Cambio
Para garantizar la integridad de la base de datos y evitar vulnerabilidades de escalada de privilegios, el flujo de registro de nuevos usuarios ha sido migrado de una arquitectura "Client-to-Auth" a una arquitectura **"Client-to-Serverless"**. 

El cliente (App Flutter) ya no se comunica directamente con Firebase Authentication para crear cuentas. En su lugar, consume una **Callable Cloud Function** (`secureUniversityRegistration`) que actúa como barrera de seguridad, validando el dominio del correo y forzando la asignación de roles.

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
 │    ├── src/index.ts                   # Lógica principal de las Cloud Functions
 │    ├── package.json                   # Dependencias (firebase-admin, firebase-functions)
 │    └── tsconfig.json                  # Reglas de compilación de TypeScript
 ├── .github/workflows/deploy.yml        # Pipeline CI/CD
 ├── firebase.json                       # Referencia a la compilación de functions
 └── database/rules/database.rules.json  # Índices de optimización añadidos
```

## 4. Componentes Críticos Modificados

### A. CI/CD Pipeline (`deploy.yml`)
El flujo de GitHub Actions ahora ejecuta un paso de construcción (`npm run build`) dentro de la carpeta `/functions` antes de desplegar. El comando de despliegue se ha actualizado a:
`firebase deploy --only database,functions`

### B. Índices en Realtime Database
Se ha añadido la regla `.indexOn: ["is_active"]` al nodo `/centers` en `database.rules.json` para optimizar el filtrado al registrar usuarios, evitando la descarga completa de la colección.

### C. Consumo desde Flutter (Guía para Frontend)
Los desarrolladores de la app móvil ya no deben usar `FirebaseAuth.instance.createUserWithEmailAndPassword`. Deben invocar la función de la siguiente manera:

```dart
import 'package:cloud_functions/cloud_functions.dart';

Future<void> registerUser(String email, String password, String name) async {
  final HttpsCallable callable = FirebaseFunctions.instance.httpsCallable('secureUniversityRegistration');
  
  try {
    final result = await callable.call(<String, dynamic>{
      'email': email,
      'password': password,
      'name': name,
    });
    print("Registro exitoso. UID: ${result.data['uid']}");
  } on FirebaseFunctionsException catch (e) {
    print("Error del servidor: ${e.message}"); // Ej: "Dominio no autorizado"
  }
}
```

## 5. Requisitos de Infraestructura (Firebase Console)
Para que esta arquitectura funcione de forma estricta y segura, los administradores del proyecto deben asegurar dos configuraciones manuales en la consola web de Firebase:
1. **Bloquear registro por defecto:** En *Authentication > Settings > User actions*, deshabilitar "Enable create (sign-up)". Esto evita que un atacante salte la Cloud Function usando la API pública de Firebase.
2. **Backups:** En *Realtime Database > Backups*, habilitar las copias de seguridad diarias automatizadas (Requiere Plan Blaze). **AÚN SIN REALIZAR**.