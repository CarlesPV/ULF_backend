## Tareas Pendientes: Seguridad y Validación de Datos Geográficos

A continuación se detallan las tareas que el agente de IA debe implementar en el repositorio del Backend (Firebase). Las instrucciones priorizan la seguridad en la validación de los datos entrantes para evitar que clientes maliciosos ignoren las reglas del Frontend.

### 1. Validación de Coordenadas de Publicaciones en el Servidor
**Objetivo:** Complementar la tarea del frontend rechazando cualquier publicación (Post) cuya ubicación (latitud/longitud) se encuentre fuera de los límites del centro (universidad) correspondiente, asegurando así la integridad de los datos en la base de datos.
* **Archivos implicados:** `functions/src/posts/postTriggers.ts` (o `createPostReport.ts` dependiendo del flujo de creación), `database/seed/data/centers.json` (para estructura de datos).
* **Instrucciones:**
  1. Interceptar la creación de un nuevo objeto perdido/encontrado mediante una Cloud Function (ej. `onWrite` u `onCreate` en el nodo/colección de posts, o dentro del Callable si la creación es mediante API).
  2. Extraer el `centerId` y el objeto `location` (latitud y longitud) del post entrante.
  3. Consultar la información geográfica del centro desde Firebase (cuyos datos provienen originalmente de `centers.json`).
  4. Programar una función de utilidad en `functions/src/shared/utils.ts` que calcule la distancia en metros entre dos coordenadas (Haversine formula).
  5. Calcular la distancia entre el post y el centro de la universidad. Si la ubicación excede el radio máximo permitido (ej. radio de la universidad + un pequeño buffer para errores de GPS), rechazar la operación.
  6. En caso de rechazo, lanzar un error tipado de Firebase (ej. `functions.https.HttpsError('out-of-range', 'Location outside center bounds')`) o eliminar el nodo si se procesa post-escritura.
  7. **Pruebas:** Escribir casos de prueba en `functions/test/postTriggers.test.js` enviando un post con coordenadas válidas (debe ser aceptado) y otro post con coordenadas de otra ciudad (debe ser rechazado o revertido).