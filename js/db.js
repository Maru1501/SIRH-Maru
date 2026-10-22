// Guardado: siempre en el navegador y, si está configurado, en Neon (PostgreSQL).
import { neon } from './vendor/neon.mjs';

const LS_DATOS = 'sirh-maru:datos';
const LS_CONEXION = 'sirh-maru:neon';

const vacio = () => ({ registros: {}, movimientos: [] });

function leerLocal() {
  try { const d = JSON.parse(localStorage.getItem(LS_DATOS)); if (d && d.registros) return { ...vacio(), ...d }; } catch {}
  return vacio();
}
function escribirLocal(d) { try { localStorage.setItem(LS_DATOS, JSON.stringify(d)); } catch {} }

export function registroVacio(r) { return !r || (!r.entrada && !r.salida && (!r.novedad || r.novedad === 'Sin novedad') && !r.nota); }

const ESQUEMA = [
  `create table if not exists sirh_registros (
     fecha date primary key, entrada text, salida text,
     novedad text not null default 'Sin novedad', nota text,
     actualizado timestamptz not null default now())`,
  `create table if not exists sirh_movimientos (
     id text primary key, fecha date not null,
     banco text not null check (banco in ('horas','vacaciones')),
     cantidad numeric not null, concepto text,
     creado timestamptz not null default now())`,
];

const SQL_UPSERT = `insert into sirh_registros (fecha, entrada, salida, novedad, nota, actualizado)
  select (x->>'fecha')::date, nullif(x->>'entrada',''), nullif(x->>'salida',''),
         coalesce(nullif(x->>'novedad',''),'Sin novedad'), nullif(x->>'nota',''), now()
  from json_array_elements($1::json) x
  on conflict (fecha) do update set entrada = excluded.entrada, salida = excluded.salida,
    novedad = excluded.novedad, nota = excluded.nota, actualizado = now()`;

const SQL_MOVS = `insert into sirh_movimientos (id, fecha, banco, cantidad, concepto)
  select x->>'id', (x->>'fecha')::date, x->>'banco', (x->>'cantidad')::numeric, x->>'concepto'
  from json_array_elements($1::json) x
  on conflict (id) do update set fecha = excluded.fecha, banco = excluded.banco,
    cantidad = excluded.cantidad, concepto = excluded.concepto`;

class Almacen {
  constructor() {
    this.datos = leerLocal();
    this.sql = null;
    this.estado = 'local'; // local | conectando | nube | error
    this.error = '';
    this.alCambiar = () => {};
  }

  get conexion() { try { return localStorage.getItem(LS_CONEXION) || ''; } catch { return ''; } }

  avisar() { this.alCambiar(this.estado); }

  async iniciar() {
    if (this.conexion) await this.conectar(this.conexion, { silencioso: true });
  }

