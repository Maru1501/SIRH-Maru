import {
  NOVEDADES, CONFIG_DEFAULT as CFG, calcularDia, calcularSemana, libroBancoHoras, libroBancoVacaciones,
  fmtHoras, iso, desdeIso, lunesDe, sumarDias, diasLaborables,
} from './calc.js?v=202610261626';
import { almacen, registroVacio } from './db.js?v=202610261626';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_C = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const hoyIso = () => iso(new Date());
const dd_mm = f => { const d = desdeIso(f); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };
const fechaCorta = f => { const d = desdeIso(f); return `${dd_mm(f)}/${d.getFullYear()}`; };
const nombreDia = f => DIAS[desdeIso(f).getDay()];

const ui = {
  vista: 'semana',
  lunes: iso(lunesDe(new Date())),
  anio: new Date().getFullYear(),
  mes: new Date().getMonth(),
  borrador: {},
  rango: { desde: '', hasta: '', entrada: '', salida: '', novedad: 'Sin novedad', soloVacios: true },
  anioBanco: 'todos',
  nov: { anio: new Date().getFullYear(), tipo: 'Vacaciones', desde: '', hasta: '' },
  abiertos: new Set(), // días cargados que se abrieron para editar (en el celular)
};

// ---------- utilidades de interfaz ----------
let toastT;
function toast(msg, error = false) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('error', error); t.classList.add('ver');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('ver'), error ? 5000 : 2200);
}

function render() {
  const foco = document.activeElement;
  const clave = foco && foco.dataset && foco.dataset.campo ? `[data-fecha="${foco.closest('[data-fecha]')?.dataset.fecha}"] [data-campo="${foco.dataset.campo}"]` : foco?.id ? `#${foco.id}` : null;
  $$('.menu-lateral button[data-vista]').forEach(b => b.classList.toggle('activa', b.dataset.vista === ui.vista));
  $('#vista-actual').textContent = { semana: 'Semana', anual: 'Carga anual', banco: 'Banco de horas', vacaciones: 'Novedades', config: 'Configuración' }[ui.vista];
  const v = $('#vista');
  v.innerHTML = { semana: vistaSemana, anual: vistaAnual, banco: vistaBanco, vacaciones: vistaVacaciones, config: vistaConfig }[ui.vista]();
  if (ui.enfocar) { ui.enfocar = false; if (enfocarPendiente()) return pintarEstado(); }
  if (clave) { const el = $(clave); if (el && el !== document.body) el.focus({ preventScroll: true }); }
  pintarEstado();
}

function pintarEstado() {
  const el = $('#estado-sync'), pie = $('#pie-estado');
  el.className = 'pastilla estado-sync ' + almacen.estado;
  const txt = { local: 'Solo en este navegador', conectando: 'Conectando…', nube: 'Sincronizado con la base', error: 'Sin conexión a la base' }[almacen.estado];
  el.textContent = txt; el.title = almacen.error || '';
  $('#menu-sync').textContent = txt + (almacen.error ? ` · ${almacen.error}` : '');
  pie.textContent = almacen.estado === 'nube' ? 'Guardado en la base de datos (Neon) y en este navegador'
    : almacen.estado === 'error' ? `Guardado solo en este navegador · ${almacen.error}`
    : 'Guardado en este navegador · Conectá la base en Configuración para usarla desde cualquier dispositivo';
}

const opcionesNovedad = sel => NOVEDADES.map(n => `<option${n === sel ? ' selected' : ''}>${n}</option>`).join('');

function celdaBanco(c) {
  if (c.descuento > 0) return `<span class="num neg">${fmtHoras(-c.descuento)}</span>`;
  if (c.credito > 0) return `<span class="num pos">${fmtHoras(c.credito, { signo: true })}</span>`;
  if (c.diferencia) return `<span class="num ${c.diferencia < 0 ? 'neg' : 'pos'}">${fmtHoras(c.diferencia, { signo: true })}</span>`;
  return `<span class="num gris">—</span>`;
}

function filaDia(fecha, rec, c, { sucia = false, plegarVacio = false } = {}) {
  const r = rec || {};
  const hoy = fecha === hoyIso();
  const avisos = c.avisos.length ? `<div class="aviso-dia">${esc(c.avisos.join(' · '))}</div>` : '';
  const completo = diaCompleto(r, c);
  const plegada = (completo || plegarVacio) && !ui.abiertos.has(fecha);
  const detalle = c.justificado ? r.novedad
    : completo ? `${r.entrada}–${r.salida}${r.novedad && r.novedad !== 'Sin novedad' ? ' · ' + r.novedad : ''}`
    : c.vacio ? 'Tocá para cargar' : `${r.entrada || '--:--'}–${r.salida || '--:--'}`;
  const resumen = plegada ? `<button class="res-dia" data-abrir="${fecha}" aria-label="Editar ${nombreDia(fecha)} ${dd_mm(fecha)}">
      <span class="rd-dia">${DIAS_C[desdeIso(fecha).getDay()]} ${dd_mm(fecha)}${hoy ? ' <span class="etq">HOY</span>' : ''}</span>
      <span class="rd-det">${esc(detalle)}${r.nota ? ' · ' + esc(r.nota) : ''}</span>
      <span class="rd-h num">${fmtHoras(c.justificado ? null : c.trabajadas || null)}</span>
      ${c.diferencia !== undefined && c.tono === 'ok'
        ? `<span class="estado ${c.diferencia < 0 ? 'malo' : 'ok'}">${c.diferencia === 0 ? '0 h' : fmtHoras(c.diferencia, { signo: true })}</span>`
        : `<span class="estado ${c.tono}">${esc((c.estado || '').replace(/^Presente \((.*)\)$/, '$1').replace('ausencia por fuerza mayor', 'fuerza mayor').replace(/^./, x => x.toUpperCase()))}</span>`}
    </button>` : '';
  const listo = !plegada && (completo || ui.abiertos.has(fecha)) ? `<div class="c-listo"><button class="boton" data-cerrar="${fecha}">Listo ✓</button></div>` : '';
  return `<div class="fila${hoy ? ' hoy' : ''}${sucia ? ' sucia' : ''}${plegada ? ' plegada' : ''}" data-fecha="${fecha}">${resumen}
    <div class="c-dia dia"><b>${nombreDia(fecha)} ${dd_mm(fecha)}</b>${hoy ? '<span class="etq">HOY</span>' : ''}${avisos}</div>
    <div class="c-ent"><span class="lbl-movil">Entrada</span><input class="campo hora" type="text" inputmode="numeric" placeholder="hh:mm" maxlength="5" autocomplete="off" data-campo="entrada" value="${esc(r.entrada)}" aria-label="Entrada ${fecha}"></div>
    <div class="c-sal"><span class="lbl-movil">Salida</span><input class="campo hora" type="text" inputmode="numeric" placeholder="hh:mm" maxlength="5" autocomplete="off" data-campo="salida" value="${esc(r.salida)}" aria-label="Salida ${fecha}"></div>
    <div class="c-nov"><span class="lbl-movil">Novedad</span><select class="campo" data-campo="novedad" aria-label="Novedad ${fecha}">${opcionesNovedad(r.novedad || 'Sin novedad')}</select></div>
    <div class="c-nota"><span class="lbl-movil">Nota</span><input class="campo" type="text" data-campo="nota" value="${esc(r.nota)}" placeholder="Nota" maxlength="200" aria-label="Nota ${fecha}"></div>
    <div class="c-trab"><span class="lbl-movil">Trabajadas</span><span class="num ${c.trabajadas ? 'ocre' : 'gris'}">${fmtHoras(c.trabajadas || null)}</span></div>
    <div class="c-comp"><span class="lbl-movil">Computadas</span><span class="num">${c.computadas ? fmtHoras(c.computadas) : '<span class="gris">0 h</span>'}</span></div>
    <div class="c-banco"><span class="lbl-movil">Saldo</span>${celdaBanco(c)}</div>
    <div class="c-estado">${c.estado ? `<span class="estado ${c.tono}">${esc(c.estado)}</span>` : ''}</div>${listo}
  </div>`;
}

