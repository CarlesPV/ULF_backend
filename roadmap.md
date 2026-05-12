# Roadmap de Backend (Firebase & Cloud Functions)

Este documento detalla las tareas atómicas a ejecutar por el agente de IA para solucionar los bugs y añadir las nuevas funcionalidades requeridas. 

## 1. Soporte para Nuevas Categorías
* **Objetivo**: Ampliar el esquema de base de datos y validaciones para permitir las nuevas categorías de objetos.
* **Archivos implicados**: `database/rules/database.rules.json` (o `firestore.rules`), `functions/src/shared/types.ts`.
* **Instrucciones**:
    1. Actualizar el enum o los tipos en `types.ts` para la entidad de posts/objetos incluyendo el array exacto: `["accessories", "clothes", "devices", "wallets", "keys", "bags", "study", "others"]`.
    2. Actualizar las reglas de seguridad de Firestore/Realtime Database para permitir la escritura de posts solo si el campo `category` pertenece a la nueva lista permitida.
    3. Asegurar que las funciones de validación previas a la creación de posts (`functions/src/posts/postTriggers.ts` u otras) validen correctamente estas nuevas categorías.

## 2. Corrección de Subida de Imágenes en Publicaciones y Optimización
* **Objetivo**: Restringir la subida de imágenes a formatos JPG/PNG, limitar el peso a 5MB y automatizar su redimensionamiento y conversión a WebP para ahorrar espacio en la base de datos sin perder calidad.
* **Archivos implicados**: `storage/rules/storage.rules`, `docs/storage.rules.md` y configuración de Firebase Extensions.
* **Instrucciones**:
    1. Modificar `storage/rules/storage.rules` para establecer el límite dinámico de tamaño a 5MB: `request.resource.size < 5 * 1024 * 1024`.
    2. Actualizar la misma regla para restringir estrictamente los tipos MIME permitidos desde el cliente solo a JPEG y PNG: `request.resource.contentType.matches('image/(jpeg|png)')`.
    3. Configurar la extensión oficial de Firebase **"Resize Images"** (`firebase/storage-resize-images`):
        * Configurar los tamaños máximos requeridos (ej. `1080x1080` para optimizar sin perder detalle).
        * Establecer la opción **"Image type for resized images"** en `webp`.
        * Habilitar la opción **"Delete original file"** para eliminar la imagen JPG/PNG original y conservar únicamente la versión WebP.
    4. Actualizar `docs/storage.rules.md` para reflejar el nuevo límite de 5MB, los formatos permitidos y documentar el flujo de conversión automática a WebP.

## 3. Revisión General y Seguridad
* **Instrucciones**:
    1. Ejecutar el linter para comprobar errores.
    2. Verificar que las Cloud Functions no expongan información sensible.
    3. Asegurar el rendimiento óptimo de las consultas a base de datos necesarias para los filtros.