// Interfaz: iconos, tema, render de la línea de tiempo, filtros, modales y eventos.
import { estado, statusText, UPLOAD_ACCEPT, PERMISSION_MSG } from './estado.js';
import { canEdit, canDelete, closeLoginModal, submitLogin } from './auth.js';
import { saveActivity, deleteActivity, changeStatus, activityDateValue } from './actividades.js';
import { renderNotesLog, deleteNote, appendNote } from './notas.js';
import { fileHTML, findFile, addFiles, downloadFile, removeFile } from './archivos.js';

// --- ICONOS (SVG de línea, heredan el color del texto) ---
// Decorativos: siempre aria-hidden; el texto o el aria-label del control
// es el que da el significado.
const ICONOS = {
  sede: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  persona: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  archivo: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  luna: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'
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
 document.getElementById("fLocation").value=a?.location||"";
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

export function render(){
 const box=document.getElementById("timeline"); box.innerHTML="";
 // "Todas" muestra todas las actividades, completadas incluidas; cada otra pestaña, solo su estado.
 let shown=estado.activities.filter(a=>estado.currentFilter==="all" || a.status===estado.currentFilter);
 shown.sort((a,b)=>activityDateValue(a)-activityDateValue(b));
 shown.forEach(a=>{
  const id = Number(a.id);
  const fList = estado.filesData[a.id] || [];
  const isOpen = estado.openCards.includes(id) ? 'open' : '';
  const editable = canEdit();

  const el=document.createElement("article");
  el.className="activity";
  el.innerHTML=`
   <div class="dot"></div>
   <div class="card ${isOpen}" id="card-${id}">

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
       <textarea id="new-note-${id}" class="notes" placeholder="Escribe una nueva nota o pega un link aquí..."></textarea>
       <button class="add" style="margin-top:8px" data-action="append-note" data-id="${id}">Guardar en el registro</button>
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
   </div>
  `;
  box.appendChild(el);
 });
 updateStats();
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
 const timelineBox = document.getElementById("timeline");
 timelineBox.addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  if(!el || !timelineBox.contains(el)) return;
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
 timelineBox.addEventListener("change", e => {
  const el = e.target.closest("[data-action]");
  if(!el || !timelineBox.contains(el)) return;
  const id = Number(el.dataset.id);
  if(el.dataset.action === "change-status") changeStatus(id, el.value);
  else if(el.dataset.action === "add-files") addFiles(id, el);
 });

 // --- ACCIONES DEL ENCABEZADO, LA BARRA Y EL FORMULARIO (delegación: sin onclick en línea) ---
 document.addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  if(!el || timelineBox.contains(el)) return;
  switch(el.dataset.action){
   case "toggle-theme": toggleTheme(); break;
   case "new-activity": openActivityModal(); break;
   case "close-activity-modal": closeActivityModal(); break;
   case "save-activity": saveActivity(); break;
  }
 });
 // ---------------------------------------------

 document.getElementById("activityModal").addEventListener("click",e=>{if(e.target.id==="activityModal")closeActivityModal();});

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
}
