# Estado de Implementación Backend

Fecha de revisión: 10 de mayo de 2026.

## Estado Real
| Área | Estado | Evidencia |
| :--- | :--- | :--- |
| Reglas RTDB | Parcial | `database/rules/database.rules.json` existe y protege nodos principales, pero todavía falta endurecer enums y tipos de `/posts`. |
| RF13 Gestión de estados | Implementado, pendiente de endurecer | `updatePostStatus` existe y está exportada. Falta validar `newStatus` contra el enum permitido y bloquear posts borrados. |
| RF19 Historial de vistas | Implementado, pendiente de endurecer | `recordPostView` existe y está exportada. Falta validar `postId` y comprobar que el post exista antes de escribir. |
| Matcher optimizado | Implementado | `checkPotentialMatches` usa `/active_posts/{center_id}` y recupera posts activos en paralelo. |
| Tests automatizados | Pendiente | No hay carpeta de tests ni script `npm test` en `functions/package.json`. |
| CI de calidad | Pendiente | GitHub Actions compila y despliega, pero no ejecuta tests. |

## Próximas Fases
1. Añadir infraestructura de tests y primeros casos de bajo riesgo.
2. Endurecer las funciones callable de posts.
3. Endurecer reglas de Realtime Database.
4. Conectar tests al pipeline antes del despliegue.

## Criterio de Auditoría
Cada fase debe vivir en una rama separada y producir una PR pequeña. La intención es que cada revisión humana pueda responder fácilmente:

* qué requisito cubre,
* qué archivos cambian,
* qué riesgo introduce,
* cómo se verificó.
