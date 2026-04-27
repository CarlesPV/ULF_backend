# Arquitectura: Feed Filtrado (RF08)

## 1. Descripción General
El feed filtrado (RF08) permite al cliente Flutter consultar publicaciones por universidad, tipo (`lost` / `found`), categoría y palabras clave. La lógica de filtrado vive en una **Callable Cloud Function** (`getFilteredFeed`) para evitar descargar la colección `/posts` completa al móvil.

El buscador es **multiidioma**: el término introducido por el usuario se traduce al idioma común (`en`) y se compara contra el campo `translated_description` que ya genera el trigger `onPostCreated`.

## 2. Estrategia de Escalabilidad

Firebase Realtime Database no admite consultas compuestas (no se puede combinar `center_id == X` con `status == 'active'` en una sola query). Si se filtrase únicamente por `center_id`, con el tiempo se cargarían en memoria del servidor todos los posts históricos (`matched`, `returned`, borrados lógicos) solo para descartarlos.

Para evitarlo, se mantiene un **índice secundario** en `/active_posts/{center_id}/{post_id}` (ver `database.schema.md`). Este índice solo contiene posts vigentes y se sincroniza mediante tres triggers:

| Trigger | Acción sobre el índice |
| :--- | :--- |
| `onPostCreated` | Añade el post si nace `active` y no borrado. |
| `onPostUpdated` | Añade o elimina según el nuevo `status` / `is_deleted`. |
| `onPostDeleted` | Elimina la entrada ante un borrado físico. |

Así, la consulta principal escala con el número de **posts activos por universidad**, no con el histórico global de la plataforma.

## 3. Flujo de Ejecución

1. Flutter llama a `getFilteredFeed` con los filtros activos.
2. La función valida autenticación y los parámetros obligatorios (`center_id`, `type`).
3. Lee las claves de `/active_posts/{center_id}` (escaneo acotado).
4. Recupera los posts completos en paralelo con `Promise.all`.
5. Si hay `search_term`, lo traduce al idioma común.
6. Filtra en memoria por `type`, `category` y coincidencia de palabras clave contra `title + translated_description`.
7. Ordena por `created_at` descendente y aplica el límite `max_results` (50 por defecto).
8. Devuelve la lista lista para renderizar.

## 4. Estructura de la API (Cloud Function)

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| :--- | :--- | :--- | :--- |
| `center_id` | `string` | Sí | Universidad sobre la que se consulta. |
| `type` | `'lost' \| 'found'` | Sí | Feed de objetos perdidos o encontrados. |
| `category` | `string` | No | Filtra por una categoría concreta (ej. `keys`). |
| `search_term` | `string` | No | Texto libre. Se traduce al idioma común antes de buscar. Se ignoran palabras de menos de 3 caracteres. |
| `max_results` | `number` | No | Tope de resultados devueltos. Por defecto 50. |

### Llamada desde Flutter

```dart
final callable = FirebaseFunctions.instance.httpsCallable('getFilteredFeed');
final result = await callable.call({
  'center_id': 'center_id_001',
  'type': 'lost',
  'category': 'keys',         // Opcional
  'search_term': 'llaves rojas', // Opcional
  'max_results': 50           // Opcional
});
```

### Respuesta del Servidor

```json
{
  "feed": [
    {
      "id": "post_xyz789",
      "user_id": "uid_abc123",
      "center_id": "center_id_001",
      "type": "lost",
      "title": "Llavero rojo con cinta",
      "description": "Perdí mis llaves cerca del aulario.",
      "translated_description": "i lost my keys near the classroom building.",
      "category": "keys",
      "status": "active",
      "coords": { "lat": 1.123, "lng": 1.123 },
      "photo_path": "posts/post_xyz789.jpg",
      "created_at": 1705325000000,
      "updated_at": 1705325000000,
      "is_deleted": false
    }
  ]
}
```
