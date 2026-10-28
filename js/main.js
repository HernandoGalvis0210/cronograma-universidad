// Arranque: splash, tema guardado, sesión, realtime, eventos y primera carga.
import { supabaseClient } from './config.js';
import { estado } from './estado.js';
import { paintThemeButton, iniciarInterfaz } from './ui.js';
import { applySession, renderAuthArea } from './auth.js';
import { fetchData } from './actividades.js';

// La aplicación arrancó: se cancela la red de seguridad del head de index.html.
if(window.cancelarRedDeArranque) window.cancelarRedDeArranque();

// Splash institucional. Tiempos en ms: se cambian aquí.
// Cuentan desde que el logo está decodificado; no dependen de "load" ni de Supabase.
(function () {
  const TIEMPOS = { entrada: 600, permanencia: 1200, salida: 700 };          // ~2,5 s
  const TIEMPOS_REDUCIDOS = { entrada: 500, permanencia: 700, salida: 300 }; // ~1,5 s, solo fundido
  const ESPERA_MAX_LOGO = 500; // si el logo tarda más en decodificarse, se empieza igual

  const splash = document.getElementById('splash');
  const logo = splash.querySelector('.splash-logo');
  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t = reducido ? TIEMPOS_REDUCIDOS : TIEMPOS;
  splash.style.setProperty('--splash-entrada', t.entrada + 'ms');
  splash.style.setProperty('--splash-salida', t.salida + 'ms');

  let iniciado = false;
  function iniciar() {
    if (iniciado) return;
    iniciado = true;
    // Doble rAF: la entrada empieza en un frame ya pintado y no se pierde su inicio.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        splash.classList.add('is-entering');
        window.setTimeout(salir, t.entrada + t.permanencia);
      });
    });
  }
  function salir() {
    splash.classList.add('is-leaving');
    window.setTimeout(function () {
      splash.remove();
      document.body.classList.remove('splash-active');
    }, t.salida);
  }
  (logo.decode ? logo.decode() : Promise.resolve()).then(iniciar, iniciar);
  window.setTimeout(iniciar, ESPERA_MAX_LOGO);
}());

// --- TEMA GUARDADO ---
let temaGuardado = null;
try { temaGuardado = localStorage.getItem('theme'); } catch(e) { /* sin almacenamiento: tema claro */ }
if(temaGuardado === 'dark') {
  document.body.classList.add('dark-mode');
}
paintThemeButton();
// ------------------------------------

// --- SESIÓN Y TIEMPO REAL ---
supabaseClient.auth.onAuthStateChange((event, session) => {
  if(event === 'INITIAL_SESSION') return; // la restaura getSession() al cargar
  if(event === 'TOKEN_REFRESHED'){ estado.currentSession = session; return; }
  // Diferido: llamar a Supabase dentro de este callback puede bloquear el cliente de auth.
  setTimeout(() => applySession(session), 0);
});

supabaseClient.channel('realtime_sync')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'cronograma_actividades' }, payload => fetchData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'cronograma_archivos' }, payload => fetchData())
  .subscribe();
// ------------------------------------

iniciarInterfaz();

renderAuthArea();
window.onload = () => {
 fetchData();
 supabaseClient.auth.getSession().then(({ data }) => applySession(data.session));
};
