// Единицы чертежа ($INSUNITS) → миллиметры. Нужны для рулетки и панели свойств.

interface UnitInfo {
  name: string;
  short: string;
  mm: number;
}

const UNITS: Record<number, UnitInfo> = {
  1: { name: 'дюймы', short: 'in', mm: 25.4 },
  2: { name: 'футы', short: 'ft', mm: 304.8 },
  3: { name: 'мили', short: 'mi', mm: 1609344 },
  4: { name: 'миллиметры', short: 'мм', mm: 1 },
  5: { name: 'сантиметры', short: 'см', mm: 10 },
  6: { name: 'метры', short: 'м', mm: 1000 },
  7: { name: 'километры', short: 'км', mm: 1_000_000 },
  8: { name: 'микродюймы', short: 'µin', mm: 2.54e-5 },
  9: { name: 'милы', short: 'mil', mm: 0.0254 },
  10: { name: 'ярды', short: 'yd', mm: 914.4 },
  11: { name: 'ангстремы', short: 'Å', mm: 1e-7 },
  12: { name: 'нанометры', short: 'нм', mm: 1e-6 },
  13: { name: 'микроны', short: 'мкм', mm: 1e-3 },
  14: { name: 'дециметры', short: 'дм', mm: 100 },
  15: { name: 'декаметры', short: 'дкм', mm: 10_000 },
  16: { name: 'гектометры', short: 'гм', mm: 100_000 },
};

export interface UnitsResult {
  /** сколько миллиметров в одной единице чертежа */
  mmPerUnit: number;
  /** человекочитаемое описание для строки состояния */
  label: string;
  /** true — единицы не заданы, приняли миллиметры */
  assumed: boolean;
}

export function resolveUnits(insunits: number): UnitsResult {
  const u = UNITS[insunits];
  if (u) return { mmPerUnit: u.mm, label: u.name, assumed: false };
  // 0 — «без единиц»: для строительных чертежей почти всегда миллиметры
  return { mmPerUnit: 1, label: 'единицы не заданы, считаем мм', assumed: true };
}
