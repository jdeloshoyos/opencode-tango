"""
Generador de puzzles estilo "Tango" (LinkedIn)
================================================

Grilla 6x6. Cada celda es SOL (1) o LUNA (0).
Reglas:
  - Cada fila y cada columna: exactamente 3 soles y 3 lunas.
  - No puede haber 3 símbolos iguales contiguos (fila o columna).
  - Entre celdas contiguas puede haber una pista de borde:
        '='  -> ambas celdas deben ser iguales
        'X'  -> ambas celdas deben ser distintas

El pipeline tiene 4 fases:
  1) generar_solucion()          -> una grilla 6x6 completa y válida (al azar)
  2) derivar_pistas(solucion)    -> todas las pistas de celda y de borde posibles
  3) reducir_pistas(...)         -> quita pistas mientras la solución siga siendo única
  4) resolver_logicamente(...)   -> intenta resolver el puzzle SOLO con deducción
                                     (sin backtracking) para validar que sea "justo"
"""

import random
from copy import deepcopy

N = 6
SUN, MOON, EMPTY = 1, 0, None


# ----------------------------------------------------------------------
# FASE 1: Generar una grilla solución completa y válida
# ----------------------------------------------------------------------

def _filas_validas():
    """Precalcula las 20 combinaciones de una fila de 6 con 3 soles y 3 lunas,
    filtrando las que tienen 3 símbolos iguales contiguos."""
    filas = []
    from itertools import combinations
    for posiciones_sol in combinations(range(N), 3):
        fila = [MOON] * N
        for p in posiciones_sol:
            fila[p] = SUN
        if _sin_tres_contiguos(fila):
            filas.append(tuple(fila))
    return filas


def _sin_tres_contiguos(secuencia):
    """True si no hay 3 valores iguales consecutivos (ignora None)."""
    run_val, run_len = None, 0
    for v in secuencia:
        if v is None:
            run_val, run_len = None, 0
            continue
        if v == run_val:
            run_len += 1
            if run_len >= 3:
                return False
        else:
            run_val, run_len = v, 1
    return True


FILAS_VALIDAS = _filas_validas()  # se calcula una sola vez, se reutiliza siempre


def generar_solucion():
    """Backtracking fila por fila usando las combinaciones pre-filtradas.
    Devuelve una grilla 6x6 (lista de listas) con una solución válida al azar."""

    grilla = [[EMPTY] * N for _ in range(N)]

    def columna_valida_incremental(fila_idx):
        # Chequea, tras colocar la fila fila_idx, que no se rompan reglas
        # verticales con las 2 filas anteriores.
        if fila_idx >= 2:
            for c in range(N):
                a, b, d = grilla[fila_idx - 2][c], grilla[fila_idx - 1][c], grilla[fila_idx][c]
                if a == b == d:
                    return False
        # Chequeo de conteo parcial de columnas (no debe superar 3)
        for c in range(N):
            cuenta_sol = sum(1 for r in range(fila_idx + 1) if grilla[r][c] == SUN)
            cuenta_luna = sum(1 for r in range(fila_idx + 1) if grilla[r][c] == MOON)
            if cuenta_sol > 3 or cuenta_luna > 3:
                return False
        return True

    def backtrack(fila_idx):
        if fila_idx == N:
            return True

        candidatas = list(FILAS_VALIDAS)
        random.shuffle(candidatas)

        for fila in candidatas:
            grilla[fila_idx] = list(fila)
            if columna_valida_incremental(fila_idx):
                if backtrack(fila_idx + 1):
                    return True
            grilla[fila_idx] = [EMPTY] * N

        return False

    exito = backtrack(0)
    assert exito, "No se pudo generar una solución (no debería pasar nunca)"
    return grilla


# ----------------------------------------------------------------------
# FASE 2: Derivar todas las pistas posibles (celdas + bordes) de la solución
# ----------------------------------------------------------------------

def derivar_pistas(solucion):
    """Devuelve:
       celdas: dict {(r,c): simbolo}                para las 36 celdas
       bordes_h: dict {(r,c): '=' o 'X'}             borde entre (r,c) y (r,c+1)
       bordes_v: dict {(r,c): '=' o 'X'}             borde entre (r,c) y (r+1,c)
    """
    celdas = {(r, c): solucion[r][c] for r in range(N) for c in range(N)}

    bordes_h = {}
    for r in range(N):
        for c in range(N - 1):
            bordes_h[(r, c)] = '=' if solucion[r][c] == solucion[r][c + 1] else 'X'

    bordes_v = {}
    for r in range(N - 1):
        for c in range(N):
            bordes_v[(r, c)] = '=' if solucion[r][c] == solucion[r + 1][c] else 'X'

    return celdas, bordes_h, bordes_v


# ----------------------------------------------------------------------
# Solver genérico por backtracking (cuenta soluciones, corta al llegar a `limite`)
# Se usa en la Fase 3 para verificar unicidad.
# ----------------------------------------------------------------------

