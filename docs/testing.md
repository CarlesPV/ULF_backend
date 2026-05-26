# Testing Backend

El backend tiene dos niveles de pruebas: unitarias con mocks e integración con Firebase Emulator Suite. La idea es que los unitarios detecten errores rápidos de lógica aislada y los de integración validen flujos reales entre Auth, Realtime Database y Cloud Functions sin tocar producción.

## Comandos

Desde `functions/`:

```bash
npm run test:unit
npm run test:integration
npm run test:all
```

| Comando | Qué ejecuta |
| :--- | :--- |
| `npm run test:unit` | Compila TypeScript y ejecuta Jest sobre `tests/unit/`. |
| `npm run test:integration` | Compila, prepara el entorno de test y ejecuta Jest con Firebase Emulator Suite. |
| `npm run test:all` | Ejecuta unitarios e integración en ese orden. |

## Tests Unitarios

Ubicación: `functions/tests/unit/`

Usan Jest y mocks manuales. No levantan emuladores ni conectan con Firebase real. Cubren callables, triggers, helpers compartidos, notificaciones, storage y mantenimiento.

Estado actual en el arbol de tests:

- 20 suites unitarias (`*.test.js`).
- 166 casos declarados con `test(...)` o `it(...)`.

## Tests De Integración

Ubicación: `functions/tests/integration/`

Usan Firebase Emulator Suite con:

- Authentication emulator.
- Realtime Database emulator.
- Functions emulator.

Requisito local y CI:

- Node.js 20.
- Java 21.

Flujos cubiertos:

- Registro universitario con dominio válido, dominio no permitido y email duplicado.
- Creación de posts y validación de geovallado.
- Indexación de posts activos mediante `onPostCreated`.
- Feed filtrado por tipo y categoría.
- Matching básico entre posts `lost` y `found`.
- Creación de chats e índices `user_chats`.
- Trigger `onMessageCreated` actualizando `last_message`.
- Reglas de seguridad de Realtime Database para posts, mensajes y vistas.
- Reglas de seguridad de Storage para posts, perfiles y chats.

La suite evita servicios externos no emulados. No prueba Vision, Translate ni FCM reales.

Estado actual en integracion:

- 6 suites de integracion (`*.integration.test.js`).
- 25 casos declarados con `test(...)` o `it(...)`.

## CI/CD

El workflow `.github/workflows/deploy.yml` separa los checks:

- `backend-unit-tests`
- `backend-integration-tests`

En PR hacia `develop` o `master`, se ejecutan ambos checks pero no hay despliegue. En push a `develop` o `master`, el deploy y el seed solo se ejecutan si las dos suites han pasado.
