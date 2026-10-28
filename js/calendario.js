// Vista de calendario: selector Lista | Calendario y mes con las actividades.
import { estado, VISTAS } from './estado.js';
import { icon, escapeHtml, render, actividadesFiltradas, tarjetaHTML } from './ui.js';
import { partesFecha } from './actividades.js';

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
function fechaValida(f){ return f.y >= 1900 && f.y <= 2200 && f.m >= 1 && f.m <= 12 && f.d >= 1 && f.d <= diasDelMes(f.y, f.m); }
function textoCuenta(n){ return n === 0 ? "sin actividades" : n === 1 ? "1 actividad" : `${n} actividades`; }
// ------------------------------------

// --- FECHAS DE LAS ACTIVIDADES ---
// "dd/mm/aaaa" o "dd/mm/aaaa - dd/mm/aaaa". Devuelve { ini, fin } en aaaammdd, o null si el
// inicio no es una fecha real. Si el fin falta, no es válido o es anterior, ocupa solo el inicio.
function rangoDeFechas(a){
  const [t1, t2] = String(a.date ?? "").split(/\s+-\s+/);
  const inicio = partesFecha(t1);
  if(!inicio || !fechaValida(inicio)) return null;
  const fin = t2 ? partesFecha(t2) : null;
  const ini = clave(inicio), kFin = fin && fechaValida(fin) ? clave(fin) : ini;
  return { ini, fin: Math.max(ini, kFin) };
}

// Actividades del filtro activo: con fecha (ordenadas por inicio y, a igual inicio, la más larga
// primero) y sin fecha válida.
function actividadesDelCalendario(){
  const conFecha = [], sinFecha = [];
  for(const a of actividadesFiltradas()){
    const r = rangoDeFechas(a);
    if(r) conFecha.push({ a, ...r }); else sinFecha.push(a);
  }
  conFecha.sort((p, q) => p.ini - q.ini || q.fin - p.fin || Number(p.a.id) - Number(q.a.id));
  return { conFecha, sinFecha };
}

function actividadesDelDia(k){
  return actividadesDelCalendario().conFecha.filter(v => v.ini <= k && k <= v.fin).map(v => v.a);
}
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
  const { conFecha, sinFecha } = actividadesDelCalendario();

  const primero = { y, m, d: 1 }, kUltimo = clave({ y, m, d: diasDelMes(y, m) });
  let html = `<div class="cal-semana cal-encabezado" role="row">${DIAS_CORTOS.map((dia, i) =>
    `<div class="cal-dia-semana${i >= 5 ? ' cal-finde' : ''}" role="columnheader"><span aria-hidden="true">${dia}</span><span class="sr-only">${DIAS_LARGOS[i]}</span></div>`).join("")}</div>`;
  for(let ini = sumarDias(primero, -diaSemana(primero)); clave(ini) <= kUltimo; ini = sumarDias(ini, 7)){
    html += semanaHTML(ini, m, kHoy, kFoco, conFecha);
  }
  document.getElementById("calGrid").innerHTML = html;

  const aviso = document.getElementById("calSinFecha");
  aviso.hidden = !sinFecha.length;
  aviso.innerHTML = sinFecha.length ? `<p><b>${sinFecha.length === 1 ? "1 actividad sin fecha válida" : `${sinFecha.length} actividades sin fecha válida`}</b>: no aparecen en el calendario.</p>
   <button type="button" class="cancel" data-action="cal-ver-lista">Verlas en la vista Lista</button>` : "";

  renderDetalle(); // si está abierto, refleja los cambios (realtime, estado, edición, eliminación)
}

// Etiquetas visibles por semana en pantallas anchas; si un día tiene más, muestra "+N más".
const MAX_CARRILES = 3;
const ORDEN_ESTADOS = ["pending", "approved", "done"];

