# Roadmap de Corrección Definitiva - Backend (Firebase)

## 1. Implementación de Buffer de Tolerancia en Geovallado
**Objetivo:** Compensar las pérdidas de precisión de punto flotante y las fluctuaciones del GPS añadiendo un margen de gracia al cálculo de distancias, evitando que pines limítrofes sean marcados como `rejected`.
* **Archivos objetivo:** `functions/src/shared/utils.ts` (o donde resida la función `calculateDistance` / `isPointInArea`) y `functions/src/posts/postTriggers.ts`.
* **Tareas Atómicas:**
    1.  **Constante de Tolerancia:** Definir una constante `LOCATION_TOLERANCE_METERS = 50` (50 metros).
    2.  **Modificación de la Condición:** Modificar la lógica que decide si un post es rechazado. En lugar de evaluar estrictamente `distance <= center.radius`, la evaluación debe ser obligatoriamente: `distance <= (center.radius + LOCATION_TOLERANCE_METERS)`.
    3.  **Desactivación de Polígonos Estrictos:** Si la validación actual está utilizando el array de polígonos (`boundaries`) para dictaminar el `status: rejected`, comentar/eliminar esa evaluación específica para este trigger y usar **únicamente** la distancia Haversine desde el `center.coordinates` con la tolerancia añadida. Los polígonos tienen aristas matemáticas exactas que no perdonan errores de milímetros.
    4.  **Logging Claro:** Añadir un `functions.logger.info` que imprima la distancia calculada vs el radio permitido para facilitar la depuración si vuelve a fallar.