function diaCompleto(r, c) { return !!(c.justificado || (r && r.entrada && r.salida)); }

const cabeceraDias = () => `<div class="dias-cab"><span>Día</span><span>Entrada</span><span>Salida</span><span>Novedad</span><span>Nota</span><span>Trabajadas</span><span>Computadas</span><span>Saldo</span><span>Estado</span></div>`;

function leerFila(fila) {
  const o = {};
  $$('[data-campo]', fila).forEach(i => { o[i.dataset.campo] = i.value.trim(); });
  return o;
}

// ---------- Semana ----------
function vistaSemana() {
  const { registros, movimientos } = almacen.datos;
  const s = calcularSemana(ui.lunes, registros, CFG);
  const banco = libroBancoHoras(registros, movimientos, CFG);
  const vac = libroBancoVacaciones(registros, movimientos);
  const lunes = desdeIso(ui.lunes), viernes = sumarDias(lunes, 4);
  const rango = `${lunes.getDate()} ${MESES_C[lunes.getMonth()]} — ${viernes.getDate()} ${MESES_C[viernes.getMonth()]}, ${viernes.getFullYear()}`;

  const enTope = banco.saldo >= CFG.topeBancoMin;
  const pctBanco = Math.min(100, banco.saldo / CFG.topeBancoMin * 100);

  const avisos = [];
  let metaBanner;
  {
    const sinCargar = s.dias.filter(d => d.calc.vacio).map(d => `${nombreDia(d.fecha).toLowerCase()} ${dd_mm(d.fecha)}`);
    // Control formal: 28 h con novedades a 7 h, 4 días con al menos 3 h reales.
    const control = `${fmtHoras(s.computadas)} de ${fmtHoras(s.meta)} · ${s.cumplidos} de ${s.diasMeta} días`;
    if (s.falta > 0 || s.faltanDias > 0) {
      metaBanner = ['malo', `Meta incumplida: ${control}.${s.falta > 0 ? ` Faltan ${fmtHoras(s.falta)}.` : ""}${sinCargar.length ? ` Sin cargar: ${sinCargar.join(', ')}.` : ''}`];
    } else metaBanner = ['ok', `Meta cumplida: ${control}.`];
  }
  for (const d of s.dias) {
    if (d.calc.estado === 'Revisar') avisos.push(['malo', `${nombreDia(d.fecha)} ${dd_mm(d.fecha)}: menos de ${fmtHoras(CFG.minimoMin)} trabajadas. No se considera jornada cumplida.`]);
    else if (['No Entrada', 'No Salida', 'Revisar horario'].includes(d.calc.estado)) avisos.push(['malo', `${nombreDia(d.fecha)} ${dd_mm(d.fecha)}: ${d.calc.estado}${d.calc.avisos.length ? ' · ' + d.calc.avisos[0] : ''}.`]);
  }
  if (s.descuento > 0) avisos.push(['alerta', `Descuento del banco esta semana: ${fmtHoras(s.descuento)}.`]);

  // Movimientos del mes de la semana mostrada
  const mesClave = ui.lunes.slice(0, 7);
  const evMes = banco.eventos.filter(e => e.fecha.startsWith(mesClave));
  const sum = evMes.reduce((a, e) => { if (e.aplicado > 0) a.s += e.aplicado; else a.u -= e.aplicado; a.p += e.perdido || 0; return a; }, { s: 0, u: 0, p: 0 });

  const anio = lunes.getFullYear();
  const delAnio = Object.entries(registros).filter(([f]) => f.startsWith(String(anio)));
  const francos = delAnio.filter(([, r]) => r.novedad === 'Franco').length;
  const capac = delAnio.filter(([, r]) => r.novedad === 'Capacitación').length;

  return `
  <section class="grilla-3">
    <div class="tarjeta oscura">
      <p class="rotulo">Banco disponible</p>
      <p class="cifra">${fmtHoras(banco.saldo)} <small>/ 70 h</small></p>
      <div class="barra"><i style="width:${pctBanco}%"></i></div>
      <p class="nota">${enTope ? 'Llegaste al tope de 70 h.' : `${fmtHoras(CFG.topeBancoMin - banco.saldo)} de margen hasta el tope de 70 h`}</p>
      ${enTope ? '<p class="alerta-tope">Banco en el tope: las horas nuevas que sumes se pierden.</p>' : ''}
    </div>
    <div class="tarjeta">
      <p class="rotulo">${s.saldo < 0 ? 'Te falta' : s.saldo > 0 ? 'Acumulás' : 'Esta semana'}</p>
      <p class="cifra saldo ${s.saldo < 0 ? 'neg' : s.saldo > 0 ? 'pos' : ''}">${s.saldo === 0 ? '0 h' : fmtHoras(Math.abs(s.saldo))}</p>
      <p class="nota">Trabajadas reales ${fmtHoras(s.trabajadas)}${s.descuento ? ` · Descuento banco ${fmtHoras(s.descuento)}` : ''}</p>
    </div>
    <div class="tarjeta">
      <p class="rotulo">Días cumplidos</p>
      <p class="cifra">${s.cumplidos} <small>/ ${CFG.metaSemanalMin / CFG.jornadaMin} días</small></p>
      <div class="chips">${s.dias.map(d => {
        const cls = d.calc.computadas > 0 || d.calc.justificado ? 'si' : s.revisar.includes(d) ? 'no' : '';
        return `<span class="chip ${cls}" title="${esc(d.calc.estado)}">${DIAS_C[desdeIso(d.fecha).getDay()]}</span>`;
      }).join('')}</div>
    </div>
  </section>
  <div class="espacio"></div>
  <section class="tarjeta">
    <div class="bloque-cab cab-semana">
      <div><p class="rotulo">Registro semanal</p><h2>${rango}</h2></div>
      <div class="controles">
        <button class="boton icono" data-accion="sem-ant" aria-label="Semana anterior">←</button>
        <button class="boton" data-accion="sem-hoy">Hoy</button>
        <button class="boton icono" data-accion="sem-sig" aria-label="Semana siguiente">→</button>
        <input class="campo" type="date" id="ir-fecha" value="${ui.lunes}" aria-label="Ir a la semana de">
      </div>
    </div>
    <div class="av meta-banner ${metaBanner[0]}">${esc(metaBanner[1])}</div>
    <div class="dias" id="dias-semana">${cabeceraDias()}${(() => {
      const primero = s.dias.find(d => !diaCompleto(d.rec, d.calc))?.fecha;
      return s.dias.map(d => filaDia(d.fecha, d.rec, d.calc, { plegarVacio: d.fecha !== primero })).join('');
    })()}</div>
    ${avisos.length ? `<div class="avisos" style="padding-top:14px">${avisos.map(([t, m]) => `<div class="av ${t}">${esc(m)}</div>`).join('')}</div>` : ''}
    <details class="ayuda detalle-semana">
      <summary>Detalles de la semana</summary>
      <p style="margin-top:8px">Trabajadas reales <b>${fmtHoras(s.trabajadas)}</b> · Saldo de la semana <b>${s.saldo === 0 ? '0 h' : fmtHoras(s.saldo, { signo: true })}</b></p>
      <p class="pie-tarjeta" style="margin-top:6px">Los cambios se guardan solos. Meta: 4 días de 7 h. Cada día trabajado suma o resta contra 7 h (mínimo real 3 h). Si la semana queda a favor, va al banco. Vacaciones, franco, feriado y capacitación cuentan como 7 h; home office solo registra el día.</p>
      <p class="pie-tarjeta">Con teclado: escribí la hora de corrido (1030), pasa sola a la salida y después al próximo día vacío. <b>Re Pág / Av Pág</b> cambian de semana.</p>
    </details>
  </section>
  <div class="espacio"></div>
  <section class="grilla-2">
    <div class="tarjeta lista-nov">
      <p class="rotulo">Tus novedades</p>
      <div class="item"><div><b>Vacaciones</b><span>Días disponibles</span></div><div class="val" style="${vac.saldo < 0 ? 'color:var(--rojo)' : ''}">${vac.saldo}</div></div>
      <div class="item"><div><b>Francos</b><span>Usados en ${anio} · no se acumulan</span></div><div class="val" style="${francos > CFG.francosAnio ? 'color:var(--rojo)' : ''}">${francos} <small>/ ${CFG.francosAnio}</small></div></div>
      <div class="item"><div><b>Capacitación</b><span>${capac < CFG.capacitacionesAnio ? `<span style="color:var(--ocre)">${CFG.capacitacionesAnio - capac === 1 ? 'Falta 1 obligatoria' : `Faltan ${CFG.capacitacionesAnio - capac} obligatorias`} en ${anio}</span>` : `Obligatorias en ${anio}: completas`}</span></div><div class="val">${capac} <small>/ ${CFG.capacitacionesAnio}</small></div></div>
    </div>
    <div class="tarjeta">
      <p class="rotulo">Movimientos del banco</p>
      <h2 style="font-size:18px;margin:6px 0 12px">${MESES[lunes.getMonth()]} de ${lunes.getFullYear()}</h2>
      <div class="stats tres">
        <div><span>Sumadas</span><b>${fmtHoras(sum.s)}</b></div>
        <div><span>Utilizadas</span><b>${fmtHoras(sum.u)}</b></div>
        <div><span>Perdidas por tope</span><b>${fmtHoras(sum.p)}</b></div>
      </div>
      ${evMes.length ? `<table class="historial"><tbody>${evMes.slice(-6).reverse().map(e => `<tr><td>${dd_mm(e.fecha)} · ${esc(e.concepto)}</td><td class="der">${fmtHoras(e.aplicado, { signo: true })}</td></tr>`).join('')}</tbody></table>
        <p style="margin-top:10px"><button class="enlace" data-ir="banco">Ver todo el historial →</button></p>` : '<p class="vacio-msg">Sin movimientos este mes.</p>'}
    </div>
  </section>
  ${ayuda()}`;
}