def contar_soluciones(celdas_fijas, bordes_h_fijos, bordes_v_fijos, limite=2):
    grilla = [[EMPTY] * N for _ in range(N)]
    contador = [0]

    for (r, c), v in celdas_fijas.items():
        grilla[r][c] = v

    def fila_ok(r, hasta_col):
        vals = grilla[r][:hasta_col + 1]
        if not _sin_tres_contiguos(vals):
            return False
        if vals.count(SUN) > 3 or vals.count(MOON) > 3:
            return False
        return True

    def col_ok(c, hasta_fila):
        vals = [grilla[r][c] for r in range(hasta_fila + 1)]
        if not _sin_tres_contiguos(vals):
            return False
        if vals.count(SUN) > 3 or vals.count(MOON) > 3:
            return False
        return True

    def borde_ok(r, c):
        # Chequea bordes con el vecino de la izquierda y el de arriba,
        # que ya deberían estar colocados en este punto del recorrido.
        if c > 0:
            tipo = bordes_h_fijos.get((r, c - 1))
            if tipo == '=' and grilla[r][c] != grilla[r][c - 1]:
                return False
            if tipo == 'X' and grilla[r][c] == grilla[r][c - 1]:
                return False
        if r > 0:
            tipo = bordes_v_fijos.get((r - 1, c))
            if tipo == '=' and grilla[r][c] != grilla[r - 1][c]:
                return False
            if tipo == 'X' and grilla[r][c] == grilla[r - 1][c]:
                return False
        return True

    orden = [(r, c) for r in range(N) for c in range(N)]  # recorrido fila por fila

    def backtrack(idx):
        if contador[0] >= limite:
            return
        if idx == len(orden):
            contador[0] += 1
            return

        r, c = orden[idx]

        if grilla[r][c] is not None:
            # celda fija: solo validar y seguir
            if fila_ok(r, c) and col_ok(c, r) and borde_ok(r, c):
                backtrack(idx + 1)
            return

        for v in (SUN, MOON):
            grilla[r][c] = v
            if fila_ok(r, c) and col_ok(c, r) and borde_ok(r, c):
                backtrack(idx + 1)
                if contador[0] >= limite:
                    grilla[r][c] = None
                    return
            grilla[r][c] = None

    backtrack(0)
    return contador[0]


# ----------------------------------------------------------------------
# FASE 3: Reducir el conjunto de pistas manteniendo unicidad
# ----------------------------------------------------------------------

def reducir_pistas(celdas, bordes_h, bordes_v, min_bordes=2):
    """Parte de 'todas las pistas visibles' y va quitando, una por una en orden
    aleatorio, mientras la solución siga siendo única. Devuelve el subconjunto
    final de pistas."""

    celdas = dict(celdas)
    bordes_h = dict(bordes_h)
    bordes_v = dict(bordes_v)

    # Lista mezclada de "items" quitables: ('celda', (r,c)) o ('bh', (r,c)) o ('bv', (r,c))
    items = ([('celda', k) for k in celdas] +
             [('bh', k) for k in bordes_h] +
             [('bv', k) for k in bordes_v])
    random.shuffle(items)

    for tipo, key in items:
        if tipo == 'bh' and len(bordes_h) + len(bordes_v) <= min_bordes:
            continue

        # Guardar valor y quitar
        if tipo == 'celda':
            valor = celdas.pop(key)
        elif tipo == 'bh':
            valor = bordes_h.pop(key)
        else:
            valor = bordes_v.pop(key)

        n_sol = contar_soluciones(celdas, bordes_h, bordes_v, limite=2)

        if n_sol != 1:
            # Hacía falta esta pista: la reponemos
            if tipo == 'celda':
                celdas[key] = valor
            elif tipo == 'bh':
                bordes_h[key] = valor
            else:
                bordes_v[key] = valor

    return celdas, bordes_h, bordes_v


# ----------------------------------------------------------------------
# FASE 4: Solver lógico (sin backtracking) — valida que el puzzle sea "deducible"
# ----------------------------------------------------------------------

