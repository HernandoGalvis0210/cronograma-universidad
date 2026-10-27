// Archivos de cada actividad: validación, subida, apertura y borrado (tabla y bucket).
import { supabaseClient, runWrite, errorMessage } from './config.js';
import { estado, BUCKET, PERMISSION_MSG, MAX_UPLOAD_MB, MAX_FILE_NAME_LENGTH, ALLOWED_UPLOAD_TYPES, ALLOWED_UPLOAD_LABEL } from './estado.js';
import { canDelete } from './auth.js';
import { icon, escapeHtml } from './ui.js';
import { fetchData } from './actividades.js';

// Storage tampoco da error si la RLS impide borrar: devuelve solo lo que borró.
// Lo que no vuelve se comprueba en la URL pública del bucket: si sigue ahí, el
// borrado falló; si ya no estaba (400/404), se da por borrado.
export async function stillInBucket(path){
  const { data } = supabaseClient.storage.from(BUCKET).getPublicUrl(path);
  const res = await fetch(`${data.publicUrl}?t=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
  if(res.ok) return true;
  if(res.status === 400 || res.status === 404) return false;
  throw new Error("No se pudo comprobar el archivo (HTTP " + res.status + ")");
}

export async function removeFromBucket(paths){
  if(!paths.length) return null;
  try {
    const { data, error } = await supabaseClient.storage.from(BUCKET).remove(paths);
    if(error) return error;
    const removed = new Set((data || []).map(o => o.name));
    for(const p of paths.filter(p => !removed.has(p))){
      if(await stillInBucket(p)) return { code: "42501", message: "Storage no permitió borrar " + p };
    }
    return null;
  } catch (err) {
    return err;
  }
}

export function fileHTML(a,files){
 if(!files.length)return '<div class="empty">No hay archivos asociados todavía.</div>';
 return files.map(f=>`
  <div class="file-row">
   <span class="file-name" title="${escapeHtml(f.name)}">${icon('archivo')} ${escapeHtml(f.name)}</span>
   <div class="file-actions">
    <button class="toggle" data-action="open-file" data-file-id="${Number(f.id)}">Abrir</button>
    ${canDelete() ? `<button class="delete" data-action="remove-file" data-file-id="${Number(f.id)}">Eliminar</button>` : ''}
   </div>
  </div>`).join("");
}

export function findFile(fileId){
 return Object.values(estado.filesData).flat().find(f => Number(f.id) === fileId);
}

export function fileExtension(name){
  const parts = String(name).toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : "";
}

// Devuelve el motivo por el que no se puede subir el archivo, o null si vale.
export function uploadProblem(file){
  const ext = fileExtension(file.name);
  const allowed = Object.hasOwn(ALLOWED_UPLOAD_TYPES, ext) ? ALLOWED_UPLOAD_TYPES[ext] : null;
  // Algunos sistemas no informan el tipo (file.type vacío): basta la extensión.
  if(!allowed || (file.type && !allowed.includes(file.type))){
    return `• "${file.name}": tipo de archivo no permitido.`;
  }
  if(file.size > MAX_UPLOAD_MB * 1024 * 1024){
    return `• "${file.name}": pesa ${(file.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB (máximo ${MAX_UPLOAD_MB} MB).`;
  }
  if(file.name.length > MAX_FILE_NAME_LENGTH){
    return `• "${file.name.slice(0, 40)}…": el nombre es demasiado largo (máximo ${MAX_FILE_NAME_LENGTH} caracteres).`;
  }
  return null;
}

// Rechazos propios del bucket (límite de tamaño o tipos configurados en Supabase).
export function uploadErrorMessage(error, file){
  const status = String(error?.statusCode ?? error?.status ?? "");
  const msg = String(error?.message || "").toLowerCase();
  if(status === "413" || msg.includes("maximum allowed size") || msg.includes("too large")){
    return `"${file.name}" supera el tamaño máximo que permite el almacenamiento. Reduce el archivo e inténtalo de nuevo.`;
  }
  if(status === "415" || msg.includes("mime type")){
    return `El almacenamiento no acepta el tipo de "${file.name}". Se permiten ${ALLOWED_UPLOAD_LABEL}.`;
  }
  return errorMessage(error, `Error al subir el archivo "${file.name}".`);
}

export async function addFiles(id, input){
  const files = Array.from(input.files);
  if (files.length === 0) return;
  const rejected = files.map(uploadProblem).filter(Boolean);
  if(rejected.length){
    alert(`No se subirán estos archivos:\n\n${rejected.join("\n")}\n\nSe permiten ${ALLOWED_UPLOAD_LABEL}, de hasta ${MAX_UPLOAD_MB} MB cada uno.`);
  }
  const valid = files.filter(f => !uploadProblem(f));
  if(valid.length === 0){ input.value = ""; return; }
  const labelDiv = input.parentElement;
  const originalText = labelDiv.innerHTML;
  labelDiv.textContent = "Subiendo...";
  try {
    for(let file of valid){
      const fileExt = fileExtension(file.name);
      const contentType = file.type || ALLOWED_UPLOAD_TYPES[fileExt][0];
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { error: uploadError } = await supabaseClient.storage.from(BUCKET).upload(fileName, file, { contentType });
      if(uploadError){
        alert(uploadErrorMessage(uploadError, file));
      } else {
        const { error: dbError } = await supabaseClient.from('cronograma_archivos').insert([{activity_id: id, name: file.name, path: fileName, type: contentType}]);
        if(dbError) alert(errorMessage(dbError, `El archivo "${file.name}" se subió, pero no se pudo registrar.`));
      }
    }
    await fetchData(); 
  } catch (err) {
    alert("Fallo inesperado: " + err.message);
  } finally {
    labelDiv.innerHTML = originalText;
    input.value = "";
  }
}

export async function downloadFile(path){
 const { data } = supabaseClient.storage.from(BUCKET).getPublicUrl(path);
 if(data) window.open(data.publicUrl, '_blank', 'noopener,noreferrer');
}

export async function removeFile(fileId, path){
 if(!canDelete()){ alert(PERMISSION_MSG); return; }
 if(!confirm("¿Seguro que quieres eliminar este archivo?")) return;
 const storageError = await removeFromBucket([path]);
 if(storageError){ alert(errorMessage(storageError, "No se pudo borrar el archivo del almacenamiento. No se eliminó.")); return; }
 await runWrite(supabaseClient.from('cronograma_archivos').delete().eq('id', fileId), "El archivo se borró del almacenamiento, pero no su registro.");
}