function ayuda() {
  return `<details class="ayuda"><summary>Cómo se calculan mis horas</summary><ul>
    <li><b>Horas trabajadas</b> = salida − entrada.</li>
    <li>Día normal: horas reales − 7 h. Ejemplo: 9:00 a 15:00 te falta 1 h; 9:00 a 19:00 acumulás 3 h. El saldo de la semana se va sumando día a día; si al final queda a favor, va al banco.</li>
    <li><b>Entrada demorada</b> o <b>salida anticipada</b> (con al menos 3 h): figura Presente, computa 7 h y descuenta del banco lo que falta para 7 h.</li>
    <li>Menos de 3 h trabajadas: <b>Revisar</b>, no computa ni descuenta.</li>
    <li><b>Home office</b>: registra el día, no suma horas ni mueve el banco.</li>
    <li><b>Vacaciones, feriado, capacitación y ausencia por fuerza mayor</b> justifican el día: figura Presente y cuenta 7 h, sin mover el banco de horas. Vacaciones resta 1 día del banco de vacaciones.</li>
    <li><b>Franco</b> justifica el día (7 h), descuenta 7 h del banco de horas y suma un franco usado de los 15 del año.</li>
    <li><b>Capacitación</b>: 4 obligatorias por año, la app no deja cargar una quinta.</li>
    <li>El banco de horas va de 0 a 70 h: lo que supere 70 h se pierde y nunca queda negativo.</li>
    <li>Meta semanal: 28 h en 4 días, con al menos 3 h reales cada día.</li>
  </ul></details>`;
}

// ---------- Carga anual ----------
function vistaAnual() {
  const { registros } = almacen.datos;
  const todos = diasLaborables(ui.anio);
  const dias = ui.mes === 'todos' ? todos : todos.filter(f => desdeIso(f).getMonth() === ui.mes);
  const pendientes = Object.keys(ui.borrador).length;
  const pendMes = ui.mes === 'todos' ? pendientes : Object.keys(ui.borrador).filter(f => f.startsWith(`${ui.anio}-${String(ui.mes + 1).padStart(2, '0')}`)).length;
  const anios = []; for (let a = new Date().getFullYear() - 3; a <= new Date().getFullYear() + 1; a++) anios.push(a);
  const cargados = todos.filter(f => registros[f]).length;
  const R = ui.rango;

  return `
  <section class="tarjeta">
    <div class="bloque-cab">
      <div><p class="rotulo">Carga anual</p><h2>${ui.anio} · ${ui.mes === 'todos' ? 'todo el año' : MESES[ui.mes]}</h2>
        <p class="nota" style="margin-top:4px">${cargados} de ${todos.length} días laborables cargados</p></div>
      <div class="controles">
        <select class="campo" id="sel-anio" aria-label="Año" style="width:auto">${anios.map(a => `<option${a === ui.anio ? ' selected' : ''}>${a}</option>`).join('')}</select>
        <select class="campo" id="sel-mes" aria-label="Mes" style="width:auto"><option value="todos"${ui.mes === 'todos' ? ' selected' : ''}>Todo el año</option>${MESES.map((m, i) => `<option value="${i}"${i === ui.mes ? ' selected' : ''}>${m[0].toUpperCase() + m.slice(1)}</option>`).join('')}</select>
      </div>
    </div>
    <details class="ayuda" style="margin:0 0 14px"><summary>Completar varios días de una vez</summary>
      <div class="form-fila" style="margin-top:12px">
        <label>Desde<input class="campo" type="date" id="r-desde" value="${R.desde}"></label>
        <label>Hasta<input class="campo" type="date" id="r-hasta" value="${R.hasta}"></label>
        <label>Entrada<input class="campo hora" type="text" inputmode="numeric" placeholder="hh:mm" maxlength="5" autocomplete="off" id="r-entrada" value="${R.entrada}"></label>
        <label>Salida<input class="campo hora" type="text" inputmode="numeric" placeholder="hh:mm" maxlength="5" autocomplete="off" id="r-salida" value="${R.salida}"></label>
        <label>Novedad<select class="campo" id="r-novedad">${opcionesNovedad(R.novedad)}</select></label>
        <label class="check"><input type="checkbox" id="r-vacios"${R.soloVacios ? ' checked' : ''}> Solo días vacíos</label>
        <button class="boton" data-accion="aplicar-rango">Aplicar</button>
      </div>
      <p class="nota" style="margin-top:8px">Se aplica a los días laborables del rango. Queda marcado como cambio pendiente hasta que guardes.</p>
    </details>
    <div class="dias" id="dias-anual">${cabeceraDias()}${dias.map(f => {
      const rec = ui.borrador[f] || registros[f];
      return filaDia(f, rec, calcularDia(rec, CFG), { sucia: !!ui.borrador[f] });
    }).join('')}</div>
  </section>
  ${pendientes ? `<div class="barra-guardar">
    <span>${pendientes} ${pendientes === 1 ? 'día con cambios' : 'días con cambios'} sin guardar</span>
    <div class="controles">
      <button class="boton sec" data-accion="descartar">Descartar</button>
      ${ui.mes !== 'todos' && pendMes && pendMes !== pendientes ? `<button class="boton sec" data-accion="guardar-mes">Guardar ${MESES[ui.mes]} (${pendMes})</button>` : ''}
      <button class="boton" data-accion="guardar-todo">Guardar todo</button>
    </div></div>` : ''}`;
}

