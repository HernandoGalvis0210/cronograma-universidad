// Sesión de revisores: acceso, cierre de sesión, rol y permisos de la interfaz.
import { supabaseClient } from './config.js';
import { estado, roleText } from './estado.js';
import { icon, escapeHtml, render, syncStatusField, closeActivityModal } from './ui.js';

// --- SESIÓN DE REVISORES ---
// El rol solo decide qué botones se muestran: quien permite o rechaza cada
// operación es la RLS de Supabase. El rol no se guarda en el navegador; se
// vuelve a leer de "perfiles" en cada carga y cada cambio de sesión.

export function isReviewer(){
  return !!estado.currentSession && Object.hasOwn(roleText, estado.currentRole);
}
// Eliminar, editar la actividad y cambiar su estado: solo revisores.
// Crear, subir archivos y agregar notas: todos.
export function canDelete(){ return isReviewer(); }
export function canEdit(){ return isReviewer(); }
export function isAdmin(){
  if(!estado.currentSession || !estado.currentRole) return false;
  const rol = normalizeUser(estado.currentRole);
  return rol === "administrador" || rol === "administracion";
}

export async function loadRole(session){
  if(!session) return null;
  const { data, error } = await supabaseClient.from('perfiles').select('rol').eq('id', session.user.id).maybeSingle();
  if(error){ console.warn("No se pudo leer el perfil:", error.message); return null; }
  return data && Object.hasOwn(roleText, data.rol) ? data.rol : null;
}

export async function applySession(session){
  const version = ++estado.authVersion;
  const role = await loadRole(session);
  if(version !== estado.authVersion) return; // llegó un cambio de sesión más reciente
  estado.currentSession = session;
  estado.currentRole = role;
  if(estado.editingId && !canEdit() && document.getElementById("activityModal").classList.contains("show")) closeActivityModal();
  syncStatusField();
  renderAuthArea();
  render();
}

export function renderAuthArea(){
  const area = document.getElementById("authArea");
  if(!estado.currentSession){
    area.innerHTML = `<button type="button" class="auth-btn" id="loginOpenBtn">Acceso revisores</button>`;
    document.getElementById("loginOpenBtn").addEventListener("click", openLoginModal);
    return;
  }
  const label = estado.currentRole ? roleText[estado.currentRole] : "Sin rol asignado";
  area.innerHTML = `
    <span class="role-chip ${estado.currentRole ? '' : 'no-role'}" title="Usuario: ${escapeHtml(String(estado.currentSession.user.email || '').split('@')[0])}">${icon('persona')}${escapeHtml(label)}</span>
    <button type="button" class="auth-btn" id="logoutBtn">Cerrar sesión</button>`;
  document.getElementById("logoutBtn").addEventListener("click", logout);
}

export function openLoginModal(){
  estado.loginReturnFocus = document.activeElement;
  document.getElementById("loginForm").reset();
  setLoginError("");
  document.getElementById("loginModal").classList.add("show");
  document.getElementById("loginUser").focus();
}

export function closeLoginModal(){
  document.getElementById("loginModal").classList.remove("show");
  const target = estado.loginReturnFocus && document.contains(estado.loginReturnFocus) ? estado.loginReturnFocus : document.querySelector("#authArea button");
  if(target) target.focus();
}

export function setLoginError(msg){
  const el = document.getElementById("loginError");
  el.textContent = msg;
  el.hidden = !msg;
}

// Los revisores entran con un usuario; en Supabase Auth son cuentas
// <usuario>@cronograma.local. "Académico", "ACADEMICO" y "academico" valen igual.
const REVIEWER_USERS = ["superior", "academico", "administracion"];
const LOGIN_DOMAIN = "@cronograma.local";
const BAD_CREDENTIALS_MSG = "Usuario o contraseña incorrectos.";

export function normalizeUser(value){
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function reviewerEmail(value){
  const user = normalizeUser(value);
  return REVIEWER_USERS.includes(user) ? user + LOGIN_DOMAIN : null;
}

export function loginErrorText(error){
  const msg = String(error?.message || "").toLowerCase();
  if(error?.status === 429 || msg.includes("rate limit")) return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  if(msg.includes("invalid login credentials")) return BAD_CREDENTIALS_MSG;
  if(msg.includes("email not confirmed")) return "Esta cuenta aún no está confirmada. Pide a un administrador que la confirme.";
  if(msg.includes("failed to fetch") || msg.includes("network")) return "No se pudo conectar con el servidor. Revisa tu conexión.";
  return "No se pudo iniciar sesión. Inténtalo de nuevo.";
}

export async function submitLogin(e){
  e.preventDefault();
  const rawUser = document.getElementById("loginUser").value;
  const password = document.getElementById("loginPassword").value;
  if(!rawUser.trim() || !password){ setLoginError("Escribe tu usuario y tu contraseña."); return; }
  const email = reviewerEmail(rawUser);
  if(!email){
    // Mismo mensaje que unas credenciales incorrectas, sin consultar a Supabase.
    setLoginError(BAD_CREDENTIALS_MSG);
    document.getElementById("loginPassword").select();
    return;
  }
  const btn = document.getElementById("loginSubmit");
  btn.disabled = true;
  btn.textContent = "Ingresando...";
  setLoginError("");
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if(error){
      setLoginError(loginErrorText(error));
      document.getElementById("loginPassword").select();
      return;
    }
    await applySession(data.session);
    estado.loginReturnFocus = null;
    closeLoginModal();
  } catch (err) {
    setLoginError(loginErrorText(err));
  } finally {
    btn.disabled = false;
    btn.textContent = "Ingresar";
  }
}

export async function logout(){
  const { error } = await supabaseClient.auth.signOut({ scope: 'local' });
  if(error) console.warn("Error al cerrar sesión:", error.message);
  await applySession(null);
  const btn = document.getElementById("loginOpenBtn");
  if(btn) btn.focus();
}
// ------------------------------------
