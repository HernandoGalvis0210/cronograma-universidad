// Notas de cada actividad: entradas "• texto" separadas por una línea en blanco.
import { supabaseClient, runWrite } from './config.js';
import { estado, MAX_NOTES_LENGTH } from './estado.js';
import { linkify } from './ui.js';

// --- LÓGICA PARA RENDERIZAR Y BORRAR NOTAS ---
export function renderNotesLog(id, rawNotes) {
  if(!rawNotes) return '<div class="empty">Aún no hay notas registradas.</div>';
  let notesArray = rawNotes.split('\n\n• ').filter(n => n.trim() !== '');
  notesArray = notesArray.map(n => n.replace(/^•\s*/, ''));
  
  return notesArray.map((note, idx) => `
    <div style="display:flex; justify-content:space-between; gap:10px; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:10px;">
      <div style="flex:1; white-space:pre-wrap; word-break:break-word;">${linkify(note)}</div>
      <button type="button" class="delete note-remove" data-action="delete-note" data-id="${Number(id)}" data-index="${idx}" title="Quitar nota" aria-label="Quitar nota">Quitar</button>
    </div>
  `).join('');
}

export async function deleteNote(id, index) {
  if(!confirm("¿Seguro que quieres borrar esta nota del registro?")) return;
  const a = estado.activities.find(x => x.id === id);
  let notesArray = a.notes.split('\n\n• ').filter(n => n.trim() !== '');
  notesArray = notesArray.map(n => n.replace(/^•\s*/, ''));
  
  notesArray.splice(index, 1);
  let newNotes = notesArray.map(n => "• " + n).join('\n\n');
  if(newNotes === "") newNotes = null;
  
  await runWrite(supabaseClient.from('cronograma_actividades').update({notes: newNotes}).eq('id', id), "Error al borrar la nota.");
}
// ---------------------------------------------

export async function appendNote(id, btn){
 const textarea = document.getElementById("new-note-"+id);
 const newText = textarea.value.trim();
 if(!newText) return;
 btn.textContent = "Guardando...";
 const a = estado.activities.find(x => x.id === id);
 let updatedNotes = a.notes ? a.notes + "\n\n• " + newText : "• " + newText;
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
