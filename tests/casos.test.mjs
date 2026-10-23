import assert from 'node:assert/strict';
import { CONFIG_DEFAULT as BASE, calcularDia as cd, calcularSemana as cs, libroBancoHoras as lbh, libroBancoVacaciones } from '../js/calc.js';
const CONFIG_DEFAULT = { ...BASE, excedenteSemanal: true };
const calcularDia = (r, c = CONFIG_DEFAULT) => cd(r, c), calcularSemana = (l, r, c = CONFIG_DEFAULT) => cs(l, r, c), libroBancoHoras = (r, m, c = CONFIG_DEFAULT) => lbh(r, m, c);
const h = n => n * 60;
let ok = 0;
function caso(nombre, fn) { fn(); ok++; console.log('✓', nombre); }

caso('13 a 17 + Entrada Demorada', () => {
  const c = calcularDia({ entrada: '13:00', salida: '17:00', novedad: 'Entrada Demorada' });
  assert.equal(c.trabajadas, h(4)); assert.equal(c.computadas, h(7)); assert.equal(c.descuento, h(3)); assert.match(c.estado, /^Presente/);
});
caso('10 a 14 + Salida Anticipada', () => {
  const c = calcularDia({ entrada: '10:00', salida: '14:00', novedad: 'Salida Anticipada' });
  assert.equal(c.trabajadas, h(4)); assert.equal(c.computadas, h(7)); assert.equal(c.descuento, h(3)); assert.match(c.estado, /^Presente/);
});
caso('10 a 17 sin novedad', () => {
  const c = calcularDia({ entrada: '10:00', salida: '17:00', novedad: 'Sin novedad' });
  assert.equal(c.trabajadas, h(7)); assert.equal(c.computadas, h(7)); assert.equal(c.descuento, 0); assert.equal(c.estado, 'Presente');
});
caso('10 a 13 (3 h) → Revisar', () => {
  const c = calcularDia({ entrada: '10:00', salida: '13:00', novedad: 'Sin novedad' });
  assert.equal(c.trabajadas, h(3)); assert.equal(c.computadas, 0); assert.equal(c.descuento, 0); assert.equal(c.estado, 'Revisar');
});
caso('Vacaciones → −1 día', () => {
  const regs = { '2026-03-02': { novedad: 'Vacaciones' } };
  const v = libroBancoVacaciones(regs, [{ banco: 'vacaciones', fecha: '2026-01-01', cantidad: 10 }]);
  assert.equal(v.saldo, 9);
  const c = calcularDia(regs['2026-03-02']); assert.equal(c.computadas, h(7)); assert.equal(c.descuento, 0); assert.match(c.estado, /^Presente/);
});
caso('Banco 68 h + 5 h → 70, 3 h perdidas', () => {
  const regs = { '2026-03-02': { entrada: '07:00', salida: '19:00' } }; // 12 h → +5 h
  const b = libroBancoHoras(regs, [{ banco: 'horas', fecha: '2026-01-01', cantidad: h(68) }]);
  assert.equal(b.saldo, h(70)); assert.equal(b.perdidas, h(3));
});
caso('Horas reales: Lun 9 + Mar 8 + Mié 6 + Jue 5 = 28 → cumplida, sin banco', () => {
  const regs = { '2026-10-19': { entrada: '09:00', salida: '18:00' }, '2026-10-20': { entrada: '10:00', salida: '18:00' },
    '2026-10-21': { entrada: '10:00', salida: '16:00' }, '2026-10-22': { entrada: '10:00', salida: '15:00' } };
  const s = calcularSemana('2026-10-19', regs); assert.equal(s.computadas, h(28)); assert.equal(s.falta, 0); assert.equal(s.credito, 0);
});
caso('Saldo día a día: Lun 9-15, Mar 9-15, Mié 9-19', () => {
  const regs = { '2026-10-19': { entrada: '09:00', salida: '15:00' } };
  assert.equal(calcularSemana('2026-10-19', regs).saldo, -h(1));
  regs['2026-10-20'] = { entrada: '09:00', salida: '15:00' };
  assert.equal(calcularSemana('2026-10-19', regs).saldo, -h(2));
  regs['2026-10-21'] = { entrada: '09:00', salida: '19:00' };
  assert.equal(calcularSemana('2026-10-19', regs).saldo, h(1));
});
caso('Semana de Maru: 2 vacaciones + 9:30 + 8:30 + home office → acumula 4 h', () => {
  const regs = { '2026-10-19': { novedad: 'Vacaciones' }, '2026-10-20': { novedad: 'Vacaciones' },
    '2026-10-21': { entrada: '09:25', salida: '18:55' }, '2026-10-22': { entrada: '10:30', salida: '19:20' }, '2026-10-23': { novedad: 'Home office' } };
  const s = calcularSemana('2026-10-19', regs);
  assert.equal(s.trabajadas, h(18)); assert.equal(s.saldo, h(4)); assert.equal(s.faltanDias, 0);
  assert.equal(libroBancoHoras(regs, []).saldo, h(4));
});
caso('Modo diario (tope 7 h/día) sigue disponible', () => {
  const cfg = { ...CONFIG_DEFAULT, excedenteSemanal: false };
  const regs = { '2026-03-02': { entrada: '07:00', salida: '19:00' } };
  assert.equal(calcularDia(regs['2026-03-02'], cfg).computadas, h(7));
  assert.equal(libroBancoHoras(regs, [], cfg).saldo, h(5));
});
caso('Descuento que dejaría negativo → queda en 0', () => {
  const regs = { '2026-03-02': { entrada: '13:00', salida: '17:00', novedad: 'Entrada Demorada' } };
  const b = libroBancoHoras(regs, [{ banco: 'horas', fecha: '2026-01-01', cantidad: h(1) }]);
  assert.equal(b.saldo, 0); assert.equal(b.sinDescontar, h(2));
});
caso('Capacitación: cuenta 7 h, no descuenta banco', () => {
  const c = calcularDia({ novedad: 'Capacitación', entrada: '10:00', salida: '12:00' });
  assert.equal(c.computadas, h(7)); assert.equal(c.descuento, 0); assert.match(c.estado, /capacitación/);
});
caso('Franco: cuenta 7 h y descuenta 7 h del banco', () => {
  const regs = { '2026-03-02': { novedad: 'Franco' } };
  const c = calcularDia(regs['2026-03-02']); assert.equal(c.computadas, h(7)); assert.equal(c.descuento, h(7));
  const b = libroBancoHoras(regs, [{ banco: 'horas', fecha: '2026-01-01', cantidad: h(10) }]);
  assert.equal(b.saldo, h(3));
});
caso('Lun 7 + Mar 7 + Mié 7 + Jue vacaciones = semana cumplida sin banco', () => {
  const regs = { '2026-10-19': { entrada: '10:00', salida: '17:00' }, '2026-10-20': { entrada: '10:00', salida: '17:00' },
    '2026-10-21': { entrada: '10:00', salida: '17:00' }, '2026-10-22': { novedad: 'Vacaciones' } };
  const s = calcularSemana('2026-10-19', regs); assert.equal(s.computadas, h(28)); assert.equal(s.falta, 0);
  assert.equal(libroBancoHoras(regs, []).saldo, 0);
});
caso('Lun 9:36 + Mar 7:30 + Mié y Jue vacaciones = cumplida, +3:06 al banco', () => {
  const regs = { '2026-10-19': { entrada: '09:22', salida: '18:58' }, '2026-10-20': { entrada: '10:35', salida: '18:05' },
    '2026-10-21': { novedad: 'Vacaciones' }, '2026-10-22': { novedad: 'Vacaciones' } };
  const s = calcularSemana('2026-10-19', regs); assert.equal(s.falta, 0); assert.equal(libroBancoHoras(regs, []).saldo, 186);
});
caso('Salida 19:35 cuenta hasta las 19:00', () => {
  const c = calcularDia({ entrada: '10:30', salida: '19:20' });
  assert.equal(c.trabajadas, h(8) + 30);
  assert.equal(calcularDia({ entrada: '10:00', salida: '19:35' }).trabajadas, h(9));
});
caso('Home office: registra el día, no suma horas ni banco', () => {
  const c = calcularDia({ novedad: 'Home office' });
  assert.equal(c.computadas, 0); assert.equal(c.descuento, 0); assert.equal(c.estado, 'Presente (home office)');
});
caso('Falta una hora → No Entrada / No Salida', () => {
  assert.equal(calcularDia({ salida: '17:00' }).estado, 'No Entrada');
  assert.equal(calcularDia({ entrada: '10:00' }).estado, 'No Salida');
});
caso('Salida anterior a entrada → error', () => {
  assert.equal(calcularDia({ entrada: '17:00', salida: '10:00' }).estado, 'Revisar horario');
});
console.log(`\n${ok} casos OK`);
