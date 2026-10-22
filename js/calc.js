// Reglas de cálculo de jornada y bancos. Todo se maneja en minutos.

export const NOVEDADES = [
  'Sin novedad', 'Vacaciones', 'Franco', 'Feriado',
  'Entrada Demorada', 'Salida Anticipada', 'Capacitación', 'Trámite',
];

export const CONFIG_DEFAULT = {
  jornadaMin: 7 * 60,      // jornada estándar
  minimoMin: 4 * 60,       // mínimo real trabajado
  metaSemanalMin: 28 * 60, // meta semanal
  topeBancoMin: 70 * 60,   // tope del banco de horas
  capacitacionesAnio: 4,
  horarioHabitual: '10:00–17:00',
};

const DIA_COMPLETO = ['Vacaciones', 'Franco', 'Feriado', 'Capacitación'];
const JUSTIFICA_FALTANTE = ['Entrada Demorada', 'Salida Anticipada'];

export function aMinutos(hhmm) {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

export function fmtHoras(min, { signo = false, vacio = '—' } = {}) {
  if (min === null || min === undefined) return vacio;
  const neg = min < 0;
  const abs = Math.abs(Math.round(min));
  const h = Math.floor(abs / 60), m = abs % 60;
  let s = m === 0 ? `${h} h` : h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, '0')} min`;
  if (neg) s = '−' + s;
  else if (signo && abs > 0) s = '+' + s;
  return s;
}

// Calcula un día. rec = { entrada, salida, novedad, nota }
export function calcularDia(rec, cfg = CONFIG_DEFAULT) {
  const r = rec || {};
  const novedad = r.novedad || 'Sin novedad';
  const res = {
    novedad, trabajadas: null, computadas: 0, descuento: 0, credito: 0,
    vacaciones: 0, estado: '', tono: 'neutro', avisos: [],
  };

  if (DIA_COMPLETO.includes(novedad)) {
    res.estado = novedad === 'Capacitación' ? 'Capacitación (registro)'
      : novedad === 'Vacaciones' ? 'Vacaciones' : novedad;
    res.tono = 'info';
    if (novedad === 'Vacaciones') res.vacaciones = -1;
    res.justificado = true;
    return res;
  }

  const e = aMinutos(r.entrada), s = aMinutos(r.salida);
  if (e === null && s === null) {
    res.estado = 'Sin cargar';
    res.vacio = true;
    return res;
  }
  if (e === null) { res.estado = 'No Entrada'; res.tono = 'malo'; res.trabajadas = 0; return res; }
  if (s === null) { res.estado = 'No Salida'; res.tono = 'malo'; res.trabajadas = 0; return res; }
  if (s <= e) {
    res.estado = 'Revisar horario'; res.tono = 'malo'; res.trabajadas = 0;
    res.avisos.push('La salida tiene que ser posterior a la entrada');
    return res;
  }

  const H = s - e;
  res.trabajadas = H;

  if (H < cfg.minimoMin) {
    res.estado = 'Revisar'; res.tono = 'alerta';
    res.avisos.push(`Menos de ${fmtHoras(cfg.minimoMin)} trabajadas: no computa`);
    return res;
  }

  const J = cfg.jornadaMin;
  res.credito = Math.max(0, H - J);

  if (JUSTIFICA_FALTANTE.includes(novedad)) {
    res.computadas = J;
    res.descuento = Math.max(0, J - H);
    res.estado = novedad === 'Entrada Demorada' ? 'Presente (demora)' : 'Presente (salida anticipada)';
    res.tono = 'ok';
  } else if (novedad === 'Trámite') {
    res.computadas = J;
    res.estado = 'Presente (trámite)';
    res.tono = 'ok';
  } else {
    res.computadas = Math.min(H, J);
    res.estado = 'Presente';
    res.tono = 'ok';
    if (H < J) res.avisos.push(`Faltan ${fmtHoras(J - H)} para la jornada`);
  }
  return res;
}

// --- fechas ---
export function iso(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}
export function desdeIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function lunesDe(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); return x; }
export function sumarDias(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function diasLaborables(anio) {
  const out = []; const d = new Date(anio, 0, 1);
  while (d.getFullYear() === anio) { const w = d.getDay(); if (w >= 1 && w <= 5) out.push(iso(d)); d.setDate(d.getDate() + 1); }
  return out;
}

// Resumen de una semana (lunes a viernes)
export function calcularSemana(lunesIso, registros, cfg = CONFIG_DEFAULT) {
  const lunes = desdeIso(lunesIso);
  const dias = [];
  for (let i = 0; i < 5; i++) {
    const f = iso(sumarDias(lunes, i));
    dias.push({ fecha: f, rec: registros[f] || null, calc: calcularDia(registros[f], cfg) });
  }
  const justificados = dias.filter(d => d.calc.justificado).length;
  const meta = Math.min(cfg.metaSemanalMin, cfg.jornadaMin * (5 - justificados));
  const computadas = dias.reduce((a, d) => a + d.calc.computadas, 0);
  const trabajadas = dias.reduce((a, d) => a + (d.calc.trabajadas || 0), 0);
  const descuento = dias.reduce((a, d) => a + d.calc.descuento, 0);
  const credito = dias.reduce((a, d) => a + d.calc.credito, 0);
  const revisar = dias.filter(d => ['Revisar', 'No Entrada', 'No Salida', 'Revisar horario'].includes(d.calc.estado));
  const cumplidos = dias.filter(d => d.calc.computadas > 0).length;
  return { dias, meta, computadas, trabajadas, descuento, credito, revisar, cumplidos, justificados, falta: Math.max(0, meta - computadas) };
}

// Libro del banco de horas. movimientos manuales: {id, fecha, banco:'horas', minutos, concepto}
export function libroBancoHoras(registros, movimientos, cfg = CONFIG_DEFAULT) {
  const eventos = [];
  for (const m of movimientos || []) {
    if (m.banco !== 'horas') continue;
    eventos.push({ fecha: m.fecha, orden: 0, concepto: m.concepto || 'Ajuste manual', pedido: Number(m.cantidad) || 0, manual: true, id: m.id });
  }
  for (const [fecha, rec] of Object.entries(registros || {})) {
    const c = calcularDia(rec, cfg);
    if (c.credito > 0) eventos.push({ fecha, orden: 1, concepto: 'Excedente del día', pedido: c.credito });
    if (c.descuento > 0) eventos.push({ fecha, orden: 2, concepto: `Descuento · ${c.novedad}`, pedido: -c.descuento });
  }
  eventos.sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.orden - b.orden);

  let saldo = 0, perdidas = 0, sinDescontar = 0, sumadas = 0, usadas = 0;
  for (const ev of eventos) {
    if (ev.pedido >= 0) {
      const aplicado = Math.min(ev.pedido, Math.max(0, cfg.topeBancoMin - saldo));
      ev.aplicado = aplicado; ev.perdido = ev.pedido - aplicado;
      perdidas += ev.perdido; sumadas += aplicado;
    } else {
      const aplicado = -Math.min(-ev.pedido, saldo);
      ev.aplicado = aplicado; ev.noDescontado = -ev.pedido + aplicado;
      sinDescontar += ev.noDescontado; usadas += -aplicado;
    }
    saldo += ev.aplicado;
    ev.saldo = saldo;
  }
  return { eventos, saldo, perdidas, sinDescontar, sumadas, usadas };
}

// Libro del banco de vacaciones (en días)
export function libroBancoVacaciones(registros, movimientos) {
  const eventos = [];
  for (const m of movimientos || []) {
    if (m.banco !== 'vacaciones') continue;
    eventos.push({ fecha: m.fecha, orden: 0, concepto: m.concepto || 'Ajuste manual', dias: Number(m.cantidad) || 0, manual: true, id: m.id });
  }
  for (const [fecha, rec] of Object.entries(registros || {})) {
    if (rec && rec.novedad === 'Vacaciones') eventos.push({ fecha, orden: 1, concepto: 'Día de vacaciones', dias: -1 });
  }
  eventos.sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.orden - b.orden);
  let saldo = 0;
  for (const ev of eventos) { saldo += ev.dias; ev.saldo = saldo; }
  return { eventos, saldo };
}
