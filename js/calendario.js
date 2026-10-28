// Vista de calendario: selector Lista | Calendario y mes con las actividades.
import { estado, VISTAS } from './estado.js';
import { icon, render } from './ui.js';

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

export function renderCalendario(){
}

// Se llama una vez al arrancar, desde iniciarInterfaz().
export function iniciarCalendario(){
  document.querySelectorAll(".vista-btn").forEach(b => b.insertAdjacentHTML("afterbegin", icon(b.dataset.vista)));
  estado.vista = vistaGuardada();
  pintarSelector();
  render();
}
