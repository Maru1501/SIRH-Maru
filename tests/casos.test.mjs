import assert from 'node:assert/strict';
import { calcularDia, libroBancoHoras, libroBancoVacaciones } from '../js/calc.js';
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
  const c = calcularDia(regs['2026-03-02']); assert.equal(c.computadas, 0); assert.equal(c.descuento, 0);
});
caso('Banco 68 h + 5 h → 70, 3 h perdidas', () => {
  const regs = { '2026-03-02': { entrada: '08:00', salida: '20:00', novedad: 'Sin novedad' } }; // 12 h → +5
  const b = libroBancoHoras(regs, [{ banco: 'horas', fecha: '2026-01-01', cantidad: h(68) }]);
  assert.equal(b.saldo, h(70)); assert.equal(b.perdidas, h(3));
});
caso('Descuento que dejaría negativo → queda en 0', () => {
  const regs = { '2026-03-02': { entrada: '13:00', salida: '17:00', novedad: 'Entrada Demorada' } };
  const b = libroBancoHoras(regs, [{ banco: 'horas', fecha: '2026-01-01', cantidad: h(1) }]);
  assert.equal(b.saldo, 0); assert.equal(b.sinDescontar, h(2));
});
caso('Capacitación: registra, no computa, no descuenta', () => {
  const c = calcularDia({ novedad: 'Capacitación', entrada: '10:00', salida: '12:00' });
  assert.equal(c.computadas, 0); assert.equal(c.descuento, 0); assert.match(c.estado, /Capacitación/);
});
caso('Falta una hora → No Entrada / No Salida', () => {
  assert.equal(calcularDia({ salida: '17:00' }).estado, 'No Entrada');
  assert.equal(calcularDia({ entrada: '10:00' }).estado, 'No Salida');
});
caso('Salida anterior a entrada → error', () => {
  assert.equal(calcularDia({ entrada: '17:00', salida: '10:00' }).estado, 'Revisar horario');
});
console.log(`\n${ok} casos OK`);
