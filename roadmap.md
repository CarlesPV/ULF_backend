# Roadmap de Mantenimiento y Documentación: Backend (Firebase)

Este documento contiene las instrucciones detalladas para el agente de IA encargado de refactorizar los comentarios y actualizar la documentación del repositorio Backend.

**REGLA DE ORO:** Todos los comentarios y documentación generada deben estar estrictamente en Castellano. Ninguna modificación en el código debe alterar la lógica de negocio, el comportamiento de las Cloud Functions, las reglas de seguridad ni la estructura de la base de datos. Todo el proceso debe mantener la compatibilidad con los 3 idiomas soportados por la aplicación.

## Fase 1: Limpieza y Optimización de Comentarios en el Código

**Objetivo:** Asegurar que el código fuente sea autodocumentado, eliminando ruido y añadiendo explicaciones de valor.

* **Paso 1.1: Análisis de `functions/src/`**
    * Inspeccionar cada módulo (`auth`, `chats`, `feed`, `maintenance`, `matcher`, `notifications`, `posts`, `shared`, `storage`, `users`).
    * Eliminar bloques de código comentado que ya no se utilicen (código muerto).
    * Eliminar comentarios obvios que redunden sobre lo que hace el código (ej. `// Guarda el usuario` encima de un `saveUser()`).
* **Paso 1.2: Adición de TSDoc**
    * Añadir o actualizar comentarios en formato TSDoc (`/** ... */`) para todas las funciones exportadas y clases principales.
    * Especificar claramente los parámetros de entrada, el valor de retorno y los posibles errores (throws).
    * Especial atención a las funciones críticas: `secureUniversityRegistration`, `checkPotentialMatches`, `getFilteredFeed` y los triggers de base de datos.
* **Paso 1.3: Documentación de Internacionalización (i18n)**
    * Revisar los archivos en `functions/src/shared/` (especialmente `i18n.ts` y `translate.ts`).
    * Añadir comentarios que expliquen cómo el backend maneja las plantillas y la inyección de variables para los 3 idiomas soportados, asegurando que cualquier desarrollador futuro entienda el flujo de traducción.
* **Paso 1.4: Validación de Pruebas**
    * Verificar que los archivos en `functions/tests/` mantienen comentarios explicativos sobre el *propósito* del test (el "qué" y el "por qué", no el "cómo").
    * Ejecutar la suite de tests (`npm test`) tras los cambios para garantizar que no hay errores de sintaxis introducidos.

## Fase 2: Actualización de la Documentación Oficial

**Objetivo:** Alinear los archivos `.md` de la carpeta `/docs` y el `README.md` con el estado real y actual del código.

* **Paso 2.1: Sincronización de Arquitectura y Estado**
    * Analizar el código actual y compararlo con `docs/architecture.md` y `docs/implementation-status.md`.
    * Actualizar los diagramas lógicos descritos en texto y marcar las funcionalidades implementadas recientemente como "Completadas".
* **Paso 2.2: Actualización de Esquemas y Reglas**
    * Revisar `database/rules/database.rules.json` y actualizar `docs/database.rules.md` para reflejar con exactitud las políticas de lectura/escritura actuales.
    * Actualizar `docs/database.schema.md` incluyendo cualquier nuevo nodo o campo añadido en las colecciones (ej. reportes de posts, notificaciones, chats).
* **Paso 2.3: Documentación de Módulos Específicos**
    * Actualizar `docs/matcher.md` y `docs/feed.md` explicando detalladamente los algoritmos actuales de coincidencia y filtrado, basándose en la lógica leída en `checkPotentialMatches.ts` y `getFilteredFeed.ts`.
    * Verificar que `docs/NOTIFICATION_IMPLEMENTATION.md` refleje el flujo exacto definido en `shared/notifications.ts` y el manejo de tokens FCM.
* **Paso 2.4: Revisión del `README.md`**
    * Comprobar que las instrucciones de configuración, instalación de dependencias, comandos de despliegue y scripts (`database/seed`) sean precisas y funcionen con la versión actual del proyecto.