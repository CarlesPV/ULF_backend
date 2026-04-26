# Arquitectura: Algoritmo Matcher (RF06)

## 1. Descripción General
El algoritmo Matcher es el motor de inferencia de ULF. Su objetivo (RF06) es buscar coincidencias activas en la base de datos antes de permitir a un usuario publicar un "Objeto Encontrado", evitando duplicados y facilitando emparejamientos inmediatos.

Actualmente se encuentra en su **Fase 1 (In-Memory Scoring)** ejecutándose como una Callable Cloud Function.

## 2. Flujo de Ejecución (Client-to-Serverless)

1. El usuario en Flutter rellena el formulario de "He encontrado un objeto".
2. Antes de guardar en Realtime Database, Flutter llama a la función `checkPotentialMatches`.
3. El servidor extrae `center_id`, `category`, `type` y opcionalmente `color`.
4. El servidor realiza un pre-filtro indexado en RTDB por `center_id` para no descargar toda la BD.
5. Se ejecuta el motor de *Scoring* en memoria.
6. Retorna al cliente un array con los 5 mejores resultados (ID, Título, Foto y Score).

## 3. Modelo de Scoring (Puntuación)

El algoritmo asigna un valor de relevancia (`score`) basado en inferencias exactas y semánticas:

* **Inferencia Base (+1.0):** El objeto tiene el estado `active`, pertenece al mismo `center_id`, el tipo es el opuesto (si busco 'found', filtro por 'lost') y la `category` coincide exactamente.
* **Inferencia de Color (+0.5):** Si el frontend envía un parámetro de color, el algoritmo realiza una búsqueda `toLowerCase().includes()` dentro de la descripción del objeto perdido. Si hay un "hit", la confianza aumenta.

## 4. Estructura de la API (Cloud Function)

**Llamada desde Flutter:**
```dart
final callable = FirebaseFunctions.instance.httpsCallable('checkPotentialMatches');
final result = await callable.call({
  'center_id': 'uab',
  'type': 'found',
  'category': 'keys',
  'color': 'rojo' // Opcional
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