  async conectar(cadena, { silencioso = false } = {}) {
    cadena = (cadena || '').trim();
    if (!/^postgres(ql)?:\/\//.test(cadena)) throw new Error('La conexión tiene que empezar con postgresql://');
    this.estado = 'conectando'; this.avisar();
    try {
      const sql = neon(cadena, { disableWarningInBrowsers: true });
      for (const q of ESQUEMA) await sql.query(q);
      this.sql = sql;
      try { localStorage.setItem(LS_CONEXION, cadena); } catch {}
      const remoto = await this.bajar();
      const hayRemoto = Object.keys(remoto.registros).length || remoto.movimientos.length;
      const hayLocal = Object.keys(this.datos.registros).length || this.datos.movimientos.length;
      if (!hayRemoto && hayLocal) await this.subirTodo();
      else { this.datos = remoto; escribirLocal(this.datos); }
      this.estado = 'nube'; this.error = '';
      this.avisar();
    } catch (e) {
      this.sql = null;
      this.estado = 'error'; this.error = mensajeError(e);
      this.avisar();
      if (!silencioso) throw new Error(this.error);
    }
  }

  desconectar() {
    try { localStorage.removeItem(LS_CONEXION); } catch {}
    this.sql = null; this.estado = 'local'; this.error = ''; this.avisar();
  }

  async bajar() {
    const regs = await this.sql.query(`select fecha::text as fecha, entrada, salida, novedad, nota from sirh_registros order by fecha`);
    const movs = await this.sql.query(`select id, fecha::text as fecha, banco, cantidad::float8 as cantidad, concepto from sirh_movimientos order by fecha, creado`);
    const registros = {};
    for (const r of regs) registros[r.fecha] = { entrada: r.entrada || '', salida: r.salida || '', novedad: r.novedad || 'Sin novedad', nota: r.nota || '' };
    return { registros, movimientos: movs.map(m => ({ ...m, cantidad: Number(m.cantidad) })) };
  }

  async recargar() {
    if (!this.sql) return;
    try { this.datos = await this.bajar(); escribirLocal(this.datos); this.estado = 'nube'; this.error = ''; }
    catch (e) { this.estado = 'error'; this.error = mensajeError(e); }
    this.avisar();
  }

  async enNube(fn) {
    if (!this.sql) return;
    try { await fn(this.sql); this.estado = 'nube'; this.error = ''; this.pendiente = false; }
    catch (e) { this.estado = 'error'; this.error = mensajeError(e); this.pendiente = true; this.avisar(); throw new Error('Se guardó en este navegador, pero no en la base: ' + this.error); }
    this.avisar();
  }

  // cambios: { 'AAAA-MM-DD': {entrada, salida, novedad, nota} }
  async guardarRegistros(cambios) {
    const subir = [], borrar = [];
    for (const [fecha, r] of Object.entries(cambios)) {
      if (registroVacio(r)) { delete this.datos.registros[fecha]; borrar.push(fecha); }
      else { const limpio = { entrada: r.entrada || '', salida: r.salida || '', novedad: r.novedad || 'Sin novedad', nota: r.nota || '' }; this.datos.registros[fecha] = limpio; subir.push({ fecha, ...limpio }); }
    }
    escribirLocal(this.datos);
    await this.enNube(async sql => {
      for (let i = 0; i < subir.length; i += 200) await sql.query(SQL_UPSERT, [JSON.stringify(subir.slice(i, i + 200))]);
      if (borrar.length) await sql.query(`delete from sirh_registros where fecha = any($1::date[])`, [borrar]);
    });
  }

  async agregarMovimiento(m) {
    const mov = { id: crypto.randomUUID(), ...m };
    this.datos.movimientos.push(mov); escribirLocal(this.datos);
    await this.enNube(sql => sql.query(SQL_MOVS, [JSON.stringify([mov])]));
  }

  async borrarMovimiento(id) {
    this.datos.movimientos = this.datos.movimientos.filter(m => m.id !== id); escribirLocal(this.datos);
    await this.enNube(sql => sql.query(`delete from sirh_movimientos where id = $1`, [id]));
  }

  async subirTodo() {
    const regs = Object.entries(this.datos.registros).map(([fecha, r]) => ({ fecha, ...r }));
    const movs = this.datos.movimientos;
    await this.enNube(sql => sql.transaction([
      sql.query(`delete from sirh_registros`),
      sql.query(`delete from sirh_movimientos`),
      sql.query(SQL_UPSERT, [JSON.stringify(regs)]),
      sql.query(SQL_MOVS, [JSON.stringify(movs)]),
    ]));
  }

  exportar() {
    return { app: 'SIRH-Maru', version: 1, exportado: new Date().toISOString(), ...this.datos };
  }

  async importar(obj) {
    if (!obj || typeof obj.registros !== 'object') throw new Error('El archivo no parece una copia de esta app');
    const registros = {};
    for (const [f, r] of Object.entries(obj.registros)) if (/^\d{4}-\d{2}-\d{2}$/.test(f) && !registroVacio(r)) registros[f] = { entrada: r.entrada || '', salida: r.salida || '', novedad: r.novedad || 'Sin novedad', nota: r.nota || '' };
    const movimientos = (obj.movimientos || []).filter(m => m && m.fecha && (m.banco === 'horas' || m.banco === 'vacaciones'))
      .map(m => ({ id: m.id || crypto.randomUUID(), fecha: m.fecha, banco: m.banco, cantidad: Number(m.cantidad) || 0, concepto: m.concepto || '' }));
    this.datos = { registros, movimientos };
    escribirLocal(this.datos);
    await this.subirTodo();
  }
}

function mensajeError(e) {
  const t = String(e && e.message || e);
  if (/password authentication failed/i.test(t)) return 'La contraseña de la conexión no es correcta';
  if (/fetch|network|Failed to fetch/i.test(t)) return 'No se pudo llegar a la base (revisá internet o la conexión)';
  return t.length > 160 ? t.slice(0, 160) + '…' : t;
}

export const almacen = new Almacen();
