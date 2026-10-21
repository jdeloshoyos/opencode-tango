# Tango Generator

Este repositorio implementa un generador de puzzles estilo Tango, inspirado en el juego de lógica de LinkedIn. El proyecto combina una lógica de generación de tableros con una interfaz jugable sencilla para resolver los puzzles en pantalla.

## ¿Qué contiene este repositorio?

- [tango_generator.py](tango_generator.py): módulo principal con la lógica del generador de puzzles.
  - Genera una grilla 6x6 válida.
  - Deriva pistas de celdas y bordes.
  - Reduce las pistas manteniendo que la solución siga siendo única.
  - Valida si el puzzle es resoluble por deducción pura.

- [tango_game.py](tango_game.py): versión jugable del proyecto usando pyglet.
  - Muestra el puzzle en una ventana interactiva.
  - Permite marcar celdas y borrar valores.
  - Revisa si el tablero cumple con las reglas del juego.

- [pyproject.toml](pyproject.toml): configuración del proyecto y dependencias.

## Requisitos

- Python 3.13 o superior
- Dependencia principal: pyglet

## Instalación

Desde la raíz del proyecto, instala las dependencias con:

```bash
python -m pip install -e .
```

Si prefieres instalar sólo la dependencia necesaria manualmente:

```bash
python -m pip install pyglet
```

## Cómo iniciar el programa

Para abrir la versión jugable del juego, ejecuta:

```bash
python tango_game.py
```

Esto abrirá una ventana interactiva donde podrás:

- hacer clic izquierdo para alternar entre sol, luna y celda vacía;
- hacer clic derecho para borrar una celda ingresada;
- presionar N para generar un puzzle nuevo;
- presionar R para reiniciar el puzzle actual;
- presionar ESC para cerrar la ventana.

## Uso desde Python

También puedes importar el generador directamente desde Python:

```python
from tango_generator import generar_puzzle

resultado = generar_puzzle()
print(resultado['solucion'])
```

El resultado incluye:

- `solucion`: la grilla completa válida;
- `celdas`: pistas iniciales de celdas;
- `bordes_h` y `bordes_v`: pistas de borde;
- `intentos`: cuántos intentos fueron necesarios para generar el puzzle.

## Reglas del puzzle

El tablero es una grilla 6x6 con estas reglas:

- cada fila y cada columna debe tener exactamente 3 soles y 3 lunas;
- no pueden haber 3 símbolos iguales consecutivos en una fila ni en una columna;
- los bordes indican si dos celdas vecinas deben ser iguales o distintas.

## Notas

El proyecto está pensado como una demostración de generación y validación de puzzles de lógica, y como base para construir una experiencia de juego más completa.