// ---------- Banco de horas ----------
function parsearHoras(txt) {
  const t = String(txt).trim().replace(',', '.');
  let m = /^([+-]?)(\d+):(\d{1,2})$/.exec(t);
  if (m) return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]);
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 60) : null;
}

function vistaBanco() {
  const { registros, movimientos } = almacen.datos;
  const b = libroBancoHoras(registros, movimientos, CFG);
  const enTope = b.saldo >= CFG.topeBancoMin;
  const anios = [...new Set(b.eventos.map(e => e.fecha.slice(0, 4)))].sort().reverse();
  const lista = (ui.anioBanco === 'todos' ? b.eventos : b.eventos.filter(e => e.fecha.startsWith(ui.anioBanco))).slice().reverse();
  return `
  <section class="grilla-2-par">
    <div class="tarjeta oscura">
      <p class="rotulo">Saldo actual del banco</p>
      <p class="cifra" style="font-size:40px">${fmtHoras(b.saldo)} <small>/ 70 h</small></p>
      <div class="barra"><i style="width:${Math.min(100, b.saldo / CFG.topeBancoMin * 100)}%"></i></div>
      <p class="nota">${enTope ? 'Estás en el tope.' : `Podés sumar ${fmtHoras(CFG.topeBancoMin - b.saldo)} más antes del tope.`}</p>
      ${enTope ? '<p class="alerta-tope">El banco está en 70 h: las horas nuevas que se sumen se pierden.</p>' : ''}
    </div>
    <div class="tarjeta">
      <p class="rotulo">Agregar movimiento manual</p>
      <p class="nota" style="margin:6px 0 12px">Para cargar el saldo inicial o corregir algo. Usá horas como 5, 2,5 o 1:30. Para restar, poné un signo menos.</p>
      <div class="form-fila">
        <label>Fecha<input class="campo" type="date" id="m-fecha" value="${hoyIso()}"></label>
        <label>Horas<input class="campo" type="text" id="m-horas" placeholder="Ej: 12 o -1:30" inputmode="text"></label>
        <label style="grid-column:span 2">Concepto<input class="campo" type="text" id="m-concepto" placeholder="Saldo inicial" maxlength="120"></label>
        <button class="boton principal" data-accion="agregar-horas">Agregar</button>
      </div>
    </div>
  </section>
  <div class="espacio"></div>
  <section class="tarjeta">
    <div class="bloque-cab">
      <div><p class="rotulo">Historial de movimientos</p><h2>Banco de horas</h2></div>
      <select class="campo" id="sel-anio-banco" style="width:auto" aria-label="Año"><option value="todos">Todos los años</option>${anios.map(a => `<option${a === ui.anioBanco ? ' selected' : ''}>${a}</option>`).join('')}</select>
    </div>
    <div class="stats">
      <div><span>Sumadas</span><b>${fmtHoras(b.sumadas)}</b></div>
      <div><span>Utilizadas</span><b>${fmtHoras(b.usadas)}</b></div>
      <div><span>Perdidas por tope</span><b>${fmtHoras(b.perdidas)}</b></div>
      <div><span>Sin descontar (banco en 0)</span><b>${fmtHoras(b.sinDescontar)}</b></div>
    </div>
    ${lista.length ? `<div class="tabla-scroll"><table class="historial">
      <thead><tr><th>Fecha</th><th>Concepto</th><th class="der">Horas</th><th class="der">Saldo</th><th></th></tr></thead>
      <tbody>${lista.map(e => `<tr>
        <td>${fechaCorta(e.fecha)}</td>
        <td>${esc(e.concepto)}${e.perdido ? `<span class="sub">${fmtHoras(e.perdido)} perdidas por tope</span>` : ''}${e.noDescontado ? `<span class="sub">${fmtHoras(e.noDescontado)} sin descontar: el banco no puede quedar negativo</span>` : ''}</td>
        <td class="der ${e.aplicado < 0 ? 'num neg' : 'num pos'}">${fmtHoras(e.aplicado, { signo: true, vacio: '0 h' }) || '0 h'}</td>
        <td class="der">${fmtHoras(e.saldo)}</td>
        <td class="der">${e.manual ? `<button class="enlace" data-borrar-mov="${e.id}" title="Borrar movimiento">✕</button>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>` : '<p class="vacio-msg">Todavía no hay movimientos.</p>'}
  </section>`;
}

// ---------- Vacaciones ----------
const NOV_PERIODO = ['Vacaciones', 'Franco', 'Capacitación', 'Feriado', 'Home office', 'Ausencia por fuerza mayor'];

function diasHabiles(desde, hasta) {
  const out = [];
  if (!desde || !hasta || hasta < desde) return out;
  for (let d = desdeIso(desde); iso(d) <= hasta; d = sumarDias(d, 1)) { const w = d.getDay(); if (w >= 1 && w <= 5) out.push(iso(d)); }
  return out;
}

// Agrupa días hábiles seguidos con la misma novedad de día completo
function periodosDelAnio(registros, anio) {
  const fechas = Object.keys(registros).filter(f => f.startsWith(String(anio)) && NOV_PERIODO.includes(registros[f].novedad)).sort();
  const out = [];
  for (const f of fechas) {
    const nov = registros[f].novedad, ult = out[out.length - 1];
    let sig = ult && sumarDias(desdeIso(ult.hasta), 1);
    while (sig && (sig.getDay() === 0 || sig.getDay() === 6)) sig = sumarDias(sig, 1);
    if (ult && ult.novedad === nov && iso(sig) === f) { ult.hasta = f; ult.dias++; }
    else out.push({ novedad: nov, desde: f, hasta: f, dias: 1 });
  }
  return out;
}

function planPeriodo() {
  const { registros } = almacen.datos;
  const N = ui.nov;
  const quitar = N.tipo === 'Quitar novedad';
  const plan = { dias: [], reemplaza: 0, feriados: 0, sinCambio: 0 };
  for (const f of diasHabiles(N.desde, N.hasta)) {
    const r = registros[f];
    if (quitar) { if (r && NOV_PERIODO.includes(r.novedad)) plan.dias.push(f); else plan.sinCambio++; continue; }
    if (r && r.novedad === N.tipo) { plan.sinCambio++; continue; }
    if (N.tipo === 'Vacaciones' && r && r.novedad === 'Feriado') { plan.feriados++; continue; }
    if (!registroVacio(r)) plan.reemplaza++;
    plan.dias.push(f);
  }
  return plan;
}

function vistaVacaciones() {
  const { registros, movimientos } = almacen.datos;
  const N = ui.nov;
  const v = libroBancoVacaciones(registros, movimientos);
  const asign = movimientos.find(m => m.banco === 'vacaciones' && m.concepto === `Asignación ${N.anio}`);
  const anterior = movimientos.find(m => m.banco === 'vacaciones' && m.concepto === 'Saldo de años anteriores');
  const asignado = asign ? asign.cantidad : CFG.vacacionesAnio;
  const delAnio = Object.entries(registros).filter(([f]) => f.startsWith(String(N.anio)));
  const cuenta = n => delAnio.filter(([, r]) => r.novedad === n).length;
  const usadasVac = cuenta('Vacaciones'), francos = cuenta('Franco'), capac = cuenta('Capacitación');
  const plan = planPeriodo();
  const n = plan.dias.length;
  let preview = '', bloqueado = false;
  if (N.desde && N.hasta) {
    if (N.hasta < N.desde) preview = '<p class="av malo">La fecha "hasta" tiene que ser igual o posterior a "desde".</p>';
    else {
      const extra = [];
      if (plan.reemplaza) extra.push(`${plan.reemplaza} ya ${plan.reemplaza === 1 ? 'tenía' : 'tenían'} algo cargado y se reemplaza`);
      if (plan.feriados) extra.push(`${plan.feriados} ${plan.feriados === 1 ? 'feriado queda' : 'feriados quedan'} como feriado`);
      if (plan.sinCambio) extra.push(`${plan.sinCambio} sin cambios`);
      let efecto = '';
      if (N.tipo === 'Vacaciones') efecto = ` Te quedarían <b>${v.saldo - n}</b> días de vacaciones.`;
      if (N.tipo === 'Franco') efecto = ` Francos en ${N.anio}: <b>${francos + n} de ${CFG.francosAnio}</b>. Descuenta ${fmtHoras(n * CFG.jornadaMin)} del banco.`;
      if (N.tipo === 'Capacitación') efecto = ` Capacitaciones en ${N.anio}: <b>${capac + n} de ${CFG.capacitacionesAnio}</b>.`;
      const malo = (N.tipo === 'Vacaciones' && v.saldo - n < 0) || (N.tipo === 'Capacitación' && capac + n > CFG.capacitacionesAnio) || (N.tipo === 'Franco' && francos + n > CFG.francosAnio);
      bloqueado = (N.tipo === 'Capacitación' && capac + n > CFG.capacitacionesAnio) || (N.tipo === 'Franco' && francos + n > CFG.francosAnio);
      if (bloqueado) efecto += N.tipo === 'Franco' ? ' No se pueden cargar más de 15 por año.' : ' No se pueden cargar más de 4 por año.';
      preview = `<p class="av ${malo ? 'malo' : 'ok'}">${N.tipo === 'Quitar novedad' ? `Se quita la novedad de <b>${n}</b> ${n === 1 ? 'día' : 'días'}.` : `Se cargan <b>${n}</b> ${n === 1 ? 'día hábil' : 'días hábiles'} de ${N.tipo.toLowerCase()}.`}${efecto}${extra.length ? ` (${extra.join(', ')}.)` : ''}</p>`;
    }
  }
  const periodos = periodosDelAnio(registros, N.anio).reverse();
  const anios = []; for (let a = new Date().getFullYear() - 1; a <= new Date().getFullYear() + 1; a++) anios.push(a);
  return `
  <section class="stats-nov">
    <div class="tarjeta oscura"><p class="rotulo">Vacaciones disponibles</p><p class="cifra">${v.saldo} <small>días</small></p>
      <p class="nota">${asignado} de ${N.anio} · ${usadasVac} usados${anterior ? ` · ${anterior.cantidad} de antes` : ''}</p></div>
    <div class="tarjeta"><p class="rotulo">Francos ${N.anio}</p><p class="cifra">${francos} <small>/ ${CFG.francosAnio}</small></p>
      <p class="nota">Te quedan ${CFG.francosAnio - francos}. No pasan al año siguiente.</p></div>
    <div class="tarjeta"><p class="rotulo">Capacitaciones ${N.anio}</p><p class="cifra">${capac} <small>/ ${CFG.capacitacionesAnio}</small></p>
      ${capac < CFG.capacitacionesAnio ? `<p class="nota" style="color:var(--ocre)">${CFG.capacitacionesAnio - capac === 1 ? 'Falta 1 obligatoria' : `Faltan ${CFG.capacitacionesAnio - capac} obligatorias`}</p>` : ''}</div>
  </section>
  <div class="espacio"></div>
  <section class="tarjeta">
    <div class="bloque-cab"><div><p class="rotulo">Cargar un período</p><h2>Novedades por fecha</h2></div>
      <select class="campo" id="n-anio" style="width:auto" aria-label="Año">${anios.map(a => `<option${a === N.anio ? ' selected' : ''}>${a}</option>`).join('')}</select></div>
    <div class="form-fila">
      <label>Novedad<select class="campo" id="n-tipo">${[...NOV_PERIODO, 'Quitar novedad'].map(t => `<option${t === N.tipo ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Desde<input class="campo" type="date" id="n-desde" value="${N.desde}"></label>
      <label>Hasta<input class="campo" type="date" id="n-hasta" value="${N.hasta}"></label>
      <button class="boton principal" data-accion="cargar-periodo"${n && !bloqueado ? '' : ' disabled'}>${N.tipo === 'Quitar novedad' ? 'Quitar' : 'Cargar'}</button>
    </div>
    <div style="margin-top:10px">${preview || '<p class="nota">Elegí la novedad y el rango. Se cargan solo los días hábiles (lunes a viernes) y cada día queda marcado en la semana.</p>'}</div>
  </section>
  <div class="espacio"></div>
  <section class="grilla-2-par">
    <div class="tarjeta">
      <p class="rotulo">Vacaciones del año</p>
      <p class="nota" style="margin:6px 0 10px">Cada 1 de enero se suman <b>${CFG.vacacionesAnio} días hábiles</b> y lo que no usaste se acumula. Si este año te corresponden otros días, cambialo acá.</p>
      <div class="form-fila" style="grid-template-columns:1fr auto">
        <input class="campo" type="number" id="n-asign" min="0" step="1" value="${asign ? asign.cantidad : CFG.vacacionesAnio}" aria-label="Días de vacaciones ${N.anio}">
        <button class="boton" data-accion="asignar-vac">Guardar ${N.anio}</button>
      </div>
      <p class="nota" style="margin:14px 0 6px">¿Traés días sin usar de antes de usar la app?</p>
      <div class="form-fila" style="grid-template-columns:1fr auto">
        <input class="campo" type="number" id="n-anterior" step="1" value="${anterior ? anterior.cantidad : ''}" placeholder="Ej: 5" aria-label="Días que traés de años anteriores">
        <button class="boton" data-accion="vac-anterior">Guardar</button>
      </div>
    </div>
    <div class="tarjeta">
      <p class="rotulo">Períodos cargados en ${N.anio}</p>
      ${periodos.length ? `<table class="historial" style="margin-top:6px"><tbody>${periodos.map(p => `<tr>
        <td><b>${p.novedad}</b><span class="sub" style="color:var(--texto-2)">${p.desde === p.hasta ? fechaCorta(p.desde) : `${fechaCorta(p.desde)} al ${fechaCorta(p.hasta)}`}</span></td>
        <td class="der">${p.dias} ${p.dias === 1 ? 'día' : 'días'}</td>
        <td class="der"><button class="enlace" data-quitar-periodo="${p.desde}|${p.hasta}|${p.novedad}" title="Quitar este período">✕</button></td></tr>`).join('')}</tbody></table>`
      : '<p class="vacio-msg">Todavía no cargaste períodos este año.</p>'}
    </div>
  </section>`;
}

// ---------- Configuración ----------
function vistaConfig() {
  const conectado = almacen.estado === 'nube';
  return `
  <section class="tarjeta">
    <p class="rotulo">Base de datos</p>
    <h2 style="font-size:20px;margin:6px 0 10px">${conectado ? 'Conectada a Neon' : 'Conectar con Neon'}</h2>
    <div class="texto-largo">
      ${conectado ? '<p>Tus datos se guardan en tu base de Neon. Podés abrir esta misma página desde otro dispositivo y conectar con la misma cadena para ver todo.</p>'
        : `<p>Sin conectar, los datos quedan solo en este navegador. Para guardarlos en tu base:</p>
        <ol class="pasos"><li>Entrá a <b>console.neon.tech</b> y abrí tu proyecto.</li><li>Tocá <b>Connect</b> y copiá la cadena de conexión (empieza con <b>postgresql://</b>).</li><li>Pegala acá abajo y tocá <b>Conectar</b>. Las tablas se crean solas.</li></ol>`}
      ${almacen.estado === 'error' ? `<p class="av malo">${esc(almacen.error)}</p>` : ''}
    </div>
    <div class="form-fila" style="margin-top:14px;grid-template-columns:1fr auto auto">
      <input class="campo" type="password" id="cadena" placeholder="postgresql://usuario:clave@ep-xxxx.neon.tech/neondb?sslmode=require" value="${esc(almacen.conexion)}" autocomplete="off" aria-label="Cadena de conexión">
      <button class="boton principal" data-accion="conectar">${conectado ? 'Reconectar' : 'Conectar'}</button>
      ${almacen.conexion ? '<button class="boton peligro" data-accion="desconectar">Desconectar</button>' : ''}
    </div>
    <p class="nota" style="margin-top:8px">La cadena queda guardada solo en este navegador, nunca en la página pública.</p>
    ${conectado ? `<div class="controles" style="margin-top:12px"><button class="boton" data-accion="recargar">Traer datos de la base</button><button class="boton" data-accion="subir">Volver a subir todo</button></div>` : ''}
  </section>
  <div class="espacio"></div>
  <section class="tarjeta">
    <p class="rotulo">Parámetros</p>
    <h2 style="font-size:20px;margin:6px 0 12px">Configuración fija</h2>
    <div class="parametros">
      <div><span>Valor de una novedad</span><b>7 h</b></div>
      <div><span>Mínimo real trabajado</span><b>3 h / día</b></div>
      <div><span>Meta semanal</span><b>28 h</b></div>
      <div><span>Tope banco de horas</span><b>70 h</b></div>
      <div><span>Días laborables</span><b>Lunes a viernes</b></div>
      <div><span>Capacitaciones</span><b>4 por año</b></div>
      <div><span>Francos</span><b>15 por año · 7 h c/u</b></div>
    </div>
  </section>
  <div class="espacio"></div>
  <section class="tarjeta">
    <p class="rotulo">Copias</p>
    <h2 style="font-size:20px;margin:6px 0 10px">Exportar o importar</h2>
    <p class="nota">Descargá todos tus datos en un archivo JSON, o recuperalos desde una copia. Al recuperar se reemplazan los datos actuales.</p>
    <div class="controles" style="margin-top:12px"><button class="boton" data-accion="exportar">Descargar copia (JSON)</button><button class="boton" data-accion="importar">Recuperar copia</button></div>
  </section>`;
}

// ---------- acciones ----------
// Topes por año: 4 capacitaciones y 15 francos (no se acumulan de un año al otro).
const TOPES = { 'Capacitación': ['capacitacionesAnio', 'capacitaciones'], 'Franco': ['francosAnio', 'francos'] };
function excedeTope(cambios) {
  const todos = { ...almacen.datos.registros, ...cambios };
  for (const [nov, [clave, nombre]] of Object.entries(TOPES)) {
    const porAnio = {};
    for (const [f, r] of Object.entries(todos)) if (r && r.novedad === nov) porAnio[f.slice(0, 4)] = (porAnio[f.slice(0, 4)] || 0) + 1;
    const anios = new Set(Object.entries(cambios).filter(([, r]) => r && r.novedad === nov).map(([f]) => f.slice(0, 4)));
    const anio = [...anios].find(a => porAnio[a] > CFG[clave]);
    if (anio) return `Ya hay ${CFG[clave]} ${nombre} en ${anio}. No se puede cargar otro día.`;
  }
  return null;
}

async function guardar(cambios, okMsg) {
  const tope = excedeTope(cambios);
  if (tope) { toast(tope, true); return false; }
  try { await almacen.guardarRegistros(cambios); if (okMsg) toast(okMsg); }
  catch (e) { toast(e.message, true); }
  return true;
}

function exportar() {
  const blob = new Blob([JSON.stringify(almacen.exportar(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `control-horario-${hoyIso()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('#archivo-importar').addEventListener('change', async ev => {
  const f = ev.target.files[0]; ev.target.value = '';
  if (!f) return;
  try {
    const obj = JSON.parse(await f.text());
    const n = Object.keys(obj.registros || {}).length;
    if (!confirm(`Se van a reemplazar tus datos actuales por la copia (${n} días cargados). ¿Seguimos?`)) return;
    await almacen.importar(obj); ui.borrador = {}; render(); toast('Copia recuperada');
  } catch (e) { render(); toast(e.message || 'No se pudo leer el archivo', true); }
});

function menu(abrir) {
  const m = $('#menu-lateral');
  m.classList.toggle('abierto', abrir); m.setAttribute('aria-hidden', String(!abrir));
  $('#velo').hidden = !abrir; $('#btn-menu').setAttribute('aria-expanded', String(abrir));
  if (abrir) m.querySelector('button.activa')?.focus(); else if (m.contains(document.activeElement)) $('#btn-menu').focus();
}
$('#velo').addEventListener('click', () => menu(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') menu(false); });

// Pone el cursor en la entrada del primer día sin cargar (para cargar todo con el teclado).
const DIA_COMPLETO_NOV = ['Vacaciones', 'Franco', 'Feriado', 'Capacitación', 'Home office', 'Ausencia por fuerza mayor'];
function enfocarPendiente() {
  for (const fila of $$('#vista .fila[data-fecha]')) {
    const ent = $('[data-campo=entrada]', fila), sal = $('[data-campo=salida]', fila), nov = $('[data-campo=novedad]', fila);
    if (!ent || DIA_COMPLETO_NOV.includes(nov?.value)) continue;
    const vacio = !ent.value ? ent : !sal.value ? sal : null;
    if (!vacio) continue;
    if (fila.classList.contains('plegada')) { ui.abiertos.add(fila.dataset.fecha); ui.enfocar = true; render(); return true; }
    vacio.focus({ preventScroll: false });
    fila.scrollIntoView({ block: 'nearest' });
    return true;
  }
  return false;
}
const conMouse = matchMedia('(pointer: fine)').matches;

function irSemana(f) { ui.lunes = iso(lunesDe(desdeIso(f))); ui.enfocar = conMouse; render(); }

document.addEventListener('click', async ev => {
  const t = ev.target.closest('button');
  if (!t) return;
  if (t.dataset.abrir) { ui.abiertos.add(t.dataset.abrir); render(); $(`[data-fecha="${t.dataset.abrir}"] [data-campo=novedad]`)?.focus({ preventScroll: true }); return; }
  if (t.dataset.cerrar) { ui.abiertos.delete(t.dataset.cerrar); return render(); } // por teclado
  if (t.id === 'btn-menu') return menu(true);
  if (t.id === 'btn-cerrar-menu') return menu(false);
  if (t.dataset.vista) { menu(false); ui.vista = t.dataset.vista; render(); window.scrollTo({ top: 0 }); return; }
  if (t.dataset.ir) { ui.vista = t.dataset.ir; render(); window.scrollTo({ top: 0 }); return; }
  if (t.dataset.quitarPeriodo) {
    const [desde, hasta, nov] = t.dataset.quitarPeriodo.split('|');
    const dias = diasHabiles(desde, hasta).filter(f => almacen.datos.registros[f]?.novedad === nov);
    if (!confirm(`¿Quitar ${nov.toLowerCase()} del ${fechaCorta(desde)} al ${fechaCorta(hasta)} (${dias.length} días)?`)) return;
    const cambios = Object.fromEntries(dias.map(f => { const r = almacen.datos.registros[f]; return [f, { ...r, novedad: 'Sin novedad' }]; }));
    await guardar(cambios, 'Período quitado'); render(); return;
  }
  if (t.dataset.borrarMov) {
    if (!confirm('¿Borrar este movimiento?')) return;
    try { await almacen.borrarMovimiento(t.dataset.borrarMov); toast('Movimiento borrado'); } catch (e) { toast(e.message, true); }
    render(); return;
  }
  if (t.id === 'btn-exportar') return exportar();
  if (t.id === 'btn-importar') return $('#archivo-importar').click();
  const a = t.dataset.accion;
  if (!a) return;
  switch (a) {
    case 'sem-ant': ui.lunes = iso(sumarDias(desdeIso(ui.lunes), -7)); ui.enfocar = conMouse; render(); break;
    case 'sem-sig': ui.lunes = iso(sumarDias(desdeIso(ui.lunes), 7)); ui.enfocar = conMouse; render(); break;
    case 'sem-hoy': irSemana(hoyIso()); break;
    case 'exportar': exportar(); break;
    case 'importar': $('#archivo-importar').click(); break;
    case 'descartar': if (confirm('¿Descartar los cambios sin guardar?')) { ui.borrador = {}; render(); } break;
    case 'guardar-todo': {
      const n = Object.keys(ui.borrador).length;
      t.disabled = true; t.textContent = 'Guardando…';
      if (await guardar(ui.borrador, `${n} ${n === 1 ? 'día guardado' : 'días guardados'}`)) ui.borrador = {};
      render(); break;
    }
    case 'guardar-mes': {
      const pref = `${ui.anio}-${String(ui.mes + 1).padStart(2, '0')}`;
      const lote = Object.fromEntries(Object.entries(ui.borrador).filter(([f]) => f.startsWith(pref)));
      t.disabled = true;
      if (await guardar(lote, `${Object.keys(lote).length} días de ${MESES[ui.mes]} guardados`))
        for (const f of Object.keys(lote)) delete ui.borrador[f];
      render(); break;
    }
    case 'aplicar-rango': {
      const R = ui.rango;
      if (!R.desde || !R.hasta || R.hasta < R.desde) { toast('Elegí un rango de fechas válido', true); break; }
      if (R.entrada && R.salida && R.salida <= R.entrada) { toast('La salida tiene que ser posterior a la entrada', true); break; }
      let n = 0;
      for (let d = desdeIso(R.desde); iso(d) <= R.hasta; d = sumarDias(d, 1)) {
        const w = d.getDay(); if (w === 0 || w === 6) continue;
        const f = iso(d);
        const actual = ui.borrador[f] || almacen.datos.registros[f];
        if (R.soloVacios && !registroVacio(actual)) continue;
        ui.borrador[f] = { entrada: R.entrada, salida: R.salida, novedad: R.novedad, nota: (actual && actual.nota) || '' };
        n++;
      }
      const d0 = desdeIso(R.desde);
      if (d0.getFullYear() === ui.anio && ui.mes !== 'todos' && R.desde.slice(0, 7) !== R.hasta.slice(0, 7)) ui.mes = 'todos';
      else if (d0.getFullYear() !== ui.anio) { ui.anio = d0.getFullYear(); ui.mes = d0.getMonth(); }
      render(); toast(n ? `${n} días completados. Falta guardar.` : 'No había días para completar'); break;
    }
    case 'agregar-horas': {
      const min = parsearHoras($('#m-horas').value);
      const fecha = $('#m-fecha').value;
      if (!fecha || min === null || min === 0) { toast('Indicá la fecha y las horas (ej: 12, 2,5 o -1:30)', true); break; }
      try { await almacen.agregarMovimiento({ fecha, banco: 'horas', cantidad: min, concepto: $('#m-concepto').value.trim() || (min > 0 ? 'Ajuste manual (suma)' : 'Ajuste manual (resta)') }); toast('Movimiento agregado'); }
      catch (e) { toast(e.message, true); }
      render(); break;
    }
    case 'asignar-vac': {
      const dias = Number($('#n-asign').value);
      if (!Number.isFinite(dias) || dias < 0 || $('#n-asign').value === '') { toast('Indicá la cantidad de días', true); break; }
      const concepto = `Asignación ${ui.nov.anio}`;
      try {
        for (const m of almacen.datos.movimientos.filter(m => m.banco === 'vacaciones' && m.concepto === concepto)) await almacen.borrarMovimiento(m.id);
        if (dias !== CFG.vacacionesAnio) await almacen.agregarMovimiento({ fecha: `${ui.nov.anio}-01-01`, banco: 'vacaciones', cantidad: dias, concepto });
        toast(`${ui.nov.anio}: ${dias} días de vacaciones`);
      } catch (e) { toast(e.message, true); }
      render(); break;
    }
    case 'vac-anterior': {
      const txt = $('#n-anterior').value, dias = Number(txt);
      if (txt !== '' && !Number.isFinite(dias)) { toast('Indicá la cantidad de días', true); break; }
      const concepto = 'Saldo de años anteriores';
      const primerAnio = Math.min(new Date().getFullYear(), ...Object.keys(almacen.datos.registros).map(f => +f.slice(0, 4)));
      try {
        for (const m of almacen.datos.movimientos.filter(m => m.banco === 'vacaciones' && m.concepto === concepto)) await almacen.borrarMovimiento(m.id);
        if (dias) await almacen.agregarMovimiento({ fecha: `${primerAnio}-01-01`, banco: 'vacaciones', cantidad: dias, concepto });
        toast(dias ? `Sumados ${dias} días de años anteriores` : 'Saldo anterior quitado');
      } catch (e) { toast(e.message, true); }
      render(); break;
    }
    case 'cargar-periodo': {
      const plan = planPeriodo();
      const tipo = ui.nov.tipo, quitar = tipo === 'Quitar novedad';
      if (!plan.dias.length) break;
      if (plan.reemplaza && !confirm(`${plan.reemplaza} de esos días ya tienen horarios u otra novedad. ¿Los reemplazo por ${tipo.toLowerCase()}?`)) break;
      const cambios = {};
      for (const f of plan.dias) {
        const r = almacen.datos.registros[f] || {};
        cambios[f] = quitar ? { entrada: r.entrada || '', salida: r.salida || '', novedad: 'Sin novedad', nota: r.nota || '' }
          : { entrada: '', salida: '', novedad: tipo, nota: r.nota || '' };
      }
      t.disabled = true;
      if (await guardar(cambios, quitar ? `Novedad quitada de ${plan.dias.length} días` : `${plan.dias.length} días de ${tipo.toLowerCase()} cargados`)) { ui.nov.desde = ''; ui.nov.hasta = ''; }
      render(); break;
    }
    case 'conectar': {
      t.disabled = true; t.textContent = 'Conectando…';
      try { await almacen.conectar($('#cadena').value); toast('Conectado. Tus datos ya se guardan en la base.'); }
      catch (e) { toast(e.message, true); }
      render(); break;
    }
    case 'desconectar':
      if (confirm('¿Desconectar la base? Los datos siguen en Neon y en este navegador.')) { almacen.desconectar(); render(); }
      break;
    case 'recargar': await almacen.recargar(); render(); toast('Datos actualizados desde la base'); break;
    case 'subir':
      try { await almacen.subirTodo(); toast('Todo subido a la base'); } catch (e) { toast(e.message, true); }
      render(); break;
  }
});

document.addEventListener('change', async ev => {
  const el = ev.target;
  if (el.id === 'ir-fecha' && el.value) return irSemana(el.value);
  if (el.id === 'sel-anio') { ui.anio = +el.value; return render(); }
  if (el.id === 'sel-mes') { ui.mes = el.value === 'todos' ? 'todos' : +el.value; return render(); }
  if (el.id === 'sel-anio-banco') { ui.anioBanco = el.value; return render(); }
  if (el.id === 'n-anio') { ui.nov.anio = +el.value; return render(); }
  if (['n-tipo', 'n-desde', 'n-hasta'].includes(el.id)) {
    ui.nov[el.id.slice(2)] = el.value;
    if (el.id === 'n-desde' && el.value && (!ui.nov.hasta || ui.nov.hasta < el.value)) ui.nov.hasta = el.value;
    return render();
  }
  if (el.id && el.id.startsWith('r-')) {
    const k = { 'r-desde': 'desde', 'r-hasta': 'hasta', 'r-entrada': 'entrada', 'r-salida': 'salida', 'r-novedad': 'novedad', 'r-vacios': 'soloVacios' }[el.id];
    if (k) ui.rango[k] = el.type === 'checkbox' ? el.checked : el.value;
    return;
  }
  if (!el.dataset.campo) return;
  await aplicarFila(el.closest('[data-fecha]'));
});

async function aplicarFila(fila) {
  const fecha = fila.dataset.fecha;
  const rec = leerFila(fila);
  const original = ui.borrador[fecha] || almacen.datos.registros[fecha];
  const norm = r => JSON.stringify({ entrada: r?.entrada || '', salida: r?.salida || '', novedad: r?.novedad || 'Sin novedad', nota: r?.nota || '' });
  if (norm(rec) === norm(original)) return render();
  if (rec.entrada && rec.salida && rec.salida <= rec.entrada) toast('La salida tiene que ser posterior a la entrada', true);
  if (ui.vista === 'semana') {
    await guardar({ [fecha]: rec });
  } else if (ui.vista === 'anual') {
    if (norm(rec) === norm(almacen.datos.registros[fecha])) delete ui.borrador[fecha]; else ui.borrador[fecha] = rec;
  }
  render();
}

// "Listo" se procesa al apoyar el dedo, antes de que el campo pierda el foco y se redibuje la fila.
document.addEventListener('pointerdown', async ev => {
  const t = ev.target.closest('[data-cerrar]');
  if (!t) return;
  ev.preventDefault();
  const fila = t.closest('[data-fecha]');
  ui.abiertos.delete(fila.dataset.fecha);
  if (document.activeElement && fila.contains(document.activeElement)) document.activeElement.blur();
  await aplicarFila(fila);
});

// ---------- carga de horas con teclado ----------
// Mientras se escribe: solo números y los dos puntos se ponen solos (1030 → 10:30, 930 → 09:30).
function formatearMientras(txt) {
  let d = txt.replace(/\D/g, '').slice(0, 4);
  if (d && +d[0] > 2) d = ('0' + d).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
}
// Al terminar: completa lo que falta (10 → 10:00, 10:3 → 10:30) y valida.
export function normalizarHora(txt) {
  const d = String(txt || '').replace(/\D/g, '');
  if (!d) return '';
  let h, m;
  if (d.length <= 2) { h = +d; m = 0; }
  else if (d.length === 3 && +d[0] > 2) { h = +d[0]; m = +d.slice(1); }
  else { h = +d.slice(0, 2); m = +(d.slice(2, 4) + '0').slice(0, 2); }
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
document.addEventListener('input', ev => {
  const el = ev.target;
  if (!el.classList || !el.classList.contains('hora')) return;
  const borrando = ev.inputType && ev.inputType.startsWith('delete');
  if (!borrando) el.value = formatearMientras(el.value);
  if (!borrando && el.value.length === 5) {
    // hora completa: pasar al campo siguiente
    const fila = el.closest('[data-fecha]');
    if (fila && el.dataset.campo === 'entrada') $('[data-campo=salida]', fila)?.focus();
    else if (el.id === 'r-entrada') $('#r-salida')?.focus();
    else if (fila) { ui.enfocar = true; el.blur(); } // salida completa: guardar y pasar al próximo día vacío
    else el.blur();
  }
});
document.addEventListener('change', ev => {
  const el = ev.target;
  if (!el.classList || !el.classList.contains('hora')) return;
  const n = normalizarHora(el.value);
  if (n === null) { toast('Hora inválida. Escribila como 1030 o 10:30', true); el.value = ''; }
  else el.value = n;
}, true);
document.addEventListener('focusin', ev => { if (ev.target.classList?.contains('hora')) ev.target.select(); });

window.addEventListener('beforeunload', e => { if (Object.keys(ui.borrador).length) { e.preventDefault(); e.returnValue = ''; } });

// ---------- versión ----------
// Si hay una versión publicada más nueva que la que está abierta, se recarga sola.
const VERSION = '202610261626';
async function verificarVersion() {
  if (Object.keys(ui.borrador).length) return;
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const { v } = await r.json();
    if (!v || v === VERSION) return;
    const clave = 'sirh-maru:recargado';
    if (sessionStorage.getItem(clave) === v) return; // evita recargar en bucle
    sessionStorage.setItem(clave, v);
    location.replace(`${location.pathname}?v=${v}`);
  } catch {}
}
verificarVersion();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verificarVersion(); });

// ---------- inicio ----------
{
  const d = new Date();
  $('#hoy-texto').textContent = `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  $('#menu-hoy').textContent = $('#hoy-texto').textContent;
}
almacen.alCambiar = pintarEstado;
ui.enfocar = conMouse;
render();
ui.enfocar = conMouse;
almacen.iniciar().then(() => { ui.enfocar = conMouse && !document.activeElement?.classList?.contains('campo'); render(); });

// Atajos: Re Pág / Av Pág cambian de semana
document.addEventListener('keydown', e => {
  if (ui.vista !== 'semana' || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'PageUp' || e.key === 'PageDown') {
    e.preventDefault();
    ui.lunes = iso(sumarDias(desdeIso(ui.lunes), e.key === 'PageUp' ? -7 : 7));
    ui.enfocar = true; render();
  }
});
