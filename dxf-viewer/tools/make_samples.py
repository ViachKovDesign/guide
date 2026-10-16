#!/usr/bin/env python3
"""Генератор тестовых DXF для просмотрщика.

Нужен только если хотите пересоздать файлы из public/samples/:
    pip install ezdxf
    python3 tools/make_samples.py

Файлы пишет библиотека ezdxf — то есть независимо от нашего парсера. Это важно:
если бы мы генерировали DXF своим кодом, ошибка в понимании формата попала бы
и в генератор, и в просмотрщик, и тесты бы её не заметили.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import ezdxf
from ezdxf import colors
from ezdxf.enums import TextEntityAlignment
from ezdxf.math import Vec2
from ezdxf.render.mleader import ConnectionSide

OUT = Path(__file__).resolve().parent.parent / "public" / "samples"
OUT.mkdir(parents=True, exist_ok=True)


def setup_doc(version: str):
    doc = ezdxf.new(version, setup=True)
    doc.units = ezdxf.units.MM  # $INSUNITS = 4
    doc.header["$LTSCALE"] = 20
    doc.header["$DIMASZ"] = 3.5
    return doc


def save_1251(doc, path: Path):
    """Сохраняет в Windows-1251. ezdxf пишет в заголовок ANSI_1252 — правим, как делает настоящий AutoCAD."""
    doc.saveas(path, encoding="cp1251")
    data = path.read_bytes()
    assert b"ANSI_1252" in data
    path.write_bytes(data.replace(b"ANSI_1252", b"ANSI_1251", 1))


def add_title_block(msp, x, y, w, lines, layer="ТЕКСТ"):
    """Рамка штампа с русскими надписями."""
    msp.add_lwpolyline([(x, y), (x + w, y), (x + w, y + 8 * len(lines)), (x, y + 8 * len(lines))],
                       close=True, dxfattribs={"layer": layer})
    for i, line in enumerate(reversed(lines)):
        msp.add_text(line, height=3.5, dxfattribs={"layer": layer}).set_placement(
            (x + 3, y + 8 * i + 2.5), align=TextEntityAlignment.LEFT)
        if i:
            msp.add_line((x, y + 8 * i), (x + w, y + 8 * i), dxfattribs={"layer": layer})


# ---------------------------------------------------------------------------
# 1. Простая деталь с размерами (R2000, Windows-1251)
# ---------------------------------------------------------------------------
def make_detail():
    doc = setup_doc("R2000")
    for name, color, lt, lw in [
        ("КОНТУР", 7, "Continuous", 50),
        ("ОСИ", 1, "CENTER", 18),
        ("РАЗМЕРЫ", 3, "Continuous", 18),
        ("ШТРИХОВКА", 5, "Continuous", 13),
        ("ТЕКСТ", 2, "Continuous", 18),
        ("СКРЫТЫЕ", 6, "DASHED", 18),
    ]:
        doc.layers.add(name, color=color, linetype=lt, lineweight=lw)
    msp = doc.modelspace()

    # Блок «болт»: окружность, шестигранник и крестик
    bolt = doc.blocks.new("БОЛТ_М8")
    bolt.add_circle((0, 0), 6, dxfattribs={"layer": "0"})
    bolt.add_lwpolyline(
        [(5 * math.cos(math.radians(60 * i)), 5 * math.sin(math.radians(60 * i))) for i in range(6)],
        close=True, dxfattribs={"layer": "0"})
    bolt.add_line((-8, 0), (8, 0), dxfattribs={"layer": "0", "color": 1})
    bolt.add_line((0, -8), (0, 8), dxfattribs={"layer": "0", "color": 1})

    # Пластина 300×200 со скруглёнными углами (дуги — через bulge)
    r = 20
    b = math.tan(math.radians(90) / 4)
    pts = [
        (r, 0, 0), (300 - r, 0, b), (300, r, 0), (300, 200 - r, b),
        (300 - r, 200, 0), (r, 200, b), (0, 200 - r, 0), (0, r, b),
    ]
    msp.add_lwpolyline(pts, format="xyb", close=True, dxfattribs={"layer": "КОНТУР"})

    # Отверстия и оси
    for cx, cy, rad in [(60, 100, 25), (240, 100, 25)]:
        msp.add_circle((cx, cy), rad, dxfattribs={"layer": "КОНТУР"})
        msp.add_line((cx - rad - 10, cy), (cx + rad + 10, cy), dxfattribs={"layer": "ОСИ"})
        msp.add_line((cx, cy - rad - 10), (cx, cy + rad + 10), dxfattribs={"layer": "ОСИ"})
    # Овальный паз
    msp.add_lwpolyline([(120, 80, 1), (180, 80, 0), (180, 120, 1), (120, 120, 0)],
                       format="xyb", close=True, dxfattribs={"layer": "КОНТУР"})
    msp.add_line((100, 100), (200, 100), dxfattribs={"layer": "ОСИ"})
    # Скрытый контур (пунктир)
    msp.add_line((20, 20), (280, 20), dxfattribs={"layer": "СКРЫТЫЕ"})
    msp.add_line((20, 180), (280, 180), dxfattribs={"layer": "СКРЫТЫЕ"})

    # Болты по углам — вставки блока с поворотом и масштабом
    for i, (x, y) in enumerate([(25, 25), (275, 25), (275, 175), (25, 175)]):
        msp.add_blockref("БОЛТ_М8", (x, y), dxfattribs={
            "layer": "КОНТУР", "rotation": 15 * i, "xscale": 0.8, "yscale": 0.8})
    # Массив вставок 4×2
    arr = msp.add_blockref("БОЛТ_М8", (110, 140), dxfattribs={
        "layer": "КОНТУР", "xscale": 0.5, "yscale": 0.5,
        "row_count": 2, "column_count": 4, "row_spacing": 20, "column_spacing": 25})

    # Штриховка на «разрезе» сбоку: стальной профиль (ANSI31) и сплошная заливка
    side = msp.add_hatch(color=5, dxfattribs={"layer": "ШТРИХОВКА"})
    side.set_pattern_fill("ANSI31", scale=2.0, angle=0)
    side.paths.add_polyline_path([(330, 0), (350, 0), (350, 200), (330, 200)], is_closed=True)
    msp.add_lwpolyline([(330, 0), (350, 0), (350, 200), (330, 200)], close=True,
                       dxfattribs={"layer": "КОНТУР"})
    fill = msp.add_hatch(color=8, dxfattribs={"layer": "ШТРИХОВКА"})
    fill.set_solid_fill(color=8)
    fill.paths.add_polyline_path([(355, 0), (365, 0), (365, 200), (355, 200)], is_closed=True)

    # Размеры
    dim_over = {"dimtxt": 6, "dimasz": 4, "dimexe": 2, "dimexo": 2, "dimlfac": 1, "dimdec": 0}
    for d in [
        msp.add_linear_dim(base=(0, -30), p1=(0, 0), p2=(300, 0), dimstyle="EZDXF",
                           override=dim_over, dxfattribs={"layer": "РАЗМЕРЫ"}),
        msp.add_linear_dim(base=(-30, 0), p1=(0, 0), p2=(0, 200), angle=90, dimstyle="EZDXF",
                           override=dim_over, dxfattribs={"layer": "РАЗМЕРЫ"}),
        msp.add_linear_dim(base=(0, 230), p1=(60, 200), p2=(240, 200), dimstyle="EZDXF",
                           override=dim_over, dxfattribs={"layer": "РАЗМЕРЫ"}),
        msp.add_diameter_dim(center=(60, 100), radius=25, angle=135, dimstyle="EZDXF",
                             override=dim_over, dxfattribs={"layer": "РАЗМЕРЫ"}),
        msp.add_radius_dim(center=(300 - r, 200 - r), radius=r, angle=45, dimstyle="EZDXF",
                           override=dim_over, dxfattribs={"layer": "РАЗМЕРЫ"}),
    ]:
        d.render()

    # Текст: разные выравнивания, спецсимволы и подпись на русском
    msp.add_text("Пластина ПЛ-01. Сталь Ст3, δ=10 мм", height=8,
                 dxfattribs={"layer": "ТЕКСТ"}).set_placement((0, 260), align=TextEntityAlignment.LEFT)
    msp.add_text("Отв. %%c50 ±0,5 — 2 шт.  Угол 45%%d", height=5,
                 dxfattribs={"layer": "ТЕКСТ"}).set_placement((0, 248), align=TextEntityAlignment.LEFT)
    msp.add_text("Ёжик, щётка, ъ/ь, №5 — проверка кириллицы", height=5,
                 dxfattribs={"layer": "ТЕКСТ", "rotation": 0}).set_placement(
        (150, -60), align=TextEntityAlignment.MIDDLE_CENTER)
    msp.add_text("Вертикальная надпись", height=5,
                 dxfattribs={"layer": "ТЕКСТ", "rotation": 90}).set_placement(
        (385, 100), align=TextEntityAlignment.MIDDLE_CENTER)
    msp.add_mtext("Примечание:\\P1. Размеры в мм.\\P2. Допуск по ГОСТ 30893.1 — {\\C1;m}.\\P"
                  "3. Острые кромки притупить.",
                  dxfattribs={"layer": "ТЕКСТ", "char_height": 5, "width": 120,
                              "insert": (420, 200), "attachment_point": 1})
    add_title_block(msp, 420, 0, 140, ["Деталь: Пластина", "Масштаб 1:2", "Разработал: Слава", "Лист 1"])

    save_1251(doc, OUT / "detail-1251.dxf")


# ---------------------------------------------------------------------------
# 2. Кровельный узел (R2000, Windows-1251): штриховки, дуги, сплайн, неподдерживаемое
# ---------------------------------------------------------------------------
def make_roof():
    doc = setup_doc("R2000")
    for name, color, lt, lw in [
        ("Стены", 7, "Continuous", 50),
        ("Кровля", 4, "Continuous", 35),
        ("Утеплитель", 2, "Continuous", 13),
        ("Мембрана", 3, "DASHED", 25),
        ("Оси", 1, "CENTER", 18),
        ("Выноски", 6, "Continuous", 18),
        ("Размеры", 3, "Continuous", 18),
    ]:
        doc.layers.add(name, color=color, linetype=lt, lineweight=lw)
    msp = doc.modelspace()

    # Блок «анкер», внутри — вложенный блок «шайба» (проверка вложенности)
    washer = doc.blocks.new("Шайба")
    washer.add_circle((0, 0), 4, dxfattribs={"layer": "0"})
    washer.add_circle((0, 0), 1.5, dxfattribs={"layer": "0"})
    anchor = doc.blocks.new("Анкер")
    anchor.add_line((0, 0), (0, -40), dxfattribs={"layer": "0"})
    anchor.add_blockref("Шайба", (0, 0), dxfattribs={"layer": "0"})

    # Стена: бетон (AR-CONC), контур
    wall = [(0, 0), (200, 0), (200, 300), (0, 300)]
    msp.add_lwpolyline(wall, close=True, dxfattribs={"layer": "Стены"})
    h = msp.add_hatch(color=8, dxfattribs={"layer": "Стены"})
    h.set_pattern_fill("AR-CONC", scale=0.5)
    h.paths.add_polyline_path(wall, is_closed=True)

    # Плита перекрытия с наклоном + утеплитель (ANSI37 — сетка), контур через рёбра с дугой
    slab = msp.add_hatch(color=2, dxfattribs={"layer": "Утеплитель"})
    slab.set_pattern_fill("ANSI37", scale=4)
    ep = slab.paths.add_edge_path()
    ep.add_line((200, 300), (500, 300))
    ep.add_line((500, 300), (500, 340))
    ep.add_arc(center=(450, 340), radius=50, start_angle=0, end_angle=90, ccw=True)
    ep.add_line((450, 390), (200, 390))
    ep.add_line((200, 390), (200, 300))
    msp.add_lwpolyline([(200, 300), (500, 300), (500, 340, 0.4142), (450, 390, 0), (200, 390)],
                       format="xyb", close=True, dxfattribs={"layer": "Утеплитель"})

    # Кровельный пирог: тонкие слои полилиниями
    for i, y in enumerate([392, 396, 400]):
        msp.add_lwpolyline([(200, y), (440, y)], dxfattribs={"layer": "Кровля"})
    msp.add_line((200, 404), (440, 404), dxfattribs={"layer": "Мембрана"})
    # Сплайн — кривая примыкания
    msp.add_spline(fit_points=[(440, 404), (470, 396), (495, 380), (505, 350)],
                   dxfattribs={"layer": "Кровля"})
    # Эллипс (дуга)
    msp.add_ellipse(center=(350, 200), major_axis=(60, 0), ratio=0.5,
                    start_param=0, end_param=math.pi, dxfattribs={"layer": "Стены"})
    msp.add_ellipse(center=(350, 200), major_axis=(60, 0), ratio=0.5,
                    start_param=math.pi, end_param=2 * math.pi, dxfattribs={"layer": "Оси"})

    # Анкеры рядом: массив 5×1 через вставку с повторением
    msp.add_blockref("Анкер", (250, 300), dxfattribs={
        "layer": "Кровля", "column_count": 5, "row_count": 1, "column_spacing": 45})
    # Анкер, повёрнутый и отражённый (отрицательный масштаб)
    msp.add_blockref("Анкер", (100, 150), dxfattribs={
        "layer": "Стены", "rotation": 30, "xscale": -1, "yscale": 1.5})

    # Цвет по блоку: вставка красного цвета
    msp.add_blockref("Шайба", (120, 250), dxfattribs={"layer": "Выноски", "color": 1, "xscale": 3, "yscale": 3})

    # Размеры
    dim_over = {"dimtxt": 8, "dimasz": 5, "dimexe": 2, "dimexo": 2, "dimlfac": 1, "dimdec": 0}
    msp.add_linear_dim(base=(0, -40), p1=(0, 0), p2=(200, 0), dimstyle="EZDXF", override=dim_over,
                       dxfattribs={"layer": "Размеры"}).render()
    msp.add_linear_dim(base=(560, 300), p1=(500, 300), p2=(500, 340), angle=90, dimstyle="EZDXF",
                       override=dim_over, dxfattribs={"layer": "Размеры"}).render()
    msp.add_angular_dim_cra(center=(200, 300), radius=50, start_angle=0, end_angle=90,
                            distance=20, dimstyle="EZDXF", override=dim_over,
                            dxfattribs={"layer": "Размеры"}).render()

    # Выноски: LEADER со стрелкой и MTEXT
    msp.add_leader([(300, 380), (330, 430), (380, 430)], dimstyle="EZDXF", override=dim_over,
                   dxfattribs={"layer": "Выноски"})
    msp.add_mtext("Мембрана ПВХ 1,5 мм,\\Pмеханически закреплена", dxfattribs={
        "layer": "Выноски", "char_height": 8, "insert": (385, 440), "attachment_point": 4, "width": 150})
    msp.add_text("Крыша: узел Б-Б", height=14, dxfattribs={"layer": "Выноски"}).set_placement(
        (0, 420), align=TextEntityAlignment.LEFT)
    msp.add_text("М 1:10", height=8, dxfattribs={"layer": "Выноски"}).set_placement(
        (0, 400), align=TextEntityAlignment.LEFT)

    # --- то, что просмотрщик пока не рисует: должно попасть в список «не отрисовано» ---
    msp.add_xline((0, 0), (1, 1), dxfattribs={"layer": "Оси"})
    msp.add_ray((0, 0), (0, 1), dxfattribs={"layer": "Оси"})
    ml = msp.add_multileader_mtext("Standard")
    ml.set_content("Стык по ТУ", char_height=8)
    ml.add_leader_line(ConnectionSide.left, [Vec2(-30, 20)])
    ml.build(insert=Vec2(120, 470))
    msp.add_point((600, 430), dxfattribs={"layer": "Выноски"})

    save_1251(doc, OUT / "roof-node-1251.dxf")


# ---------------------------------------------------------------------------
# 3. Фасадный узел (R2018, UTF-8): true color, вес линий, отрицательное выдавливание,
#    пространство листа, далёкий «мусорный» объект, отражённый текст
# ---------------------------------------------------------------------------
def make_facade():
    doc = setup_doc("R2018")
    doc.layers.add("Фасад", color=7, lineweight=50)
    doc.layers.add("Облицовка", color=30, lineweight=35)
    doc.layers.add("Каркас", true_color=colors.rgb2int((90, 140, 220)), lineweight=25)
    doc.layers.add("Подписи", color=2)
    doc.layers.add("Выключенный", color=1)
    doc.layers.get("Выключенный").off()
    msp = doc.modelspace()

    # Вертикальные профили фасада повторяются в массиве
    prof = doc.blocks.new("Профиль-Т")
    prof.add_lwpolyline([(0, 0), (60, 0), (60, 4), (32, 4), (32, 80), (28, 80), (28, 4), (0, 4)],
                        close=True, dxfattribs={"layer": "0"})
    prof.add_text("Т-60", height=6, dxfattribs={"layer": "0"}).set_placement(
        (30, 40), align=TextEntityAlignment.MIDDLE_CENTER)
    panel = doc.blocks.new("Панель")
    panel.add_lwpolyline([(0, 0), (600, 0), (600, 12), (0, 12)], close=True, dxfattribs={"layer": "0"})
    panel.add_blockref("Профиль-Т", (270, 12), dxfattribs={"layer": "0"})

    for i in range(4):
        msp.add_blockref("Панель", (0, 100 * i), dxfattribs={"layer": "Облицовка" if i % 2 else "Каркас"})
    # Стена с дверным проёмом: полилиния с 3D-флагом и true color
    wall = msp.add_lwpolyline([(-20, -20), (-20, 380), (640, 380), (640, -20)], close=True,
                              dxfattribs={"layer": "Фасад", "lineweight": 70})
    msp.add_line((100, 150), (500, 150), dxfattribs={"true_color": colors.rgb2int((220, 60, 120)),
                                                      "lineweight": 100})
    # Дуга в отражённой системе координат (extrusion = 0,0,-1)
    msp.add_arc((300, 250), 80, 0, 180, dxfattribs={"layer": "Фасад", "extrusion": (0, 0, -1)})
    # Объект на выключенном слое
    msp.add_circle((300, 300), 40, dxfattribs={"layer": "Выключенный"})
    # Текст на русском в UTF-8 и с юникод-экранированием
    msp.add_text("Фасад «Альфа». Ось 1–5, отм. +3,600", height=12, dxfattribs={"layer": "Подписи"}).set_placement(
        (0, 410), align=TextEntityAlignment.LEFT)
    msp.add_mtext("Узел Ж\\Pобщий вид", dxfattribs={"layer": "Подписи", "char_height": 10,
                                                    "insert": (660, 380), "attachment_point": 1})
    # Мусорная точка далеко от чертежа — «Показать всё» не должно уходить в космос
    msp.add_circle((90000, 85000), 2, dxfattribs={"layer": "Фасад"})
    # Пространство листа
    doc.layout("Layout1").add_text("Лист", height=10, dxfattribs={"insert": (50, 50)})

    doc.saveas(OUT / "facade-utf8-r2018.dxf")


if __name__ == "__main__":
    make_detail()
    make_roof()
    make_facade()
    print("Готово:", ", ".join(sorted(p.name for p in OUT.glob("*.dxf"))))
    sys.exit(0)
