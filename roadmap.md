# Roadmap de Implementación - Backend (Firebase)

## 1. Corrección del Algoritmo de Validación de Ubicación (Status: Rejected)
**Objetivo:** Evitar que coordenadas válidas dentro del recinto sean marcadas erróneamente como `status: rejected` durante la creación de publicaciones.
* **Archivos objetivo:** `functions/src/posts/createPostReport.ts`, `functions/src/posts/postTriggers.ts` (y cualquier lógica de geovallado/distancia asociada).
* **Tareas Atómicas:**
    1.  **Auditoría de Geovallado:** Revisar la función que calcula si el pin (`lat`, `lng`) cae dentro del rango permitido del centro (coordenadas centrales + radio en `centers.json`). Verificar si el algoritmo usa correctamente la fórmula de Haversine y si la unidad de medida (metros/kilómetros) es consistente.
    2.  **Margen de Tolerancia:** Añadir un margen de tolerancia (ej. +5% del radio) para compensar imprecisiones del GPS de los dispositivos móviles.
    3.  **Prevención de Truncamiento:** Asegurar que los datos de latitud y longitud viajen y se procesen como variables de punto flotante de doble precisión (`double` / `number`) en todo el ciclo de ejecución para evitar redondeos que dejen el pin fuera del rango.
    4.  **Unit Testing:** Crear/Actualizar tests en `functions/tests/unit/` donde se simulen coordenadas limítrofes exactas (tanto justas por dentro como justas por fuera) para comprobar que el estado resultante sea `active` / `pending` y no `rejected`.

## 2. Estandarización de Mensajes y Traducciones (Errores y Notificaciones)
**Objetivo:** Garantizar que el backend provea la información necesaria para que el frontend pueda renderizar mensajes en los 3 idiomas, y que los emails/push se envíen en el idioma correcto.
* **Archivos objetivo:** `functions/src/shared/i18n.ts`, `functions/src/shared/notifications.ts` y todos los endpoints de `functions.https.onCall`.
* **Tareas Atómicas:**
    1.  **Errores Tipificados:** Modificar los bloqueos de error (`throw new functions.https.HttpsError()`) para devolver códigos estandarizados (ej. `out-of-bounds-location`, `invalid-profile-data`) en lugar de mensajes de texto duro en un solo idioma. Esto permite al frontend traducirlos.
    2.  **Traducciones en Servidor (Push/Emails):** Revisar la función que envía notificaciones (ej. `match-notifications`). Obtener la preferencia de idioma del documento del usuario receptor (`db.collection('users').doc(uid)`) y usar `i18n.ts` para inyectar la plantilla correcta en CA, ES o EN antes de despachar el FCM token.
    3.  **Manejo de Fallbacks:** Si el idioma preferido del usuario no está definido o hay un error en la obtención, usar el idioma principal de la aplicación (o inglés) de forma predeterminada para evitar fallos de ejecución.