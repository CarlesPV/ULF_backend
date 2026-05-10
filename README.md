# ULF Backend

Backend serverless de UniLost & Found sobre Firebase Functions, Realtime Database y Storage.

## Documentación
* `docs/architecture.md`: arquitectura del backend y flujo de registro seguro.
* `docs/database.schema.md`: estructura de datos principal.
* `docs/database.rules.md`: reglas actuales de Realtime Database y pendientes de endurecimiento.
* `docs/feed.md`: diseño del feed filtrado con `/active_posts`.
* `docs/matcher.md`: algoritmo de coincidencias y optimización actual.
* `docs/implementation-status.md`: estado real auditado y próximas fases.

## Estado Actual
RF13 (`updatePostStatus`) y RF19 (`recordPostView`) ya están implementados y exportados. El matcher ya usa el índice `/active_posts`; lo pendiente es añadir tests, endurecer validaciones y conectar la calidad al CI.
