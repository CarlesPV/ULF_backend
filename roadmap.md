## Tareas Pendientes: Internacionalización y Documentación (Agente IA)

### 1. Verificación y Completitud de Traducciones (Backend)
**Objetivo:** Asegurar que todos los procesos de backend que interactúan con el usuario (notificaciones, correos, errores, o utilidades de traducción) soporten correctamente los 3 idiomas.

**Instrucciones Atómicas:**
1. **Auditoría de Utilidades de Traducción:** Revisar el archivo `functions/src/shared/translate.ts` para verificar la robustez de las integraciones de traducción automática o diccionarios estáticos.
2. **Revisión de Notificaciones y Mensajes:** Analizar funciones de disparo (Triggers) como `postTriggers.ts`, `onMessageCreated.ts` y utilidades en `notifications/` para asegurar que los mensajes *push* enviados al frontend estén localizados o envíen las claves correctas (payload) para que el frontend los traduzca.
3. **Validación de Respuestas de Error:** Comprobar que las Cloud Functions (ej. `secureUniversityRegistration.ts`, procesos del `matcher`, etc.) devuelvan códigos de error estandarizados en lugar de strings en un solo idioma, delegando la traducción final al frontend o resolviéndola según el idioma del usuario.
4. **Pruebas Unitarias (i18n):** Implementar o actualizar los tests en `functions/test/` para validar que el sistema responde de forma segura y consistente cuando se simulan peticiones en los 3 idiomas manejados.

### 2. Actualización Integral de la Documentación (Backend)
**Objetivo:** Mantener sincronizada la documentación técnica (`docs/`) con el estado actual del código en producción y desarrollo.

**Instrucciones Atómicas:**
1. **Esquema de Base de Datos:** Leer el código de inicialización (`seed_db.ts`, `data/centers.json`) y las funciones de lectura/escritura para actualizar `docs/database.schema.md` con las colecciones y documentos exactos que existen hoy.
2. **Reglas de Seguridad:** Analizar `database.rules.json` y el archivo `storage.rules`. Actualizar `docs/database.rules.md` y `docs/storage.rules.md` explicando de forma sencilla qué permite y qué restringe cada regla.
3. **Mapa de Cloud Functions:** Revisar `functions/src/index.ts` y documentar en `docs/architecture.md` (o `implementation-status.md`) cada función exportada, su método de disparo (HTTP, Firestore trigger, etc.) y su propósito principal (ej. *matcher*, *feed*, *posts*, *chats*).
4. **Instrucciones de Mantenimiento:** Actualizar el `README.md` con los comandos necesarios para desplegar las reglas, los índices, emular las funciones en local y ejecutar la suite de pruebas con Jest.