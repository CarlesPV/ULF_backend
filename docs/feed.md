# Feed filtrado

`getFilteredFeed` permite consultar posts activos por centro y tipo sin descargar todo `/posts`.

## Flujo

1. Valida usuario autenticado con email verificado.
2. Requiere `center_id`. El tipo `type` es opcional (si se omite, busca tanto `lost` como `found`).
3. Lee claves desde `/active_posts/{center_id}/{type}` (o de ambos tipos si no se especifica) ordenadas por valor.
4. Recupera los posts completos en paralelo.
5. Filtra por `type` opcional, `category` opcional y `search_term` opcional.
6. Si hay `search_term`, lo traduce a `DEFAULT_LANGUAGE` (`es`) y lo tokeniza.
7. Busca los tokens en `title`, `description`, `translated_description` y `vision_labels`.
8. Ordena por distancia si `sortBy == "distance"` y hay `latitude` / `longitude`, o si `sort_by == "distance"` y hay `user_lat` / `user_lng`. Si no, por `created_at` descendente.
9. Aplica `max_results` (50 por defecto).

## Payload

| Campo | Tipo | Requerido | Descripcion |
| :--- | :--- | :--- | :--- |
| `center_id` | `string` | Si | Centro, por ejemplo `uab`. |
| `type` | `lost` o `found` | No | Tipo de feed (opcional). |
| `category` | `string` | No | Categoria exacta. |
| `search_term` | `string` | No | Texto libre traducido al idioma base antes de comparar. |
| `max_results` | `number` | No | Limite, por defecto 50. |
| `latitude` | `number` | No | Latitud del usuario para la ordenación por distancia actual (`sortBy === "distance"`). |
| `longitude` | `number` | No | Longitud del usuario para la ordenación por distancia actual (`sortBy === "distance"`). |
| `sortBy` | `recent` o `distance` | No | Método de ordenación actual. |
| `user_lat` | `number` | No | Latitud para la ordenación por distancia heredada (`sort_by === "distance"`). |
| `user_lng` | `number` | No | Longitud para la ordenación por distancia heredada (`sort_by === "distance"`). |
| `sort_by` | `date` o `distance` | No | Método de ordenación heredado. |

## Ejemplo Flutter

```dart
final callable = FirebaseFunctions.instance.httpsCallable('getFilteredFeed');
final result = await callable.call({
  'center_id': 'uab',
  'type': 'lost',
  'category': 'keys',
  'search_term': 'llaves rojas',
  'max_results': 50,
});
```

## Respuesta

```json
{
  "feed": [
    {
      "id": "post_xyz789",
      "user_id": "uid_abc123",
      "center_id": "uab",
      "type": "lost",
      "title": "Llavero rojo",
      "description": "Perdido cerca de biblioteca",
      "translated_description": "perdido cerca de biblioteca",
      "category": "keys",
      "status": "active",
      "coords": { "lat": 41.5, "lng": 2.1, "geohash": "sp3..." },
      "imageUrl": "https://...",
      "vision_labels": ["key", "metal"],
      "created_at": 1715731200000,
      "updated_at": 1715731200000,
      "is_deleted": false
    }
  ]
}
```
