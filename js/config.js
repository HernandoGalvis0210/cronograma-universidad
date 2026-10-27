// Cliente de Supabase y utilidades para escribir con él.
// La clave es la publishable (anon): es pública por diseño y la seguridad
// real la dan las políticas RLS. Nunca poner aquí la clave service_role.
import { PERMISSION_MSG, TOO_LONG_MSG, NO_ROWS_MSG } from './estado.js';

const { createClient } = supabase;
const supabaseUrl = 'https://kakbjyjonxtbhobeiblv.supabase.co';
const supabaseKey = 'sb_publishable_BiXNML_8PgA2x6pd6UPWWg_EGJ8tMUW';
export const supabaseClient = createClient(supabaseUrl, supabaseKey);

// "supabaseClient" sigue disponible en la consola del navegador (lo usan
// las pruebas de supabase/LEEME.md).
window.supabaseClient = supabaseClient;

// --- ERRORES Y PERMISOS ---
export function isPermissionError(error){
  const msg = String(error?.message || "").toLowerCase();
  return error?.code === "42501" || [401, 403, "401", "403"].includes(error?.status ?? error?.statusCode)
    || msg.includes("row-level security") || msg.includes("permission denied") || msg.includes("unauthorized") || msg.includes("not authorized");
}

export function errorMessage(error, fallback){
  if(isPermissionError(error)) return PERMISSION_MSG;
  if(error?.code === "23514") return TOO_LONG_MSG; // CHECK de longitud de roles-2.sql
  return `${fallback}\n\nDetalle: ${error?.message || error}`;
}

// Con RLS, un UPDATE o DELETE no permitido no da error: afecta 0 filas.
// Por eso se pide la fila de vuelta y se comprueba que llegó.
export async function runWrite(query, fallback){
  const { data, error } = await query.select('id');
  if(error){ alert(errorMessage(error, fallback)); return false; }
  if(!data || data.length === 0){ alert(NO_ROWS_MSG); return false; }
  return true;
}
// ------------------------------------