def resolver_logicamente(celdas, bordes_h, bordes_v):
    """Intenta completar la grilla aplicando solo reglas de deducción humana,
    repitiendo hasta que no haya más progreso. Devuelve (completo: bool, grilla)."""

    grilla = [[None] * N for _ in range(N)]
    for (r, c), v in celdas.items():
        grilla[r][c] = v

    def opuesto(v):
        return MOON if v == SUN else SUN

    def lineas():
        """Genera (celdas_de_la_linea, setter) para las 6 filas y 6 columnas."""
        for r in range(N):
            yield [(r, c) for c in range(N)]
        for c in range(N):
            yield [(r, c) for r in range(N)]

    def aplicar_regla_de_tres(linea):
        cambiado = False
        vals = [grilla[r][c] for (r, c) in linea]
        # ventanas de 3 consecutivas: fuerza la 3ra celda si dos conocidas e iguales
        for i in range(N - 2):
            trio = [(linea[i], vals[i]), (linea[i + 1], vals[i + 1]), (linea[i + 2], vals[i + 2])]
            conocidos = [(pos, v) for pos, v in trio if v is not None]
            desconocidos = [(pos, v) for pos, v in trio if v is None]
            if len(conocidos) == 2 and len(desconocidos) == 1:
                (p1, v1), (p2, v2) = conocidos
                if v1 == v2:
                    (r, c) = desconocidos[0][0]
                    grilla[r][c] = opuesto(v1)
                    cambiado = True
        return cambiado

    def aplicar_regla_de_conteo(linea):
        cambiado = False
        vals = [grilla[r][c] for (r, c) in linea]
        n_sol = vals.count(SUN)
        n_luna = vals.count(MOON)
        if n_sol == 3 or n_luna == 3:
            faltante = SUN if n_luna == 3 else MOON
            for (r, c), v in zip(linea, vals):
                if v is None:
                    grilla[r][c] = faltante
                    cambiado = True
        return cambiado

    def aplicar_bordes():
        cambiado = False
        for (r, c), tipo in bordes_h.items():
            a, b = grilla[r][c], grilla[r][c + 1]
            if a is not None and b is None:
                grilla[r][c + 1] = a if tipo == '=' else opuesto(a)
                cambiado = True
            elif b is not None and a is None:
                grilla[r][c] = b if tipo == '=' else opuesto(b)
                cambiado = True
        for (r, c), tipo in bordes_v.items():
            a, b = grilla[r][c], grilla[r + 1][c]
            if a is not None and b is None:
                grilla[r + 1][c] = a if tipo == '=' else opuesto(a)
                cambiado = True
            elif b is not None and a is None:
                grilla[r][c] = b if tipo == '=' else opuesto(b)
                cambiado = True
        return cambiado

    progreso = True
    while progreso:
        progreso = False
        for linea in lineas():
            if aplicar_regla_de_tres(linea):
                progreso = True
            if aplicar_regla_de_conteo(linea):
                progreso = True
        if aplicar_bordes():
            progreso = True

    completo = all(grilla[r][c] is not None for r in range(N) for c in range(N))
    return completo, grilla


# ----------------------------------------------------------------------
# Utilidades de impresión
# ----------------------------------------------------------------------

def imprimir_grilla(grilla):
    simbolo = {SUN: '☀', MOON: '🌙', None: '·'}
    for fila in grilla:
        print(' '.join(simbolo[v] for v in fila))


def imprimir_puzzle(celdas, bordes_h, bordes_v):
    simbolo = {SUN: '☀', MOON: '🌙', None: '·'}
    for r in range(N):
        fila_celdas = []
        for c in range(N):
            fila_celdas.append(simbolo[celdas.get((r, c))])
            if c < N - 1:
                fila_celdas.append(bordes_h.get((r, c), ' '))
        print(' '.join(fila_celdas))
        if r < N - 1:
            linea_bordes = []
            for c in range(N):
                linea_bordes.append(bordes_v.get((r, c), ' '))
                if c < N - 1:
                    linea_bordes.append(' ')
            print(' '.join(linea_bordes))


# ----------------------------------------------------------------------
# PIPELINE COMPLETO
# ----------------------------------------------------------------------

def generar_puzzle(max_intentos=120, min_bordes=2):
    """Genera un puzzle completo: solución + pistas reducidas + validación lógica.
    Reintenta si el resultado no es resoluble por deducción pura."""

    for intento in range(max_intentos):
        solucion = generar_solucion()
        celdas, bordes_h, bordes_v = derivar_pistas(solucion)
        celdas_r, bh_r, bv_r = reducir_pistas(celdas, bordes_h, bordes_v, min_bordes=min_bordes)

        completo, _ = resolver_logicamente(celdas_r, bh_r, bv_r)
        if completo:
            return {
                'solucion': solucion,
                'celdas': celdas_r,
                'bordes_h': bh_r,
                'bordes_v': bv_r,
                'intentos': intento + 1,
            }

    raise RuntimeError("No se logró un puzzle deducible en el número de intentos dado")


if __name__ == '__main__':
    random.seed()  # quitar o fijar semilla para reproducibilidad
    resultado = generar_puzzle()

    print(f"Puzzle generado en {resultado['intentos']} intento(s).\n")

    print("Solución completa:")
    imprimir_grilla(resultado['solucion'])

    print("\nPuzzle inicial (pistas visibles para el jugador):")
    imprimir_puzzle(resultado['celdas'], resultado['bordes_h'], resultado['bordes_v'])

    print(f"\nCantidad de celdas pre-llenadas: {len(resultado['celdas'])} / 36")
    print(f"Cantidad de pistas de borde: {len(resultado['bordes_h']) + len(resultado['bordes_v'])} / 60")

    # Verificación final: el solver lógico debe reconstruir exactamente la solución
    completo, grilla_resuelta = resolver_logicamente(
        resultado['celdas'], resultado['bordes_h'], resultado['bordes_v']
    )
    assert completo
    assert grilla_resuelta == resultado['solucion']
    print("\n✔ Verificado: el puzzle es resoluble por deducción pura y coincide con la solución.")
