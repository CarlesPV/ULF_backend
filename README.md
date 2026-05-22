# UniLost & Found (ULF) - Backend

Backend serverless de UniLost & Found sobre Firebase. Contiene Cloud Functions, reglas de Realtime Database, reglas de Storage, seed inicial de centros y documentacion tecnica.

Revision de documentacion: 22 de mayo de 2026.

## Tecnologias principales

- Firebase Cloud Functions en TypeScript, runtime Node.js 20.
- Firebase Realtime Database para usuarios, posts, chats, mensajes, notificaciones e indices.
- Firebase Storage para imagenes de posts, chats y perfil.
- Firebase Auth para identidad y verificacion de correo.
- Firebase Cloud Messaging para push notifications.
- Google Cloud Translation API y Vision API para busqueda multiidioma y etiquetas visuales.
- Jest y Firebase Emulator Suite para pruebas unitarias e integracion.

## Estructura

```text
functions/                 # Cloud Functions, TypeScript y tests
database/rules/            # Security Rules de Realtime Database
database/seed/             # Seed de centros
storage/rules/             # Security Rules de Firebase Storage
docs/                      # Documentacion tecnica
firebase.json              # Configuracion Firebase y emuladores
```

## Cloud Functions exportadas

Callables:

- `secureUniversityRegistration`
- `createPostReport`
- `updatePostStatus`
- `recordPostView`
- `getFilteredFeed`
- `checkPotentialMatches`
- `backfillTermsVersion`
- `saveFcmToken`
- `markNotificationsRead`
- `getOrCreateChat`

Triggers y jobs:

- `onPostCreated`, `onPostUpdated`, `onPostDeleted`
- `onMessageCreated`
- `onImageUploaded`
- `onProfileImageUploaded`
- `onUserProfileUpdated`
- `purgeUnverifiedAccounts`

## Desarrollo

Instalar dependencias y compilar:

```bash
cd functions
npm install
npm run build
```

Ejecutar tests:

```bash
npm run test:unit
npm run test:integration
npm run test:all
```

Los tests de integracion usan Firebase Emulator Suite y requieren Java 21.

## Seed de centros

```bash
cd database/seed
npm install
export FIREBASE_DATABASE_URL="https://tu-proyecto.firebaseio.com"
export FIREBASE_SERVICE_ACCOUNT='{...contenido del service account json...}'
npm run seed
```

El seed actual carga el centro `uab` con dominios autorizados, bounds, location, radio y poligono.

## Despliegue

```bash
cd functions
npm run deploy
```

Equivale a:

```bash
firebase deploy --only database,functions,storage
```

El workflow `.github/workflows/deploy.yml` ejecuta tests unitarios e integracion en PR hacia `develop` o `master`; en push a esas ramas despliega y despues ejecuta el seed.

## Documentacion

- [Arquitectura y funciones](docs/architecture.md)
- [Esquema RTDB](docs/database.schema.md)
- [Reglas RTDB](docs/database.rules.md)
- [Reglas Storage](docs/storage.rules.md)
- [Testing](docs/testing.md)
- [Feed filtrado](docs/feed.md)
- [Matcher](docs/matcher.md)
- [Notificaciones de matches](docs/match-notifications.md)
- [Estado de implementacion](docs/implementation-status.md)

## Licencia

Proyecto bajo licencia MIT. Consulta [LICENSE](LICENSE).
