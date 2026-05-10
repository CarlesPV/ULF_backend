# Arquitectura: Algoritmo Matcher (RF06)

## 1. Descripción General
El algoritmo Matcher es el motor de inferencia de ULF. Su objetivo (RF06) es buscar coincidencias activas en la base de datos antes de permitir a un usuario publicar un "Objeto Encontrado", evitando duplicados y facilitando emparejamientos inmediatos.

Actualmente se encuentra en su **Fase 1 (In-Memory Scoring)** ejecutándose como una Callable Cloud Function.

La implementación actual ya evita leer todos los posts del centro: primero consulta el índice secundario `/active_posts/{center_id}` y después recupera en paralelo solo los posts que siguen vigentes.

## 2. Flujo de Ejecución (Client-to-Serverless)

1. El usuario en Flutter rellena el formulario de "He encontrado un objeto".
2. Antes de guardar en Realtime Database, Flutter llama a la función `checkPotentialMatches`.
3. El servidor extrae `center_id`, `category`, `type` y opcionalmente `color` y `description`.
4. El servidor lee las claves de `/active_posts/{center_id}` para no descargar posts resueltos, devueltos o borrados lógicamente.
5. Se ejecuta el motor de *Scoring* en memoria.
6. Retorna al cliente un array con los 5 mejores resultados (ID, Título, Foto y Score).

## 3. Modelo de Scoring (Puntuación)

El algoritmo asigna un valor de relevancia (`score`) basado en inferencias exactas y semánticas:

* **Inferencia Base (+1.0):** El objeto tiene el estado `active`, pertenece al mismo `center_id`, el tipo es el opuesto (si busco 'found', filtro por 'lost') y la `category` coincide exactamente.
* **Inferencia por palabras (+0.5 por coincidencia):** Si el frontend envía `color` o `description`, el algoritmo traduce esos términos al idioma común de búsqueda y compara palabras relevantes contra `translated_description` o `description`.

## 4. Estructura de la API (Cloud Function)

**Llamada desde Flutter:**
```dart
final callable = FirebaseFunctions.instance.httpsCallable('checkPotentialMatches');
final result = await callable.call({
  'center_id': 'uab',
  'type': 'found',
  'category': 'keys',
  'color': 'rojo', // Opcional
  'description': 'llavero con cinta' // Opcional
});
```

### Respuesta del Servidor:

```json
{
  "matches": [
    {
      "id": "post_xyz789",
      "title": "Llavero rojo con cinta",
      "score": 1.5,
      "photo_path": "posts/uab/post_xyz789/foto.jpg"
    }
  ]
}
```

## Estado de Calidad
La optimización por `/active_posts` ya está implementada. Lo pendiente no es rehacer el matcher, sino añadir tests automatizados para los casos base: coincidencia exacta, coincidencia por palabra traducida y respuesta vacía cuando no hay candidatos.
