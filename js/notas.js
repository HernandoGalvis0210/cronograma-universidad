// Notas de cada actividad: entradas "• texto" separadas por una línea en blanco.
import { supabaseClient, runWrite } from './config.js';
import { estado, roleText, MAX_NOTES_LENGTH, PERMISSION_MSG } from './estado.js';
import { linkify, escapeHtml } from './ui.js';

// --- PERMISOS Y ROL DE NOTAS ---
// Se incluye también 'administracion' para mantener compatibilidad con la clave definida en estado.js (roleText) y Supabase.
const ROLES_AUTORIZADOS_NOTAS = ['superior', 'academico', 'administrador', 'administracion'];
const ETIQUETAS_ROL_NOTAS = {
  superior: 'Superior',
  academico: 'Académico',
  administrador: 'Administrador',
  administracion: 'Administración'
};

function normalizarRol(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function canManageNotes() {
  if(!estado.currentSession || !estado.currentRole) return false;
  return ROLES_AUTORIZADOS_NOTAS.includes(normalizarRol(estado.currentRole));
}

export function obtenerEtiquetaRol() {
  if(!estado.currentRole) return "";
  if(Object.hasOwn(roleText, estado.currentRole)) return roleText[estado.currentRole];
  const rolNorm = normalizarRol(estado.currentRole);
  return ETIQUETAS_ROL_NOTAS[rolNorm] || String(estado.currentRole).trim();
}

function formatearNotaHTML(note) {
  const match = String(note).match(/^(Superior|Acad[eé]mico|Administraci[oó]n|Administrador):\s*([\s\S]*)$/i);
  if(!match) return linkify(note);
  return `<strong class="note-role">${escapeHtml(match[1])}:</strong> ${linkify(match[2])}`;
}
// -------------------------------

// --- LÓGICA PARA RENDERIZAR Y BORRAR NOTAS ---
export function renderNotesLog(id, rawNotes) {
  if(!rawNotes) return '<div class="empty">Aún no hay notas registradas.</div>';
  let notesArray = rawNotes.split('\n\n• ').filter(n => n.trim() !== '');
  notesArray = notesArray.map(n => n.replace(/^•\s*/, ''));
  const puedeGestionar = canManageNotes();
  
  return notesArray.map((note, idx) => `
    <div style="display:flex; justify-content:space-between; gap:10px; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:10px;">
      <div style="flex:1; white-space:pre-wrap; word-break:break-word;">${formatearNotaHTML(note)}</div>
      ${puedeGestionar ? `<button type="button" class="delete note-remove" data-action="delete-note" data-id="${Number(id)}" data-index="${idx}" title="Quitar nota" aria-label="Quitar nota">Quitar</button>` : ''}
    </div>
  `).join('');
}

export async function deleteNote(id, index) {
  if(!canManageNotes()){ alert(PERMISSION_MSG); return; }
  if(!confirm("¿Seguro que quieres borrar esta nota del registro?")) return;
  const a = estado.activities.find(x => x.id === id);
  if(!a || !a.notes) return;
  let notesArray = a.notes.split('\n\n• ').filter(n => n.trim() !== '');
  notesArray = notesArray.map(n => n.replace(/^•\s*/, ''));
  
  notesArray.splice(index, 1);
  let newNotes = notesArray.map(n => "• " + n).join('\n\n');
  if(newNotes === "") newNotes = null;
  
  await runWrite(supabaseClient.from('cronograma_actividades').update({notes: newNotes}).eq('id', id), "Error al borrar la nota.");
}
// ---------------------------------------------

export async function appendNote(id, btn){
 if(!canManageNotes()){ alert(PERMISSION_MSG); return; }
 const textarea = document.getElementById("new-note-"+id);
 if(!textarea) return;
 const newText = textarea.value.trim();
 if(!newText) return;
 btn.textContent = "Guardando...";
 const a = estado.activities.find(x => x.id === id);
 if(!a){ btn.textContent = "Guardar en el registro"; return; }
 const rolLabel = obtenerEtiquetaRol();
 const noteWithRole = rolLabel ? `${rolLabel}: ${newText}` : newText;
 let updatedNotes = a.notes ? a.notes + "\n\n• " + noteWithRole : "• " + noteWithRole;
 if(updatedNotes.length > MAX_NOTES_LENGTH){
   alert(`El registro de notas de esta actividad llegó a su máximo (${MAX_NOTES_LENGTH.toLocaleString('es')} caracteres). Acorta la nota o borra notas antiguas.`);
   btn.textContent = "Guardar en el registro";
   return;
 }
 const ok = await runWrite(supabaseClient.from('cronograma_actividades').update({notes: updatedNotes}).eq('id', id), "Error al guardar la nota.");
 if(!ok){
   btn.textContent = "Guardar en el registro";
 } else {
   textarea.value = "";
   btn.textContent = "Guardado";
   setTimeout(() => btn.textContent = "Guardar en el registro", 1500);
 }
}
