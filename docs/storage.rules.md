# UniLost & Found (ULF) - Storage Rules

Documentación de las reglas de seguridad de Firebase Storage. El archivo de reglas se encuentra en `storage/rules/storage.rules`.

## Conceptos clave

- **`request.auth`**: Objeto del usuario autenticado. `request.auth.uid` es su identificador único.
- **`request.resource`**: Recurso que se está subiendo (disponible en `create` y `update`, es `null` en `delete`).
- **`request.resource.contentType`**: MIME type del archivo a subir.
- **`request.resource.size`**: Tamaño en bytes del archivo a subir.

> **Nota:** Firebase Storage rules **no tienen acceso a la Realtime Database**. La variable `root` solo existe en las reglas de la Realtime Database, no en Storage. La verificación de propiedad (ownership) de un post debe hacerse a nivel de backend o Cloud Functions.

## `/posts/{postId}/{imageId}`

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isAuthenticated() {
      return request.auth != null;
    }

    function isValidImage() {
      return request.resource.contentType.matches('image/.*') && request.resource.size < 5 * 1024 * 1024;
    }

    match /posts/{postId}/{imageId} {
      allow read: if isAuthenticated();
      allow create, update: if isAuthenticated() && isValidImage();
      allow delete: if isAuthenticated();
    }
  }
}
```

| Regla | Decisión |
|:---|:---|
| `allow read` | Cualquier usuario autenticado puede ver las imágenes de posts. Necesario para mostrar fotos de objetos perdidos/encontrados. |
| `isAuthenticated()` | Helper que verifica que exista un usuario autenticado via `request.auth`. |
| `isValidImage()` | Helper que valida que el archivo sea una imagen (MIME type `image/.*`) y que pese menos de 5MB. Previene subida de archivos maliciosos o muy pesados. |
| `allow create, update` | Solo usuarios autenticados pueden subir o reemplazar imágenes, y deben cumplir `isValidImage()`. Se separa de `delete` porque `request.resource` es `null` al borrar. |
| `allow delete` | Cualquier usuario autenticado puede borrar imágenes. La validación de propiedad debe aplicarse en el backend. |

## Consideraciones de seguridad

1. **Sin ownership check en Storage**: Firebase Storage no puede hacer cross-reference con la Realtime Database. El control de que solo el dueño del post pueda subir/borrar imágenes debe aplicarse en el backend (Cloud Functions o endpoint propio) antes de realizar la operación.

2. **Validación de contenido**: La restricción de MIME type y tamaño protege contra:
  - Subida de archivos ejecutables o no permitidos
  - Ataques de denegación de servicio por archivos muy grandes

3. **`allow create, update` vs `allow write`**: Se usa la forma explícita para poder aplicar `isValidImage()` solo en operaciones donde `request.resource` existe. Usar `allow write` con validaciones sobre `request.resource` rompería las operaciones de `delete`.
