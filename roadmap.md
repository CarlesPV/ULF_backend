# Roadmap de Implementación y Corrección - Backend (Firebase)

## 1. Unificación de Lógica de Ubicación (Radio vs Bounding Box)
**Objetivo:** Solucionar el error de `status: rejected` eliminando la discrepancia matemática entre la interfaz gráfica (radio/círculo) y el validador del backend (rectángulo).
* **Archivos objetivo:** `functions/src/posts/createPostReport.ts` y `functions/src/posts/postTriggers.ts`.
* **Tareas Atómicas:**
    1.  **Eliminación del Conflicto de Geometría:** Localizar la validación por `bounds` (el rectángulo generado por `latMin/latMax` y `lngMin/lngMax`). Como el frontend dibuja un área circular (radio), el validador de `bounds` del backend "corta" las áreas curvas del círculo, rechazando pines válidos. Se debe **eliminar** o saltar la validación de `bounds` estricta, y hacer que la validación por **distancia Haversine (radio)** sea la única fuente de la verdad para determinar si el punto está dentro del recinto.

## 2. Actualización de Reglas de Seguridad de Edición (Permission Denied)
**Objetivo:** Permitir la edición de todas las publicaciones solucionando las restricciones estrictas en las reglas de la base de datos.
* **Archivos objetivo:** `database/rules/database.rules.json`
* **Tareas Atómicas:**
    1.  **Soporte para el Ciclo Completo de Estados:** El error al editar ocurre porque la regla actual para el nodo `status` en `posts` solo valida la expresión regular `^(active|matched|returned)$`. Si una publicación fue marcada como `rejected` (por los triggers) o tiene otro estado de revisión, la base de datos bloquea cualquier intento de actualización de la misma (incluso si solo se edita el título). Actualizar la expresión regular en `.validate` de `status` para incluir todos los estados reales del sistema (ej. `^(active|matched|returned|rejected|pending)$`).