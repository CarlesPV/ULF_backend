## Tareas Pendientes: Backend y Seguridad (Firebase)

Este bloque define las instrucciones para dar soporte en base de datos y almacenamiento a las validaciones de ubicación e imágenes del frontend. Ejecuta las tareas garantizando la seguridad mediante Firebase Security Rules y Cloud Functions.

### 1. Modelado de Datos para Geocercas (Centros)
**Objetivo:** Proveer la información geográfica de los centros para que el frontend pueda realizar las validaciones de área.

* **Paso 1.1: Actualización del Esquema:**
    * Abre `docs/database.schema.md` y documenta una nueva propiedad `boundaries` (tipo array de geopoints o lat/lng) dentro del nodo de `centers`.
* **Paso 1.2: Inserción de Datos Semilla:**
    * Abre `database/seed/data/centers.json` (y el script `seed_db.ts`).
    * Añade el array de coordenadas que forman el polígono del centro de prueba (UAB). Asegúrate de que los puntos formen un área cerrada.

### 2. Validación de Seguridad de Ubicación en Backend
**Objetivo:** Prevenir que se publiquen objetos fuera del mapa del centro forzando la solicitud directamente en la base de datos.

* **Paso 2.1: Reglas de Base de Datos / Functions:**
    * Abre `functions/src/posts/postTriggers.ts`.
    * En la función `onWrite` o `onCreate` de una publicación, añade una capa de seguridad extra.
    * Recupera el polígono del centro asociado a la publicación. Utiliza una librería geoespacial en Node.js (ej. `d3-polygon` o matemática pura) para verificar si las coordenadas enviadas están dentro del límite.
    * Si están fuera, elimina/rechaza el documento y lanza un error en los logs del servidor.

### 3. Configuración de Caché en Firebase Storage
**Objetivo:** Enviar los metadatos correctos al subir imágenes para que el gestor de caché del frontend (Flutter) pueda detectar cambios sin descargar la imagen completa.

* **Paso 3.1: Metadatos en Subida de Archivos:**
    * Abre `functions/src/storage/onImageUploaded.ts` (o el equivalente donde se procesen/compriman imágenes).
    * Asegúrate de que al actualizar o guardar un archivo, se establezca explícitamente el metadata `Cache-Control`.
    * Configura el valor a `public, max-age=3600, s-maxage=3600` (o el tiempo que consideres óptimo).
* **Paso 3.2: Generación de Tokens/ETags:**
    * Firebase Storage ya maneja ETags internamente. Asegúrate de que las reglas en `storage/rules/storage.rules` permitan la lectura de metadatos a los usuarios autenticados para que el frontend pueda ejecutar solicitudes `HEAD` de comprobación antes de invalidar la caché local.