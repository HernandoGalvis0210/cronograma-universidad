// Interfaz: iconos, tema, render de la línea de tiempo, filtros, modales y eventos.
import { estado, statusText, UPLOAD_ACCEPT, PERMISSION_MSG, SEDES_FIJAS, VALOR_TODOS_LOS_DIAS } from './estado.js';
import { canEdit, canDelete, isAdmin, closeLoginModal, submitLogin } from './auth.js';
import { saveActivity, deleteActivity, changeStatus, activityDateValue, diasDeInputModal, parseLocationEntries } from './actividades.js';
import { renderNotesLog, deleteNote, appendNote, canManageNotes } from './notas.js';
import { fileHTML, findFile, addFiles, downloadFile, removeFile } from './archivos.js';
import { renderCalendario, cambiarVista, iniciarCalendario, mesAnterior, mesSiguiente, irAHoy, abrirDetalle, cerrarDetalle } from './calendario.js';

// --- ICONOS (SVG de línea, heredan el color del texto) ---
// Decorativos: siempre aria-hidden; el texto o el aria-label del control
// es el que da el significado.
const ICONOS = {
  sede: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  persona: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  archivo: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  luna: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  anterior: '<path d="m15 18-6-6 6-6"/>',
  siguiente: '<path d="m9 18 6-6-6-6"/>'
};
export function icon(nombre){
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONOS[nombre]}</svg>`;
}
// ------------------------------------

// --- CONFIGURACIÓN DE TEMA OSCURO ---
// El icono muestra el tema actual (sol en claro, luna en oscuro); aria-pressed indica si el oscuro está activo.
export function paintThemeButton(){
  const isDark = document.body.classList.contains('dark-mode');
  const btn = document.getElementById('themeToggle');
  const label = isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
  btn.innerHTML = icon(isDark ? 'luna' : 'sol');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-pressed', String(isDark));
}
export function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch(e) { /* sin almacenamiento: dura hasta recargar */ }
  paintThemeButton();
}
// ------------------------------------

// El estado solo lo eligen los revisores; las actividades nuevas de los
// demás se crean como pendientes.
export function syncStatusField(){
 document.getElementById("fStatusField").hidden = !canEdit();
 syncLocationPermissions();
}

function normalizarSede(valor){
 return String(valor || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function poblarSelectFechasSede(selectEl, diasRango, valorDeseado = ""){
 if(!selectEl) return;
 if(diasRango.length === 0){
   selectEl.innerHTML = `<option value="">Selecciona primero la fecha de inicio</option>`;
   selectEl.disabled = true;
   return;
 }
 if(diasRango.length === 1){
   selectEl.innerHTML = `<option value="${escapeHtml(diasRango[0].label)}">${escapeHtml(diasRango[0].label)} (único día)</option>`;
   selectEl.disabled = true;
   return;
 }
 selectEl.disabled = false;
 selectEl.innerHTML = `<option value="${VALOR_TODOS_LOS_DIAS}">Todos los días del rango</option>`
   + diasRango.map(d => `<option value="${escapeHtml(d.label)}">${escapeHtml(d.label)}</option>`).join("");
 const normDeseado = normalizarSede(valorDeseado);
 const encontrado = normDeseado && normDeseado !== normalizarSede(VALOR_TODOS_LOS_DIAS)
   ? diasRango.find(d => normalizarSede(d.label) === normDeseado)
   : null;
 selectEl.value = encontrado ? encontrado.label : VALOR_TODOS_LOS_DIAS;
}

export function actualizarOpcionesFechasSedes(){
 const startInput = document.getElementById("fDateStart");
 const endInput = document.getElementById("fDateEnd");
 if(startInput && endInput){
   endInput.min = startInput.value || "";
 }
 const dias = diasDeInputModal();
 document.querySelectorAll("#fLocationFixedList .sede-detail-select, #fLocationCustomList .sede-custom-detail").forEach(sel => {
   const prev = sel.dataset.pendingValue !== undefined ? sel.dataset.pendingValue : sel.value;
   delete sel.dataset.pendingValue;
   poblarSelectFechasSede(sel, dias, prev);
 });
}

export function renderFixedSedes(){
 const container = document.getElementById("fLocationFixedList");
 if(!container) return;
 const dias = diasDeInputModal();
 container.innerHTML = SEDES_FIJAS.map(sede => `
  <div class="sede-item" data-sede="${escapeHtml(sede)}">
   <label class="sede-check-label">
    <input type="checkbox" class="sede-checkbox" value="${escapeHtml(sede)}">
    <span>${escapeHtml(sede)}</span>
   </label>
   <select class="sede-detail-select" aria-label="Fecha para ${escapeHtml(sede)}" hidden disabled></select>
  </div>
 `).join("");
 container.querySelectorAll(".sede-detail-select").forEach(sel => poblarSelectFechasSede(sel, dias));
}

export function addCustomSedeRow(name = "", detail = "", focusInput = false){
 if(!isAdmin()){ alert(PERMISSION_MSG); return; }
 const customList = document.getElementById("fLocationCustomList");
 if(!customList) return;
 customList.hidden = false;
 const row = document.createElement("div");
 row.className = "sede-custom-row";
 row.innerHTML = `
  <input type="text" class="sede-custom-name" maxlength="150" placeholder="Nombre de la sede (ej: Salud)" value="${escapeHtml(name)}">
  <select class="sede-custom-detail" aria-label="Fecha para otra sede"></select>
  <button type="button" class="delete note-remove sede-custom-remove" data-action="remove-custom-sede" title="Quitar sede" aria-label="Quitar sede">Quitar</button>
 `;
 customList.appendChild(row);
 poblarSelectFechasSede(row.querySelector(".sede-custom-detail"), diasDeInputModal(), detail);
 if(focusInput) row.querySelector(".sede-custom-name")?.focus();
}

export function syncLocationPermissions(){
 const admin = isAdmin();
 const addBtn = document.getElementById("fAddCustomSedeBtn");
 const customList = document.getElementById("fLocationCustomList");
 if(addBtn) addBtn.hidden = !admin;
 if(customList){
   customList.hidden = !admin;
   if(!admin) customList.innerHTML = "";
 }
}

export function setLocationFieldValue(locationValue = ""){
 const admin = isAdmin();
 const startInput = document.getElementById("fDateStart");
 const endInput = document.getElementById("fDateEnd");
 if(startInput && endInput) endInput.min = startInput.value || "";
 renderFixedSedes();
 const customList = document.getElementById("fLocationCustomList");
 if(customList) customList.innerHTML = "";
 syncLocationPermissions();

 const dias = diasDeInputModal();
 const entries = parseLocationEntries(locationValue);
 const fixedItems = [...document.querySelectorAll("#fLocationFixedList .sede-item")];

 entries.forEach(({ name, detail }) => {
   const normName = normalizarSede(name);
   const fixedItem = fixedItems.find(el => normalizarSede(el.dataset.sede) === normName);
   if(fixedItem){
     const cb = fixedItem.querySelector(".sede-checkbox");
     const detailSelect = fixedItem.querySelector(".sede-detail-select");
     cb.checked = true;
     fixedItem.classList.add("is-selected");
     detailSelect.hidden = false;
     poblarSelectFechasSede(detailSelect, dias, detail);
   } else if(admin){
     addCustomSedeRow(name, detail, false);
   }
 });
}

export function openActivityModal(id=null){
 if(id && !canEdit()){ alert(PERMISSION_MSG); return; }
 estado.editingId=id;
 syncStatusField();
 const a=id?estado.activities.find(x=>x.id===id):null;
 document.getElementById("modalTitle").textContent=a?"Editar actividad":"Nueva actividad";
 document.getElementById("fTitle").value=a?.title||"";
 
 let dateStartVal = "";
 let dateEndVal = "";
 if(a?.date){
   const parts = a.date.split(' - ');
   const d1 = parts[0];
   const d2 = parts[1];
   if(d1){
     const p1 = d1.split('/');
     if(p1.length === 3) dateStartVal = `${p1[2]}-${p1[1].padStart(2, '0')}-${p1[0].padStart(2, '0')}`;
   }
   if(d2){
     const p2 = d2.split('/');
     if(p2.length === 3) dateEndVal = `${p2[2]}-${p2[1].padStart(2, '0')}-${p2[0].padStart(2, '0')}`;
   }
 }
 document.getElementById("fDateStart").value=dateStartVal;
 document.getElementById("fDateEnd").value=dateEndVal;
 setLocationFieldValue(a?.location||"");
 document.getElementById("fResponsible").value=a?.responsible||"";
 document.getElementById("fStatus").value=a?.status||"pending";
 document.getElementById("activityModal").classList.add("show");
}

export function closeActivityModal(){document.getElementById("activityModal").classList.remove("show");}

export function toggleCard(id){
  const card = document.getElementById("card-"+id);
  card.classList.toggle("open");
  if(card.classList.contains("open")){
    if(!estado.openCards.includes(id)) estado.openCards.push(id);
  } else {
    estado.openCards = estado.openCards.filter(x => x !== id);
  }
}

export function linkify(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return escapeHtml(text).replace(urlRegex, function(url) {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}

export function escapeHtml(s){
 return String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}

// "Todas" muestra todas las actividades, completadas incluidas; cada otra pestaña, solo su estado.
// Lo usan la lista y el calendario.
export function actividadesFiltradas(){
 return estado.activities.filter(a=>estado.currentFilter==="all" || a.status===estado.currentFilter);
}

export function render(){
 const box=document.getElementById("timeline"); box.innerHTML="";
 // En el calendario la línea de tiempo queda vacía: así los id de las tarjetas no se repiten en su detalle.
 const enCalendario = estado.vista === "calendario";
 box.hidden = enCalendario;
 document.getElementById("calendario").hidden = !enCalendario;
 if(enCalendario){ renderCalendario(); updateStats(); return; }
 let shown=actividadesFiltradas();
 shown.sort((a,b)=>activityDateValue(a)-activityDateValue(b));
 shown.forEach(a=>{
  const el=document.createElement("article");
  el.className="activity";
  el.innerHTML=`
   <div class="dot"></div>
   ${tarjetaHTML(a)}
  `;
  box.appendChild(el);
 });
 updateStats();
}

// Tarjeta de una actividad: cabecera, detalle (estado, notas, archivos) y pie con las acciones
// que permite el rol. La usan la línea de tiempo y el detalle del calendario.
export function tarjetaHTML(a, abierta=false){
  const id = Number(a.id);
  const fList = estado.filesData[a.id] || [];
  const isOpen = abierta || estado.openCards.includes(id) ? 'open' : '';
  const editable = canEdit();
  return `<div class="card ${isOpen}" id="card-${id}">

    <div class="card-head" data-action="toggle-card" data-id="${id}" title="Haz clic para ver o cerrar detalles">
     <div class="card-head-content">
      <div class="date">${escapeHtml(a.date)}</div>
      <h2 class="title">${escapeHtml(a.title)}</h2>
      ${a.location ? `<div class="responsible activity-location" style="margin-bottom:4px; color:var(--secondary)"><span class="metadata-icon">${icon('sede')}</span><span class="metadata-content"><b>Sedes:</b> <span>${escapeHtml(a.location)}</span></span></div>` : ''}
      <div class="responsible activity-responsible"><span class="metadata-icon">${icon('persona')}</span><span class="metadata-content"><b>Responsable:</b> <span>${escapeHtml(a.responsible)}</span></span></div>
     </div>
     <span class="badge ${escapeHtml(a.status)}">${escapeHtml(statusText[a.status])}</span>
    </div>

    <div class="details">
     <div class="detail-grid">

      <div>
       ${editable ? `
       <label class="section-title" for="status-${id}">Actualizar Estado</label>
       <select id="status-${id}" data-action="change-status" data-id="${id}">
        <option value="pending" ${a.status==="pending"?"selected":""}>Pendiente</option>
        <option value="approved" ${a.status==="approved"?"selected":""}>Aprobado</option>
        <option value="done" ${a.status==="done"?"selected":""}>Completada</option>
       </select>` : ''}

       <div class="section-title" ${editable ? 'style="margin-top:24px"' : ''}>Historial de Observaciones y Enlaces</div>
       <div class="notes-log">
          ${renderNotesLog(id, a.notes)}
       </div>
       ${canManageNotes() ? `
       <textarea id="new-note-${id}" class="notes" placeholder="Escribe una nueva nota o pega un link aquí..."></textarea>
       <button class="add" style="margin-top:8px" data-action="append-note" data-id="${id}">Guardar en el registro</button>` : ''}
      </div>

      <div>
       <div class="section-title">Archivos correspondientes</div>
       <div class="files" id="files-${id}">
        ${fileHTML(a,fList)}
       </div>
       <label class="file-label add" style="display:inline-block;margin-top:10px">
        Agregar archivo
        <input type="file" multiple hidden accept="${UPLOAD_ACCEPT}" data-action="add-files" data-id="${id}">
       </label>
      </div>

     </div>
    </div>

    ${editable || canDelete() ? `
    <div class="card-foot">
      ${editable ? `<button class="toggle" data-action="edit-activity" data-id="${id}">Editar actividad</button>` : ''}
      ${canDelete() ? `<button class="delete" data-action="delete-activity" data-id="${id}">Eliminar actividad</button>` : ''}
    </div>` : ''}
   </div>`;
}

export function updateStats(){
 document.getElementById("total").textContent=estado.activities.length;
 document.getElementById("pendingCount").textContent=estado.activities.filter(a=>a.status==="pending").length;
 document.getElementById("approvedCount").textContent=estado.activities.filter(a=>a.status==="approved").length;
 document.getElementById("doneCount").textContent=estado.activities.filter(a=>a.status==="done").length;
}

// Filtros, acciones de las tarjetas y modales. Se llama una vez al arrancar.
export function iniciarInterfaz(){
 document.querySelectorAll(".filter").forEach(btn=>{
  btn.addEventListener("click",()=>{
   document.querySelectorAll(".filter").forEach(b=>b.classList.remove("active"));
   btn.classList.add("active"); estado.currentFilter=btn.dataset.filter; render();
  });
 });

 // --- ACCIONES DE LAS TARJETAS (delegación: sin datos interpolados en onclick) ---
 // Las tarjetas están en la línea de tiempo y en el detalle del calendario.
 const cajasDeTarjetas = [document.getElementById("timeline"), document.getElementById("calDetalleLista")];
 cajasDeTarjetas.forEach(delegarTarjetas);

 // --- ACCIONES DEL ENCABEZADO, LA BARRA, EL CALENDARIO Y EL FORMULARIO (delegación: sin onclick en línea) ---
 document.addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  if(!el || cajasDeTarjetas.some(caja => caja.contains(el))) return;
  switch(el.dataset.action){
   case "toggle-theme": toggleTheme(); break;
   case "new-activity": openActivityModal(); break;
   case "close-activity-modal": closeActivityModal(); break;
   case "save-activity": saveActivity(); break;
   case "cambiar-vista": cambiarVista(el.dataset.vista); break;
   case "cal-anterior": mesAnterior(); break;
   case "cal-siguiente": mesSiguiente(); break;
   case "cal-hoy": irAHoy(); break;
   case "cal-ver-lista": cambiarVista("lista"); break;
   case "cal-dia": abrirDetalle({ tipo: "dia", fecha: Number(el.dataset.fecha) }, el); break;
   case "cal-actividad": abrirDetalle({ tipo: "actividad", id: Number(el.dataset.id) }, el); break;
   case "cal-cerrar-detalle": cerrarDetalle(); break;
   case "add-custom-sede": addCustomSedeRow("", "", true); break;
   case "remove-custom-sede": { const row = el.closest(".sede-custom-row"); if(row) row.remove(); break; }
  }
 });
 // ---------------------------------------------

 document.getElementById("activityModal").addEventListener("click",e=>{if(e.target.id==="activityModal")closeActivityModal();});
 renderFixedSedes();
 document.getElementById("fDateStart").addEventListener("change", actualizarOpcionesFechasSedes);
 document.getElementById("fDateEnd").addEventListener("change", actualizarOpcionesFechasSedes);
 document.getElementById("fLocationFixedList").addEventListener("change", e => {
   const cb = e.target.closest(".sede-checkbox");
   if(!cb) return;
   const item = cb.closest(".sede-item");
   const detailSelect = item.querySelector(".sede-detail-select");
   item.classList.toggle("is-selected", cb.checked);
   detailSelect.hidden = !cb.checked;
   if(cb.checked){
     poblarSelectFechasSede(detailSelect, diasDeInputModal(), detailSelect.value);
     if(!detailSelect.disabled) detailSelect.focus();
   } else {
     poblarSelectFechasSede(detailSelect, diasDeInputModal(), "");
   }
 });

 // --- MODAL DE ACCESO: envío, cierre y teclado (Esc y foco atrapado) ---
 const loginModal = document.getElementById("loginModal");
 document.getElementById("loginForm").addEventListener("submit", submitLogin);
 document.getElementById("loginCancel").addEventListener("click", closeLoginModal);
 loginModal.addEventListener("click", e => { if(e.target === loginModal) closeLoginModal(); });
 document.addEventListener("keydown", e => {
  if(!loginModal.classList.contains("show")) return;
  if(e.key === "Escape"){ e.preventDefault(); closeLoginModal(); return; }
  if(e.key !== "Tab") return;
  const focusables = [...loginModal.querySelectorAll("input, button:not([disabled])")];
  const first = focusables[0], last = focusables[focusables.length - 1];
  if(!loginModal.contains(document.activeElement)){ e.preventDefault(); first.focus(); }
  else if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
 });
 // ---------------------------------------------

 iniciarCalendario();
}

// Acciones de las tarjetas dentro de una caja (línea de tiempo o detalle del calendario).
function delegarTarjetas(caja){
 caja.addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  if(!el || !caja.contains(el)) return;
  const id = Number(el.dataset.id);
  const file = el.dataset.fileId ? findFile(Number(el.dataset.fileId)) : null;
  switch(el.dataset.action){
   case "toggle-card": toggleCard(id); break;
   case "edit-activity": openActivityModal(id); break;
   case "delete-activity": deleteActivity(id); break;
   case "append-note": appendNote(id, el); break;
   case "delete-note": deleteNote(id, Number(el.dataset.index)); break;
   case "open-file": if(file) downloadFile(file.path); break;
   case "remove-file": if(file) removeFile(file.id, file.path); break;
  }
 });
 caja.addEventListener("change", e => {
  const el = e.target.closest("[data-action]");
  if(!el || !caja.contains(el)) return;
  const id = Number(el.dataset.id);
  if(el.dataset.action === "change-status") changeStatus(id, el.value);
  else if(el.dataset.action === "add-files") addFiles(id, el);
 });
}
