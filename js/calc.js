// Reglas de cálculo de jornada y bancos. Todo se maneja en minutos.

export const NOVEDADES = [
  'Sin novedad', 'Vacaciones', 'Franco', 'Feriado',
  'Entrada Demorada', 'Salida Anticipada', 'Capacitación', 'Home office', 'Ausencia por fuerza mayor',
];

export const CONFIG_DEFAULT = {
  jornadaMin: 7 * 60,      // jornada estándar
  minimoMin: 3 * 60,       // mínimo real trabajado
  metaSemanalMin: 28 * 60, // meta semanal
  topeBancoMin: 70 * 60,   // tope del banco de horas
  capacitacionesAnio: 4,
  francosAnio: 15,
  vacacionesAnio: 30, // se suman cada 1/1 y lo que sobra se acumula
  // true: cada día trabajado suma sus horas reales − 7 h al saldo de la semana; si queda positivo va al banco.
  // false: cada día computa hasta 7 h y al banco va lo que pase de 7 h en el día.
  excedenteSemanal: true,
  horarioHabitual: '10:00–17:00',
  salidaMaxMin: 19 * 60, // la salida cuenta como máximo hasta las 19:00
};

const DIA_COMPLETO = ['Vacaciones', 'Franco', 'Feriado', 'Capacitación', 'Home office', 'Ausencia por fuerza mayor'];
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
    // Día justificado: cuenta como 7 h trabajadas y figura Presente.
    res.estado = `Presente (${novedad.toLowerCase()})`;
    res.tono = 'info';
    res.computadas = novedad === 'Home office' ? 0 : cfg.jornadaMin; // home office solo registra el día
    if (novedad === 'Vacaciones') res.vacaciones = -1;
    if (novedad === 'Franco') res.descuento = cfg.jornadaMin;
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

  const sCuenta = Math.min(s, cfg.salidaMaxMin ?? 24 * 60);
  if (sCuenta < s) { res.salidaTope = true; res.avisos.push('La salida cuenta hasta las 19:00'); }
  const H = Math.max(0, sCuenta - e);
  res.trabajadas = H;

  if (H < cfg.minimoMin) {
    res.estado = 'Revisar'; res.tono = 'alerta';
    res.avisos.push(`Menos de ${fmtHoras(cfg.minimoMin)} trabajadas: no computa`);
    return res;
  }

  const J = cfg.jornadaMin;
  const semanal = cfg.excedenteSemanal;
  res.credito = semanal ? 0 : Math.max(0, H - J);

  if (JUSTIFICA_FALTANTE.includes(novedad)) {
    res.computadas = semanal ? Math.max(H, J) : J;
    res.descuento = Math.max(0, J - H);
    res.diferencia = Math.max(0, H - J); // lo que falta lo cubre el banco
    res.estado = novedad === 'Entrada Demorada' ? 'Presente (demora)' : 'Presente (salida anticipada)';
    res.tono = 'ok';
  } else {
    res.computadas = semanal ? H : Math.min(H, J);
    res.diferencia = H - J;
    res.estado = 'Presente';
    res.tono = 'ok';
    if (H < J && !semanal) res.avisos.push(`Faltan ${fmtHoras(J - H)} para la jornada`);
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
  const meta = cfg.metaSemanalMin;
  const computadas = dias.reduce((a, d) => a + d.calc.computadas, 0);
  const trabajadas = dias.reduce((a, d) => a + (d.calc.trabajadas || 0), 0);
  const descuento = dias.reduce((a, d) => a + d.calc.descuento, 0);
  // Saldo de la semana: por cada día trabajado, horas reales − 7 h (vacaciones, feriados, etc. no cuentan).
  const saldo = dias.reduce((a, d) => a + (d.calc.diferencia || 0), 0);
  const credito = cfg.excedenteSemanal ? Math.max(0, saldo) : dias.reduce((a, d) => a + d.calc.credito, 0);
  const revisar = dias.filter(d => ['Revisar', 'No Entrada', 'No Salida', 'Revisar horario'].includes(d.calc.estado));
  const cumplidos = dias.filter(d => d.calc.computadas > 0).length;
  const diasMeta = Math.round(meta / cfg.jornadaMin);
  return { dias, meta, computadas, trabajadas, descuento, credito, saldo, revisar, cumplidos, justificados, diasMeta,
    faltanDias: Math.max(0, diasMeta - cumplidos), falta: Math.max(0, meta - computadas) };
}

export const REINICIO = 'Reinicio del banco';

// Libro del banco de horas. movimientos manuales: {id, fecha, banco:'horas', minutos, concepto}
export function libroBancoHoras(registros, movimientos, cfg = CONFIG_DEFAULT) {
  const eventos = [];
  for (const m of movimientos || []) {
    if (m.banco !== 'horas') continue;
    eventos.push({ fecha: m.fecha, orden: 0, concepto: m.concepto || 'Ajuste manual', pedido: Number(m.cantidad) || 0, manual: true, id: m.id });
  }
  const semanas = new Set();
  for (const [fecha, rec] of Object.entries(registros || {})) {
    const c = calcularDia(rec, cfg);
    semanas.add(iso(lunesDe(desdeIso(fecha))));
    if (c.credito > 0) eventos.push({ fecha, orden: 1, concepto: 'Excedente del día', pedido: c.credito });
    if (c.descuento > 0) eventos.push({ fecha, orden: 2, concepto: `Descuento · ${c.novedad}`, pedido: -c.descuento });
  }
  if (cfg.excedenteSemanal) {
    for (const lunes of semanas) {
      const sem = calcularSemana(lunes, registros, cfg);
      if (sem.credito > 0) eventos.push({ fecha: iso(sumarDias(desdeIso(lunes), 4)), orden: 3, concepto: 'Excedente semanal', pedido: sem.credito });
    }
  }
  eventos.sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.orden - b.orden);
  // "Reinicio del banco": el banco arranca en 0 en esa fecha y solo cuenta lo que pasa desde ahí.
  const reinicio = (movimientos || []).filter(m => m.banco === 'horas' && m.concepto === REINICIO).map(m => m.fecha).sort().pop();
  if (reinicio) eventos.splice(0, eventos.length, ...eventos.filter(e => e.fecha >= reinicio && e.concepto !== REINICIO));

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
  return { eventos, saldo, perdidas, sinDescontar, sumadas, usadas, reinicio };
}

// Libro del banco de vacaciones (en días)
export function libroBancoVacaciones(registros, movimientos, cfg = CONFIG_DEFAULT, hoy = new Date()) {
  const eventos = [];
  // Asignación automática cada 1/1, desde el primer año con datos hasta el año actual.
  // Una "Asignación AAAA" cargada a mano reemplaza la automática de ese año.
  const manuales = new Set((movimientos || []).filter(m => m.banco === 'vacaciones' && /^Asignación \d{4}$/.test(m.concepto || '')).map(m => m.concepto.slice(-4)));
  const anios = [...Object.keys(registros || {}), ...(movimientos || []).map(m => m.fecha)].map(f => +f.slice(0, 4));
  const ultimo = Math.max(hoy.getFullYear(), ...anios);
  for (let a = Math.min(hoy.getFullYear(), ...anios); a <= ultimo; a++) {
    if (a > hoy.getFullYear() && !anios.includes(a)) continue;
    if (!manuales.has(String(a))) eventos.push({ fecha: `${a}-01-01`, orden: 0, concepto: `Asignación ${a}`, dias: cfg.vacacionesAnio, auto: true });
  }
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
