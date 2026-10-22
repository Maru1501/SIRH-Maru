# Control horario · SIRH-Maru

App web para llevar el control horario diario, el banco de horas (0 a 70 h) y el banco de vacaciones.

- **Semana**: tablero lunes a viernes, con meta semanal, avisos y saldo del banco.
- **Carga anual**: todos los días laborables del año, con carga por rango y guardado por mes o todo junto.
- **Banco de horas** y **Vacaciones**: saldo e historial de movimientos.
- **Configuración**: conexión a la base Neon (PostgreSQL) y copias en JSON.

Se publica con GitHub Pages (rama `main`, carpeta raíz). La cadena de conexión a Neon se pega en la app y queda guardada solo en el navegador de quien la usa.

Casos de prueba de las reglas: `npm test`.
