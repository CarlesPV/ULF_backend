# UniLost & Found (ULF) - Backend

Este repositorio contiene el núcleo lógico serverless de la plataforma UniLost & Found, diseñado para gestionar objetos perdidos y encontrados en entornos universitarios.

## Tecnologías Principales
- **Firebase Cloud Functions (V2):** Lógica distribuida y segura en TypeScript.
- **Firebase Realtime Database:** Base de datos NoSQL de baja latencia para perfiles, posts y chats.
- **Firebase Storage:** Almacenamiento optimizado de imágenes con Vision API.
- **Google Cloud Translation API:** Internacionalización automática de contenidos.

## Estructura del Proyecto
- `functions/`: Código fuente de las Cloud Functions, configuración de TypeScript y tests.
- `database/rules/`: Definición de Security Rules para la base de datos.
- `storage/rules/`: Políticas de acceso a archivos.
- `database/seed/`: Scripts de inicialización de centros y datos base.
- `docs/`: Documentación detallada de arquitectura, esquemas y reglas.

## Guía de Mantenimiento y Despliegue

### 1. Inicialización de la Base de Datos (Seeding)
Para cargar los centros universitarios iniciales:
1. Obtén el archivo JSON de tu Service Account desde la consola de Firebase.
2. Ejecuta el script de seed:
```bash
cd database/seed
export FIREBASE_DATABASE_URL="https://tu-proyecto.firebaseio.com"
export FIREBASE_SERVICE_ACCOUNT='{...contenido del json...}'
npx ts-node seed_db.ts
```

### 2. Desarrollo y Pruebas
Para ejecutar la suite de pruebas unitarias:
```bash
cd functions
npm install
npm test
```

### 3. Despliegue
Para desplegar todos los componentes al entorno de producción:
```bash
# Requiere Firebase CLI instalado y autenticado
firebase deploy --only database,functions,storage
```

## Documentación de Referencia
- [Arquitectura y Callables](docs/architecture.md)
- [Esquema de Datos](docs/database.schema.md)
- [Reglas de Seguridad (DB)](docs/database.rules.md)
- [Reglas de Storage](docs/storage.rules.md)

---
*Desarrollado para el proyecto final de grado - UAB.*
