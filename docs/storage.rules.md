# UniLost & Found (ULF) - Storage Rules (v2)

Documentación de las reglas de seguridad de Firebase Storage actualizadas para la Iteración 3. El archivo de reglas se encuentra en `storage/rules/storage.rules`.

## Conceptos clave de Seguridad

- **Restricción de Tamaño Dinámica:** Implementamos la función `isImageBelowSize(maxSizeMB)` para asignar cuotas distintas según el caso de uso (3MB para perfiles, 6MB para publicaciones).
- **Aislamiento por Directorios:** Los archivos se dividen estrictamente en `/posts` y `/profiles`.
- **Estructura de Posts:** La ruta `/posts/{centerId}/{postId}/` facilita el borrado masivo si una universidad (`centerId`) se da de baja de la plataforma, evitando escaneos costosos.

## Código de Reglas

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    
    function isAuthenticated() {
      return request.auth != null;
    }

    function isImageBelowSize(maxSizeMB) {
      return request.resource.contentType.matches('image/.*') 
             && request.resource.size < maxSizeMB * 1024 * 1024;
    }

    // ---------------------------------------------------------
    // CARPETA: PUBLICACIONES (Objetos Perdidos/Encontrados)
    // ---------------------------------------------------------
    match /posts/{centerId}/{postId}/{imageId} {
      allow read: if isAuthenticated();
      // Límite de 6MB por foto de publicación
      allow create, update: if isAuthenticated() && isImageBelowSize(6);
      allow delete: if isAuthenticated(); // Ownership validado en Backend/Flutter
    }

    // ---------------------------------------------------------
    // CARPETA: PERFILES DE USUARIO
    // ---------------------------------------------------------
    match /profiles/{userId}/{imageId} {
      allow read: if isAuthenticated();
      // Límite más estricto (3MB) y validación de propiedad absoluta
      allow write: if isAuthenticated() && request.auth.uid == userId && isImageBelowSize(3);
    }
  }
}
```

## Consideraciones para el Frontend (Flutter)

1. **Compresión previa**: La app debe usar paquetes como `flutter_image_compress` antes de subir la imagen. Si el payload supera el límite de la regla (3MB o 6MB), Storage rechazará la petición con un error `403 Permission Denied`.

2. **Nomenclatura**: Las imágenes de perfil deben subirse a la ruta `profiles/{uid}/{uid}.jpg` para facilitar sobrescrituras limpias sin generar archivos huérfanos.