# UniLost & Found (ULF) - Storage Rules

Documentación de las reglas de seguridad de Firebase Storage. El archivo de reglas se encuentra en `storage/rules/storage.rules`.

## Conceptos clave

- **`request.auth`**: Objeto del usuario autenticado. `request.auth.uid` es su identificador único.
- **`request.resource`**: Recurso que se está subiendo.
- **`request.resource.contentType`**: MIME type del archivo a subir.
- **`request.resource.size`**: Tamaño en bytes del archivo a subir.
- **`root`**: Referencia a la raíz de la Realtime Database, útil para hacer cross-checks.

## `/posts/{postId}/{imageId}`

```json
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isAuthenticated() {
      return request.auth != null;
    }

    function isValidImage() {
      return request.resource.contentType.matches('image/.*') && request.resource.size < 5 * 1024 * 1024;
    }

    function isImageOwner(postId) {
      return isAuthenticated() && root.child('posts').child(postId).child('user_id').val() == auth.uid;
    }

    match /posts/{postId}/{imageId} {
      allow read: if isAuthenticated();
      allow write: if isImageOwner(postId) && isValidImage();
    }
  }
}
```

| Regla | Decisión |
|:---|:---|
| `allow read` | Cualquier usuario autenticado puede ver las imágenes de posts. Es necesario para que los usuarios puedan ver las fotos de los objetos perdidos/encontrados. |
| `isAuthenticated()` | Helper que verifica que exista un usuario autenticado. |
| `isValidImage()` | Helper que valida que el archivo sea una imagen (MIME type `image/.*`) y que pese menos de 5MB. Limita la carga de archivos maliciosos o muy pesados. |
| `isImageOwner(postId)` | Helper que hace un cross-check con la Realtime Database para verificar que `auth.uid` coincide con el `user_id` del post. Esto evita que usuarios maliciosos suban imágenes a posts de otros usuarios. |
| `allow write` | Solo el propietario del post puede subir imágenes, y debe ser una imagen válida < 5MB. |

## Consideraciones de seguridad

1. **Cross-reference con Realtime Database**: Se consulta `/posts/{postId}/user_id` para verificar propiedad. Esto es seguro porque las Security Rules de la Realtime Database ya prohíben modificar el `user_id` de un post existente.

2. **Validación de contenido**: La restricción de MIME type y tamaño protege contra:
  - Subida de archivos ejecutables
  - Ataques de denegación de servicio por archivos muy grandes
