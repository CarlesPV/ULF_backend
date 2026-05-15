## Correcciones de Emergencia: Saneamiento de Datos Geográficos y Fallbacks

Las siguientes tareas deben ser implementadas en el Backend para proteger al Frontend de caídas (crashes) debido a datos geográficos nulos o incompletos enviados desde la base de datos, y asegurar la validación estricta.

### 1. Asegurar Integridad de Coordenadas de los Centros (Seed y DB)
**Objetivo:** Garantizar que ningún centro/universidad carezca de coordenadas válidas, previniendo errores de nulidad matemáticos en el Frontend.
* **Archivos implicados:** `database/seed/data/centers.json`, reglas de base de datos/Firestore.
* **Instrucciones:**
  1. Revisar el archivo `centers.json` y asegurar que todos los objetos de universidades tengan una estructura `location` estricta con propiedades numéricas no nulas `lat` y `lng` (o `latitude`/`longitude`).
  2. Modificar las reglas de seguridad (`database.rules.json` o equivalentes) para rechazar la creación o edición de cualquier documento de `centers` que no contenga coordenadas geográficas válidas (tipo de dato número).

### 2. Reforzar Validación Geográfica en Creación de Posts
**Objetivo:** Implementar la validación final y absoluta que rechace publicaciones fuera de rango o sin coordenadas si el Frontend falla en validarlo localmente.
* **Archivos implicados:** `functions/src/posts/postTriggers.ts` (o `createPostReport.ts`).
* **Instrucciones:**
  1. Al inicio del Trigger/Callable, añadir una verificación estricta de nulidad para las coordenadas recibidas. Si `post.location` es nulo o indefinido, lanzar inmediatamente un `functions.https.HttpsError('invalid-argument', 'Coordenadas requeridas')`.
  2. Obtener los datos del `centerId`. Si el centro devuelto no tiene ubicación definida, registrar un error crítico en los logs del backend y abortar la creación.
  3. Ejecutar el cálculo de la fórmula de Haversine. Si excede el radio dinámico de la universidad, rechazar el post (`functions.https.HttpsError('failed-precondition', 'Location outside boundaries')`).