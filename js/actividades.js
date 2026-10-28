// Actividades: lectura, creación, edición, cambio de estado y eliminación.
import { supabaseClient, runWrite, errorMessage } from './config.js';
import { estado, PERMISSION_MSG, SEDES_FIJAS, MESES_CORTOS, VALOR_TODOS_LOS_DIAS } from './estado.js';
import { canEdit, canDelete, isAdmin } from './auth.js';
import { render, closeActivityModal } from './ui.js';
import { removeFromBucket } from './archivos.js';

export function etiquetaDiaCorto(f){
  return `${f.d} ${MESES_CORTOS[f.m - 1]}`;
}

export function parseInputDate(isoStr){
  const m = String(isoStr || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function diasEntreFechas(fInicio, fFin = null){
  if(!fInicio) return [];
  const kIni = fInicio.y * 10000 + fInicio.m * 100 + fInicio.d;
  const finEfectivo = fFin || fInicio;
  const kFin = Math.max(kIni, finEfectivo.y * 10000 + finEfectivo.m * 100 + finEfectivo.d);
  const dias = [];
  let actual = { y: fInicio.y, m: fInicio.m, d: fInicio.d };
  // Límite defensivo de 366 días para evitar ciclos infinitos ante fechas extremas.
  for(let i = 0; i < 366; i++){
    const k = actual.y * 10000 + actual.m * 100 + actual.d;
    if(k > kFin) break;
    dias.push({ ...actual, clave: k, label: etiquetaDiaCorto(actual) });
    const sig = new Date(actual.y, actual.m - 1, actual.d + 1);
    actual = { y: sig.getFullYear(), m: sig.getMonth() + 1, d: sig.getDate() };
  }
  return dias;
}

export function diasDeInputModal(){
  const rawStart = document.getElementById("fDateStart")?.value || "";
  const rawEnd = document.getElementById("fDateEnd")?.value || "";
  const ini = parseInputDate(rawStart);
  if(!ini) return [];
  const fin = parseInputDate(rawEnd);
  return diasEntreFechas(ini, fin);
}

export function parseLocationEntries(locationValue = ""){
  const raw = String(locationValue || "").trim();
  if(!raw) return [];
  return raw.split(/,(?![^()]*\))/).map(part => {
    const trimmed = part.trim();
    if(!trimmed) return null;
    const match = trimmed.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
    if(match) return { name: match[1].trim(), detail: match[2].trim() };
    return { name: trimmed, detail: "" };
  }).filter(Boolean);
}

export async function fetchData(){
  const { data: acts } = await supabaseClient.from('cronograma_actividades').select('*').order('id', { ascending: true });
  if(acts) estado.activities = acts;
  const { data: files } = await supabaseClient.from('cronograma_archivos').select('*');
  estado.filesData = {};
  if(files){
    files.forEach(f => {
      if(!estado.filesData[f.activity_id]) estado.filesData[f.activity_id] = [];
      estado.filesData[f.activity_id].push(f);
    });
  }
  render();
}

export async function saveActivity(){
 const title=document.getElementById("fTitle").value.trim();
 let rawStart = document.getElementById("fDateStart").value;
 let rawEnd = document.getElementById("fDateEnd").value;
 if(rawStart && rawEnd && rawEnd < rawStart){
   alert("La fecha de fin no puede ser anterior a la fecha de inicio.");
   document.getElementById("fDateEnd").focus();
   return;
 }
 let finalDate = "";
 let d1Str = "";
 if(rawStart){
   const p = rawStart.split('-');
   if(p.length === 3) d1Str = `${p[2]}/${p[1]}/${p[0]}`;
 }
 let d2Str = "";
 if(rawEnd){
   const p = rawEnd.split('-');
   if(p.length === 3) d2Str = `${p[2]}/${p[1]}/${p[0]}`;
 }
 if(d1Str && d2Str && d1Str !== d2Str){
   finalDate = `${d1Str} - ${d2Str}`;
 } else if(d1Str) {
   finalDate = d1Str;
 }
 const responsible=document.getElementById("fResponsible").value.trim();
 const status=canEdit() ? document.getElementById("fStatus").value : "pending";
 if(estado.editingId && !canEdit()){ alert(PERMISSION_MSG); return; }

 if(!title||!finalDate||!responsible){alert("Completa actividad, fecha de inicio y responsable.");return;}

 const diasRango = diasDeInputModal();
 const etiquetasValidas = new Set(diasRango.map(d => d.label));
 const esRangoMultiple = diasRango.length > 1;

 const locationParts = [];
 const fixedItems = [...document.querySelectorAll("#fLocationFixedList .sede-item")];
 for(const item of fixedItems){
   const cb = item.querySelector(".sede-checkbox");
   if(!cb || !cb.checked) continue;
   const sedeName = cb.value.trim();
   if(!SEDES_FIJAS.includes(sedeName)){ alert(PERMISSION_MSG); return; }
   const selectVal = String(item.querySelector(".sede-detail-select")?.value || "").trim();
   if(esRangoMultiple){
     if(selectVal !== VALOR_TODOS_LOS_DIAS && !etiquetasValidas.has(selectVal)){
       alert("La fecha seleccionada para la sede no pertenece al rango de la actividad.");
       return;
     }
     locationParts.push(selectVal !== VALOR_TODOS_LOS_DIAS ? `${sedeName} (${selectVal})` : sedeName);
   } else {
     locationParts.push(sedeName);
   }
 }

 const customRows = [...document.querySelectorAll("#fLocationCustomList .sede-custom-row")];
 if(customRows.length > 0 && !isAdmin()){ alert(PERMISSION_MSG); return; }
 for(const row of customRows){
   const nameInput = row.querySelector(".sede-custom-name");
   const detailSelect = row.querySelector(".sede-custom-detail");
   const customName = String(nameInput?.value || "").trim();
   const selectVal = String(detailSelect?.value || "").trim();
   if(!customName){
     alert("Escribe el nombre de la sede personalizada o quita la fila vacía.");
     nameInput?.focus();
     return;
   }
   if(esRangoMultiple){
     if(selectVal !== VALOR_TODOS_LOS_DIAS && !etiquetasValidas.has(selectVal)){
       alert("La fecha seleccionada para la sede no pertenece al rango de la actividad.");
       return;
     }
     locationParts.push(selectVal !== VALOR_TODOS_LOS_DIAS ? `${customName} (${selectVal})` : customName);
   } else {
     locationParts.push(customName);
   }
 }

 if(locationParts.length === 0){
   alert("Selecciona al menos una sede.");
   return;
 }
 const location = locationParts.join(", ");
 
 const values = {title, date: finalDate, location, responsible, status};
 const ok = estado.editingId
   ? await runWrite(supabaseClient.from('cronograma_actividades').update(values).eq('id', estado.editingId), "No se pudo guardar la actividad.")
   : await runWrite(supabaseClient.from('cronograma_actividades').insert([values]), "No se pudo crear la actividad.");
 if(ok){ closeActivityModal(); await fetchData(); }
}

export async function deleteActivity(id){
 if(!canDelete()){ alert(PERMISSION_MSG); return; }
 const a=estado.activities.find(x=>x.id===id);
 if(!a)return;
 if(!confirm(`¿Eliminar "${a.title}" y todos sus archivos? Esta acción no se puede deshacer.`)) return;

 // 1) Archivos del bucket primero: si fallan, la actividad no se toca.
 const { data: files, error: filesError } = await supabaseClient.from('cronograma_archivos').select('path').eq('activity_id', id);
 if(filesError){ alert(errorMessage(filesError, "No se pudieron consultar los archivos de la actividad. No se eliminó nada.")); return; }
 const storageError = await removeFromBucket((files || []).map(f => f.path).filter(Boolean));
 if(storageError){ alert(errorMessage(storageError, "No se pudieron borrar los archivos del almacenamiento. La actividad no se eliminó.")); return; }

 // 2) La actividad; sus filas de cronograma_archivos caen por ON DELETE CASCADE.
 if(await runWrite(supabaseClient.from('cronograma_actividades').delete().eq('id', id), "No se pudo eliminar la actividad.")) await fetchData();
}

// Día, mes y año de la primera fecha "dd/mm/aaaa" del texto (sin año, el actual), o null.
// No valida el día: lo hace el calendario. La usan el orden de la lista y el calendario.
export function partesFecha(texto){
 const m = String(texto).match(/(\d{1,2})\D+(\d{1,2})(?:\D+(\d{2,4}))?/);
 if(!m) return null;
 let y = m[3] ? Number(m[3]) : new Date().getFullYear();
 if(y < 100) y += 2000;
 return { y, m: Number(m[2]), d: Number(m[1]) };
}

export function activityDateValue(a){
 const f = partesFecha(a.date);
 if(!f) return Number.MAX_SAFE_INTEGER;
 return new Date(f.y, f.m-1, f.d).getTime();
}

export async function changeStatus(id,status){
 if(!canEdit()){ alert(PERMISSION_MSG); render(); return; }
 const ok = await runWrite(supabaseClient.from('cronograma_actividades').update({status}).eq('id', id), "No se pudo cambiar el estado.");
 const activity = estado.activities.find(a => a.id === id);
 if(ok && activity) activity.status = status;
 render(); // si falló, el selector vuelve al estado guardado
}
