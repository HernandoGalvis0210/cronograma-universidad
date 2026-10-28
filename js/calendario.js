// Vista de calendario: selector Lista | Calendario y mes con las actividades.
import { estado, VISTAS } from './estado.js';
import { icon, render } from './ui.js';

// --- NOMBRES Y FECHAS ---
// Arreglos fijos en español (sin Intl). Las fechas son { y, m, d } y se construyen con
// números, nunca con new Date("texto"), para no depender de la zona horaria.
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIAS_LARGOS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

function fecha(y, m, d){ const x = new Date(y, m - 1, d); return { y: x.getFullYear(), m: x.getMonth() + 1, d: x.getDate() }; }
function sumarDias(f, n){ return fecha(f.y, f.m, f.d + n); }
function hoy(){ const x = new Date(); return { y: x.getFullYear(), m: x.getMonth() + 1, d: x.getDate() }; }
function diasDelMes(y, m){ return new Date(y, m, 0).getDate(); }
function diaSemana(f){ return (new Date(f.y, f.m - 1, f.d).getDay() + 6) % 7; } // 0 = lunes
// aaaammdd: sirve para comparar fechas y para data-fecha.
function clave(f){ return f.y * 10000 + f.m * 100 + f.d; }
function deClave(k){ return { y: Math.floor(k / 10000), m: Math.floor(k / 100) % 100, d: k % 100 }; }
function fechaLarga(f){ return `${f.d} de ${MESES[f.m - 1].toLowerCase()} de ${f.y}`; }
// ------------------------------------

// --- VISTA (Lista | Calendario) ---
export function vistaGuardada(){
  try { const v = localStorage.getItem('vista'); return VISTAS.includes(v) ? v : "lista"; }
  catch(e) { return "lista"; /* sin almacenamiento: Lista */ }
}

export function cambiarVista(vista){
  if(!VISTAS.includes(vista) || vista === estado.vista) return;
  estado.vista = vista;
  try { localStorage.setItem('vista', vista); } catch(e) { /* sin almacenamiento: dura hasta recargar */ }
  pintarSelector();
  render();
}

function pintarSelector(){
  document.querySelectorAll(".vista-btn").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.vista === estado.vista)));
}
// ------------------------------------

// --- CUADRÍCULA DEL MES ---
// Semanas de lunes a domingo; se completan con los días del mes anterior y del siguiente.
export function renderCalendario(){
  const { y, m } = estado.calMes;
  document.getElementById("calTitulo").textContent = `${MESES[m - 1]} ${y}`;
  const hoyF = hoy(), kHoy = clave(hoyF);
  // El día con tabindex="0" (foco con el teclado) siempre es del mes mostrado.
  if(!estado.calFoco || estado.calFoco.y !== y || estado.calFoco.m !== m){
    estado.calFoco = hoyF.y === y && hoyF.m === m ? hoyF : { y, m, d: 1 };
  }
  const kFoco = clave(estado.calFoco);

  const primero = { y, m, d: 1 }, kUltimo = clave({ y, m, d: diasDelMes(y, m) });
  let html = `<div class="cal-semana cal-encabezado" role="row">${DIAS_CORTOS.map((dia, i) =>
    `<div class="cal-dia-semana${i >= 5 ? ' cal-finde' : ''}" role="columnheader"><span aria-hidden="true">${dia}</span><span class="sr-only">${DIAS_LARGOS[i]}</span></div>`).join("")}</div>`;
  for(let ini = sumarDias(primero, -diaSemana(primero)); clave(ini) <= kUltimo; ini = sumarDias(ini, 7)){
    html += semanaHTML(ini, m, kHoy, kFoco);
  }
  document.getElementById("calGrid").innerHTML = html;
}

function semanaHTML(ini, mes, kHoy, kFoco){
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(ini, i));
  const celdas = dias.map((f, i) => {
    const k = clave(f), esHoy = k === kHoy;
    const clases = ["cal-dia", f.m !== mes && "cal-fuera", i >= 5 && "cal-finde", esHoy && "cal-hoy"].filter(Boolean).join(" ");
    return `<div class="cal-celda" role="gridcell" style="grid-column:${i + 1}">
     <button type="button" class="${clases}" data-action="cal-dia" data-fecha="${k}" tabindex="${k === kFoco ? 0 : -1}" aria-label="${fechaLarga(f)}"${esHoy ? ' aria-current="date"' : ''}>
      <span class="cal-num" aria-hidden="true">${f.d}</span>
     </button>
    </div>`;
  }).join("");
  return `<div class="cal-semana" role="row">${celdas}</div>`;
}
// ------------------------------------

// --- NAVEGACIÓN ENTRE MESES ---
function mostrarMes(y, m, foco = null){
  const f = fecha(y, m, 1);
  estado.calMes = { y: f.y, m: f.m };
  estado.calFoco = foco;
  renderCalendario();
  const grid = document.getElementById("calGrid");
  grid.classList.remove("cal-cambio"); void grid.offsetWidth; grid.classList.add("cal-cambio");
  document.getElementById("calAnuncio").textContent = `${MESES[estado.calMes.m - 1]} ${estado.calMes.y}`;
}
export function mesAnterior(){ mostrarMes(estado.calMes.y, estado.calMes.m - 1); }
export function mesSiguiente(){ mostrarMes(estado.calMes.y, estado.calMes.m + 1); }
export function irAHoy(){ const h = hoy(); mostrarMes(h.y, h.m, h); }
// ------------------------------------

// Se llama una vez al arrancar, desde iniciarInterfaz().
export function iniciarCalendario(){
  document.querySelectorAll(".vista-btn").forEach(b => b.insertAdjacentHTML("afterbegin", icon(b.dataset.vista)));
  document.querySelectorAll(".cal-flecha").forEach(b => { b.innerHTML = icon(b.dataset.icono); });
  const h = hoy();
  estado.calMes = { y: h.y, m: h.m };
  estado.vista = vistaGuardada();
  pintarSelector();
  render();
}