// Una semana: siete celdas (cada día es un botón) y, encima, una etiqueta por tramo de
// actividad. Un rango se parte por semanas: cada tramo lleva el título y continúa en la siguiente.
function semanaHTML(ini, mes, kHoy, kFoco, conFecha){
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(ini, i));
  const claves = dias.map(clave);
  const tramos = conFecha.filter(v => v.ini <= claves[6] && v.fin >= claves[0]).map(v => ({
    v, c1: v.ini < claves[0] ? 0 : claves.indexOf(v.ini), c2: v.fin > claves[6] ? 6 : claves.indexOf(v.fin),
    sigueAntes: v.ini < claves[0], sigueDespues: v.fin > claves[6]
  }));
  // Carriles: cada tramo ocupa el primero libre desde su día de inicio.
  const finCarril = [];
  for(const t of tramos){
    let c = finCarril.findIndex(fin => fin < t.c1);
    if(c === -1) c = finCarril.length;
    finCarril[c] = t.c2; t.carril = c;
  }
  const delDia = i => tramos.filter(t => t.c1 <= i && i <= t.c2);

  const celdas = dias.map((f, i) => {
    const k = claves[i], esHoy = k === kHoy, delD = delDia(i), n = delD.length;
    const clases = ["cal-dia", f.m !== mes && "cal-fuera", i >= 5 && "cal-finde", esHoy && "cal-hoy"].filter(Boolean).join(" ");
    // En pantallas angostas: un punto por cada estado presente ese día.
    const puntos = ORDEN_ESTADOS.filter(s => delD.some(t => t.v.a.status === s)).map(s => `<span class="cal-punto cal-estado-${s}"></span>`).join("");
    return `<div class="cal-celda" role="gridcell" style="grid-column:${i + 1}">
     <button type="button" class="${clases}" data-action="cal-dia" data-fecha="${k}" tabindex="${k === kFoco ? 0 : -1}" aria-label="${fechaLarga(f)}, ${textoCuenta(n)}"${esHoy ? ' aria-current="date"' : ''}>
      <span class="cal-num" aria-hidden="true">${f.d}</span>
      ${puntos ? `<span class="cal-puntos" aria-hidden="true">${puntos}</span>` : ''}
     </button>
    </div>`;
  }).join("");

  // Las etiquetas repiten lo que anuncia el botón del día: son atajos para el puntero (aria-hidden).
  const etiquetas = tramos.filter(t => t.carril < MAX_CARRILES).map(t => {
    const a = t.v.a, estadoA = ORDEN_ESTADOS.includes(a.status) ? a.status : "pending";
    const clases = ["cal-etiqueta", `cal-estado-${estadoA}`, t.sigueAntes && "sigue-antes", t.sigueDespues && "sigue-despues"].filter(Boolean).join(" ");
    return `<div class="${clases}" style="grid-column:${t.c1 + 1}/${t.c2 + 2};grid-row:${t.carril + 2}" data-action="cal-actividad" data-id="${Number(a.id)}" data-fecha="${claves[t.c1]}" title="${escapeHtml(a.title)}" aria-hidden="true">${escapeHtml(a.title)}</div>`;
  }).join("");
  const mas = dias.map((f, i) => {
    const ocultos = delDia(i).filter(t => t.carril >= MAX_CARRILES).length;
    return ocultos ? `<div class="cal-mas" style="grid-column:${i + 1}" data-action="cal-dia" data-fecha="${claves[i]}" aria-hidden="true">+${ocultos} más</div>` : "";
  }).join("");

  return `<div class="cal-semana" role="row">${celdas}${etiquetas}${mas}</div>`;
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

// Mismo día en otro mes (o el último, si no existe: 31 de enero → 28 o 29 de febrero).
function mismoDiaOtroMes(f, n){
  const p = fecha(f.y, f.m + n, 1);
  return { ...p, d: Math.min(f.d, diasDelMes(p.y, p.m)) };
}

// Teclado en la cuadrícula: flechas (día y semana), Inicio/Fin (semana) y RePág/AvPág (mes).
// Si el día de destino es de otro mes, se muestra ese mes.
function teclaEnCuadricula(e){
  const btn = e.target.closest(".cal-dia");
  if(!btn) return;
  const f = deClave(Number(btn.dataset.fecha));
  const destinos = {
    ArrowLeft: () => sumarDias(f, -1), ArrowRight: () => sumarDias(f, 1),
    ArrowUp: () => sumarDias(f, -7), ArrowDown: () => sumarDias(f, 7),
    Home: () => sumarDias(f, -diaSemana(f)), End: () => sumarDias(f, 6 - diaSemana(f)),
    PageUp: () => mismoDiaOtroMes(f, -1), PageDown: () => mismoDiaOtroMes(f, 1)
  };
  if(!destinos[e.key]) return;
  e.preventDefault();
  const dest = destinos[e.key]();
  if(dest.y !== estado.calMes.y || dest.m !== estado.calMes.m) mostrarMes(dest.y, dest.m, dest);
  const b = marcarFoco(dest);
  if(b) b.focus();
}
// ------------------------------------

// --- DETALLE DE UN DÍA O DE UNA ACTIVIDAD ---
// Reutiliza la tarjeta de la lista (tarjetaHTML), abierta: mismas acciones y permisos por rol.
export function abrirDetalle(detalle, origen){
  if(detalle.tipo === "dia"){
    const f = deClave(detalle.fecha);
    if(f.y === estado.calMes.y && f.m === estado.calMes.m) marcarFoco(f);
    if(!actividadesDelDia(detalle.fecha).length) return; // día vacío: no hay nada que abrir
  }
  estado.calDetalle = detalle;
  // Al cerrar, el foco vuelve al botón del día (las etiquetas y "+N más" no reciben foco).
  estado.calRetornoFoco = detalle.tipo === "dia" ? detalle.fecha : Number(origen?.dataset.fecha) || null;
  document.getElementById("calDetalle").classList.add("show");
  renderDetalle();
  document.getElementById("calDetalleCerrar").focus();
}

