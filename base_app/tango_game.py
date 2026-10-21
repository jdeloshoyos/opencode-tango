"""
Tango - Implementación jugable con pyglet
==========================================

Usa tango_generator.generar_puzzle() para crear el estado inicial, y expone
un loop de juego simple:

    - Click izquierdo sobre una celda vacía: alterna ☀ -> 🌙 -> vacío -> ☀ ...
    - Click derecho sobre una celda: la borra (si no es una pista fija)
    - Tecla N: genera un puzzle nuevo
    - Tecla R: reinicia el puzzle actual a su estado inicial (borra lo jugado)
    - Tecla ESC: cierra la ventana

Requiere: pip install pyglet
"""

import math
import pyglet
from pyglet import shapes
from pyglet.window import mouse, key

import tango_generator as tg


# ----------------------------------------------------------------------
# Configuración visual
# ----------------------------------------------------------------------

CELL = 90
MARGIN = 40
TOP_BAR = 60
BOTTOM_BAR = 40

GRID_PIX = CELL * tg.N
WIDTH = GRID_PIX + MARGIN * 2
HEIGHT = GRID_PIX + MARGIN * 2 + TOP_BAR + BOTTOM_BAR

COLOR_BG = (250, 248, 240)
COLOR_LINE_FUERTE = (55, 55, 65)
COLOR_LINE_SUAVE = (170, 170, 180)
COLOR_SUN = (235, 165, 40)
COLOR_MOON = (65, 75, 125)
COLOR_FIXED_BG = (228, 224, 210)
COLOR_INVALIDA = (230, 90, 90)
COLOR_TEXTO = (40, 40, 45, 255)
COLOR_GANADO = (35, 140, 70, 255)
COLOR_BADGE_BG = (255, 255, 255)
COLOR_BADGE_TXT = (35, 35, 40, 255)


