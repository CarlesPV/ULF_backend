# UniLost & Found (ULF) - Storage Rules (v2)

Documentación de las reglas de seguridad de Firebase Storage actualizadas para la Iteración 3. El archivo de reglas se encuentra en `storage/rules/storage.rules`.

## Conceptos clave de Seguridad y Optimización

- **Restricción de Tamaño:** Límite global de **5MB** por archivo para optimizar el almacenamiento y ancho de banda.
- **Formatos Permitidos:** Solo se permiten subidas desde el cliente en formato **JPEG y PNG**.
- **Optimización Automática (WebP):** Se utiliza la extensión de Firebase **"Resize Images"** para procesar todas las subidas.
    - Las imágenes se redimensionan a un máximo de **1080x1080**.
    - Se convierten automáticamente a formato **WebP** para máxima eficiencia.
    - El archivo original (JPG/PNG) se elimina automáticamente tras la conversión.
- **Aislamiento por Directorios:** Los archivos se dividen en `/posts` y `/profiles`.

## Código de Reglas

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    
    function isVerifiedUser() {
      return request.auth != null && request.auth.token.email_verified == true;
    }

    // Objetos perdidos / encontrados
    match /posts/{fileName} {
      allow read: if isVerifiedUser();
      allow write: if isVerifiedUser() 
                   && request.resource.size < 5 * 1024 * 1024
                   && request.resource.contentType.matches('image/(jpeg|png)');
    }
    
    // Fotos de perfil
    match /profiles/{userId} {
      allow read: if isVerifiedUser();
      allow write: if isVerifiedUser() 
                   && request.auth.uid == userId
                   && request.resource.size < 5 * 1024 * 1024
                   && request.resource.contentType.matches('image/(jpeg|png)');
    }
  }
}
```

## Consideraciones para el Frontend (Flutter)

1. **Formatos de subida**: La app debe asegurar que las imágenes capturadas o seleccionadas se envíen como `image/jpeg` o `image/png`. Si se intenta subir un `webp` u otro formato directamente, Storage devolverá un error `403`.

2. **Consumo de imágenes**: Tras la subida, el backend (vía extensión) reemplazará el archivo por su versión `.webp`. El cliente debe estar preparado para manejar esta transición o solicitar directamente la versión optimizada.

3. **Límite de 5MB**: Si el payload supera el límite de 5MB, Storage rechazará la petición. Se recomienda compresión local previa en el dispositivo.