export function cerrarDetalle(){
  const modal = document.getElementById("calDetalle");
  if(!modal.classList.contains("show")) return;
  modal.classList.remove("show");
  estado.calDetalle = null;
  document.getElementById("calDetalleLista").innerHTML = "";
  const k = estado.calRetornoFoco;
  estado.calRetornoFoco = null;
  const dia = (k && document.querySelector(`.cal-dia[data-fecha="${k}"]`)) || document.querySelector('.cal-dia[tabindex="0"]');
  if(dia) dia.focus();
}

function renderDetalle(){
  const d = estado.calDetalle;
  if(!d) return;
  let lista, titulo, resumen = "";
  if(d.tipo === "actividad"){
    const a = estado.activities.find(x => Number(x.id) === d.id);
    if(!a){ cerrarDetalle(); return; } // se eliminó
    lista = [a];
    titulo = "Detalle de la actividad";
  } else {
    lista = actividadesDelDia(d.fecha);
    titulo = fechaLarga(deClave(d.fecha));
    resumen = textoCuenta(lista.length);
    resumen = resumen[0].toUpperCase() + resumen.slice(1);
  }
  const caja = document.getElementById("calDetalleLista");
  const box = caja.closest(".modal-box");
  // Un cambio que llega con el detalle abierto no debe perder el foco ni lo escrito en las notas.
  const habiaFoco = caja.contains(document.activeElement);
  const idActivo = habiaFoco ? document.activeElement.id : "";
  const borradores = [...caja.querySelectorAll("textarea")].filter(t => t.value).map(t => [t.id, t.value]);
  const scroll = box.scrollTop;

  document.getElementById("calDetalleTitulo").textContent = titulo;
  const res = document.getElementById("calDetalleResumen");
  res.textContent = resumen;
  res.hidden = !resumen;
  caja.innerHTML = lista.length
    ? lista.map(a => `<article class="cal-detalle-item">${tarjetaHTML(a, true)}</article>`).join("")
    : '<p class="empty">No hay actividades en este día con el filtro actual.</p>';

  borradores.forEach(([id, valor]) => { const t = document.getElementById(id); if(t) t.value = valor; });
  box.scrollTop = scroll;
  if(habiaFoco){
    const el = idActivo && document.getElementById(idActivo);
    (el && caja.contains(el) ? el : document.getElementById("calDetalleCerrar")).focus();
  }
}
// ------------------------------------

// El día con tabindex="0" es el que recibe el foco al entrar en la cuadrícula con Tab.
function marcarFoco(f){
  estado.calFoco = f;
  document.querySelectorAll('.cal-dia[tabindex="0"]').forEach(b => { b.tabIndex = -1; });
  const b = document.querySelector(`.cal-dia[data-fecha="${clave(f)}"]`);
  if(b) b.tabIndex = 0;
  return b;
}

// Se llama una vez al arrancar, desde iniciarInterfaz().
export function iniciarCalendario(){
  document.getElementById("calGrid").addEventListener("keydown", teclaEnCuadricula);
  // Detalle: cierre al pulsar fuera, Esc y foco atrapado (salvo si encima está el formulario).
  const modal = document.getElementById("calDetalle");
  modal.addEventListener("click", e => { if(e.target === modal) cerrarDetalle(); });
  document.addEventListener("keydown", e => {
    if(!modal.classList.contains("show") || document.querySelector("#activityModal.show, #loginModal.show")) return;
    if(e.key === "Escape"){ e.preventDefault(); cerrarDetalle(); return; }
    if(e.key !== "Tab") return;
    const focusables = [...modal.querySelectorAll('a[href], button:not([disabled]), select, textarea, input:not([type="hidden"]):not([hidden])')]
      .filter(el => el.getClientRects().length);
    const first = focusables[0], last = focusables[focusables.length - 1];
    if(!modal.contains(document.activeElement)){ e.preventDefault(); first.focus(); }
    else if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  });

  document.querySelectorAll(".vista-btn").forEach(b => b.insertAdjacentHTML("afterbegin", icon(b.dataset.vista)));
  document.querySelectorAll(".cal-flecha").forEach(b => { b.innerHTML = icon(b.dataset.icono); });
  const h = hoy();
  estado.calMes = { y: h.y, m: h.m };
  estado.vista = vistaGuardada();
  pintarSelector();
  render();
}