class TangoWindow(pyglet.window.Window):

    def __init__(self):
        super().__init__(WIDTH, HEIGHT, caption="Tango (clon)")
        r, g, b = COLOR_BG
        pyglet.gl.glClearColor(r / 255, g / 255, b / 255, 1.0)

        self.titulo_label = pyglet.text.Label(
            "TANGO", x=WIDTH / 2, y=HEIGHT - TOP_BAR / 2 + 10,
            anchor_x='center', anchor_y='center',
            font_size=22, weight='bold', color=(50, 50, 60, 255)
        )
        self.instrucciones_label = pyglet.text.Label(
            "Click izq: cambiar simbolo · Click der: borrar · N: nuevo · R: reiniciar",
            x=WIDTH / 2, y=HEIGHT - TOP_BAR / 2 - 14,
            anchor_x='center', anchor_y='center',
            font_size=10, color=(90, 90, 100, 255)
        )
        self.estado_label = pyglet.text.Label(
            "", x=WIDTH / 2, y=BOTTOM_BAR / 2,
            anchor_x='center', anchor_y='center',
            font_size=13, weight='bold', color=COLOR_GANADO
        )

        self.nuevo_puzzle()

    # ------------------------------------------------------------------
    # Estado del juego
    # ------------------------------------------------------------------

    def nuevo_puzzle(self):
        self.estado_label.text = "Generando puzzle..."
        resultado = tg.generar_puzzle()

        self.solucion = resultado['solucion']
        self.celdas_fijas = resultado['celdas']       # dict {(r,c): SUN/MOON}
        self.bordes_h = resultado['bordes_h']         # dict {(r,c): '='/'X'}
        self.bordes_v = resultado['bordes_v']

        # Estado jugable: parte con las celdas fijas, el resto vacío (None)
        self.grid = [
            [self.celdas_fijas.get((r, c)) for c in range(tg.N)]
            for r in range(tg.N)
        ]
        self.ganado = False
        self.estado_label.text = ""

    def reiniciar_puzzle(self):
        self.grid = [
            [self.celdas_fijas.get((r, c)) for c in range(tg.N)]
            for r in range(tg.N)
        ]
        self.ganado = False
        self.estado_label.text = ""

    # ------------------------------------------------------------------
    # Conversión coordenadas <-> celdas
    # ------------------------------------------------------------------

    def celda_a_pantalla(self, r, c):
        """Esquina inferior-izquierda de la celda (r, c) en píxeles de ventana."""
        x = MARGIN + c * CELL
        y = BOTTOM_BAR + MARGIN + (tg.N - 1 - r) * CELL
        return x, y

    def pantalla_a_celda(self, x, y):
        if not (MARGIN <= x <= MARGIN + GRID_PIX):
            return None
        if not (BOTTOM_BAR + MARGIN <= y <= BOTTOM_BAR + MARGIN + GRID_PIX):
            return None
        c = int((x - MARGIN) // CELL)
        r = tg.N - 1 - int((y - BOTTOM_BAR - MARGIN) // CELL)
        if 0 <= r < tg.N and 0 <= c < tg.N:
            return r, c
        return None

    # ------------------------------------------------------------------
    # Validación (para feedback visual de celdas inválidas y detección de victoria)
    # ------------------------------------------------------------------

    def _marcar_linea_invalida(self, valores, posiciones, invalid):
        # Tres símbolos iguales consecutivos
        for i in range(len(valores) - 2):
            a, b, c_ = valores[i], valores[i + 1], valores[i + 2]
            if a is not None and a == b == c_:
                invalid.update([posiciones[i], posiciones[i + 1], posiciones[i + 2]])
        # Más de 3 de un mismo símbolo en la línea
        n_sol = valores.count(tg.SUN)
        n_luna = valores.count(tg.MOON)
        if n_sol > 3:
            invalid.update(p for p, v in zip(posiciones, valores) if v == tg.SUN)
        if n_luna > 3:
            invalid.update(p for p, v in zip(posiciones, valores) if v == tg.MOON)

    def calcular_invalidas(self):
        invalid = set()
        grid = self.grid

        for r in range(tg.N):
            fila = grid[r]
            self._marcar_linea_invalida(fila, [(r, c) for c in range(tg.N)], invalid)

        for c in range(tg.N):
            columna = [grid[r][c] for r in range(tg.N)]
            self._marcar_linea_invalida(columna, [(r, c) for r in range(tg.N)], invalid)

        for (r, c), tipo in self.bordes_h.items():
            a, b = grid[r][c], grid[r][c + 1]
            if a is not None and b is not None:
                if (tipo == '=' and a != b) or (tipo == 'X' and a == b):
                    invalid.add((r, c))
                    invalid.add((r, c + 1))

        for (r, c), tipo in self.bordes_v.items():
            a, b = grid[r][c], grid[r + 1][c]
            if a is not None and b is not None:
                if (tipo == '=' and a != b) or (tipo == 'X' and a == b):
                    invalid.add((r, c))
                    invalid.add((r + 1, c))

        return invalid

    def revisar_victoria(self):
        completo = all(self.grid[r][c] is not None for r in range(tg.N) for c in range(tg.N))
        if completo and not self.calcular_invalidas():
            self.ganado = True
            self.estado_label.text = "Resuelto! Presiona N para un nuevo puzzle."
        else:
            self.ganado = False
            self.estado_label.text = ""

    # ------------------------------------------------------------------
    # Dibujo de símbolos
    # ------------------------------------------------------------------

    def _dibujar_sol(self, cx, cy, batch, objs):
        r = CELL * 0.26
        objs.append(shapes.Circle(cx, cy, r, color=COLOR_SUN, batch=batch))
        largo = CELL * 0.13
        for i in range(8):
            ang = i * (math.pi / 4)
            x1 = cx + math.cos(ang) * (r + 3)
            y1 = cy + math.sin(ang) * (r + 3)
            x2 = cx + math.cos(ang) * (r + 3 + largo)
            y2 = cy + math.sin(ang) * (r + 3 + largo)
            objs.append(shapes.Line(x1, y1, x2, y2, thickness=3, color=COLOR_SUN, batch=batch))

    def _dibujar_luna(self, cx, cy, batch, objs):
        r = CELL * 0.27
        objs.append(shapes.Circle(cx, cy, r, color=COLOR_MOON, batch=batch))
        # "mordisco" con un círculo del color de fondo, para simular una luna creciente
        objs.append(shapes.Circle(cx + r * 0.55, cy + r * 0.3, r * 0.85, color=COLOR_BG, batch=batch))

    def _dibujar_badge_borde(self, x, y, tipo, batch, objs):
        radio = 11
        objs.append(shapes.Circle(x, y, radio, color=COLOR_BADGE_BG, batch=batch))
        objs.append(shapes.Arc(x, y, radio, color=COLOR_LINE_FUERTE, batch=batch))
        etiqueta = pyglet.text.Label(
            tipo, x=x, y=y - 1, anchor_x='center', anchor_y='center',
            font_size=12, weight='bold', color=COLOR_BADGE_TXT, batch=batch
        )
        objs.append(etiqueta)

    # ------------------------------------------------------------------
    # Render principal
    # ------------------------------------------------------------------

    def on_draw(self):
        self.clear()
        batch = pyglet.graphics.Batch()
        objs = []  # mantiene referencias vivas mientras dura el draw

        # Fondos de celdas fijas (pistas del generador, no editables)
        for (r, c) in self.celdas_fijas:
            x, y = self.celda_a_pantalla(r, c)
            objs.append(shapes.Rectangle(x, y, CELL, CELL, color=COLOR_FIXED_BG, batch=batch))

        # Resaltado de celdas que violan alguna regla en el estado actual
        for (r, c) in self.calcular_invalidas():
            x, y = self.celda_a_pantalla(r, c)
            rect = shapes.Rectangle(x + 3, y + 3, CELL - 6, CELL - 6, color=COLOR_INVALIDA, batch=batch)
            rect.opacity = 90
            objs.append(rect)

        # Líneas de la grilla
        for i in range(tg.N + 1):
            grosor = 3 if i in (0, tg.N) else 1
            color = COLOR_LINE_FUERTE if i in (0, tg.N) else COLOR_LINE_SUAVE
            x = MARGIN + i * CELL
            objs.append(shapes.Line(x, BOTTOM_BAR + MARGIN, x, BOTTOM_BAR + MARGIN + GRID_PIX,
                                     thickness=grosor, color=color, batch=batch))
            y = BOTTOM_BAR + MARGIN + i * CELL
            objs.append(shapes.Line(MARGIN, y, MARGIN + GRID_PIX, y,
                                     thickness=grosor, color=color, batch=batch))

        # Símbolos colocados (fijos + jugados)
        for r in range(tg.N):
            for c in range(tg.N):
                v = self.grid[r][c]
                if v is None:
                    continue
                x, y = self.celda_a_pantalla(r, c)
                cx, cy = x + CELL / 2, y + CELL / 2
                if v == tg.SUN:
                    self._dibujar_sol(cx, cy, batch, objs)
                else:
                    self._dibujar_luna(cx, cy, batch, objs)

        # Pistas de borde (= / X)
        for (r, c), tipo in self.bordes_h.items():
            x, y = self.celda_a_pantalla(r, c)
            self._dibujar_badge_borde(x + CELL, y + CELL / 2, tipo, batch, objs)

        for (r, c), tipo in self.bordes_v.items():
            x, y = self.celda_a_pantalla(r, c)
            self._dibujar_badge_borde(x + CELL / 2, y, tipo, batch, objs)

        batch.draw()

        self.titulo_label.draw()
        self.instrucciones_label.draw()
        self.estado_label.color = COLOR_GANADO if self.ganado else (150, 60, 60, 255)
        self.estado_label.draw()

    # ------------------------------------------------------------------
    # Entrada del usuario
    # ------------------------------------------------------------------

    def on_mouse_press(self, x, y, button, modifiers):
        if self.ganado:
            return

        celda = self.pantalla_a_celda(x, y)
        if celda is None:
            return
        r, c = celda

        if (r, c) in self.celdas_fijas:
            return  # las pistas iniciales no se pueden modificar

        if button == mouse.LEFT:
            actual = self.grid[r][c]
            if actual is None:
                self.grid[r][c] = tg.SUN
            elif actual == tg.SUN:
                self.grid[r][c] = tg.MOON
            else:
                self.grid[r][c] = None
        elif button == mouse.RIGHT:
            self.grid[r][c] = None

        self.revisar_victoria()

    def on_key_press(self, symbol, modifiers):
        if symbol == key.N:
            self.nuevo_puzzle()
        elif symbol == key.R:
            self.reiniciar_puzzle()
        elif symbol == key.ESCAPE:
            self.close()


def main():
    ventana = TangoWindow()
    pyglet.app.run()


if __name__ == '__main__':
    main()
