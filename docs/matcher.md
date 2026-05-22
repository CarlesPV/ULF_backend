# Matcher de coincidencias

`checkPotentialMatches` busca posibles coincidencias entre posts `lost` y `found` activos antes de que el cliente publique definitivamente.

## Flujo

1. Valida usuario autenticado con email verificado.
2. Requiere `center_id`, `category` y `type`.
3. Calcula el tipo opuesto: si llega `found`, busca `lost`; si llega `lost`, busca `found`.
4. Lee IDs desde `/active_posts/{center_id}/{targetType}`.
5. Recupera posts en paralelo.
6. Traduce `title` y `description` del post origen al idioma base (`es`) cuando existen.
7. Tokeniza texto ignorando palabras cortas y stop words.
8. Filtra candidatos por tipo opuesto, misma categoria y no borrados.
9. Calcula score y devuelve hasta 5 resultados ordenados.

## Payload

| Campo | Tipo | Requerido | Descripcion |
| :--- | :--- | :--- | :--- |
| `center_id` | `string` | Si | Centro. |
| `category` | `string` | Si | Categoria exacta. |
| `type` | `lost` o `found` | Si | Tipo del post origen. |
| `title` | `string` | No | Mejora coincidencia por titulo. |
| `description` | `string` | No | Mejora coincidencia por descripcion. |
| `location` | `string` | No | Aceptado por el payload; no aporta puntuacion directa en la version actual. |
| `postImageUrl` / `imageUrl` / `photo_url` | `string` | No | Activa bonus si ambos posts tienen imagen. |
| `created_at` | `number` | No | Usado para proximidad temporal. |

No existe parametro `notifyMatches` en el codigo actual y esta callable no envia notificaciones. Las notificaciones automaticas de matches se hacen en `onPostCreated`.

## Scoring

Constantes actuales:

| Componente | Maximo |
| :--- | :--- |
| Titulo | `1.0` |
| Descripcion | `0.5` |
| Imagen | `0.25` |
| Fecha | `0.2` |
| Umbral minimo | `0.5` |

El score combina:

- ratio de tokens de titulo encontrados en `translated_title` o `title`;
- ratio de tokens de descripcion encontrados en `translated_description` o `description`;
- bonus si origen y candidato tienen imagen;
- decaimiento exponencial por diferencia de dias.

## Ejemplo

```dart
final callable = FirebaseFunctions.instance.httpsCallable('checkPotentialMatches');
final result = await callable.call({
  'center_id': 'uab',
  'type': 'found',
  'category': 'keys',
  'title': 'Llavero rojo',
  'description': 'llavero con cinta',
  'postImageUrl': 'pending',
  'created_at': DateTime.now().millisecondsSinceEpoch,
});
```

Respuesta:

```json
{
  "matches": [
    {
      "id": "post_xyz789",
      "title": "Llavero rojo perdido",
      "description": "Perdido cerca de biblioteca",
      "score": 1.2,
      "photo_path": "posts/post_xyz789/foto.webp",
      "postImageUrl": "https://..."
    }
  ]
}
```
