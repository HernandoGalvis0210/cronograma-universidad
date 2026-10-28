// Estado compartido y constantes de la página.

// --- LÍMITES DE SUBIDA DE ARCHIVOS ---
// Se comprueban en la página antes de subir. Si el bucket tiene su propio
// límite de tamaño o de tipos, Supabase también lo aplica.
export const MAX_UPLOAD_MB = 10;
export const MAX_FILE_NAME_LENGTH = 255; // igual que el CHECK de cronograma_archivos.name
// Extensión permitida → tipos MIME aceptados para ella.
export const ALLOWED_UPLOAD_TYPES = {
  pdf:  ["application/pdf"],
  doc:  ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls:  ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ppt:  ["application/vnd.ms-powerpoint"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  jpg:  ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png:  ["image/png"],
  webp: ["image/webp"]
};
export const ALLOWED_UPLOAD_LABEL = "PDF, Word, Excel, PowerPoint, JPG, PNG o WebP";
export const UPLOAD_ACCEPT = Object.keys(ALLOWED_UPLOAD_TYPES).map(ext => "." + ext).join(",");
// ------------------------------------

// --- MENSAJES Y LÍMITES DE LA BASE DE DATOS ---
export const BUCKET = 'cronograma-archivos';
export const PERMISSION_MSG = "No tienes permisos para realizar esta acción. Si eres revisor, inicia sesión con «Acceso revisores».";
export const TOO_LONG_MSG = "No se guardó: el texto es demasiado largo. Acórtalo e inténtalo de nuevo.";
// Igual que los CHECK de roles-2.sql (en caracteres).
export const MAX_NOTES_LENGTH = 50000;
export const NO_ROWS_MSG = "No se aplicó el cambio: no tienes permisos o el registro ya no existe. Si eres revisor, inicia sesión con «Acceso revisores».";
// ------------------------------------

// --- TEXTOS DE ESTADO Y ROL ---
export const statusText={pending:"Pendiente", approved:"Aprobado", done:"Completada"};
export const roleText={superior:"Superior", academico:"Académico", administracion:"Administración", administrador:"Administrador"};
export const SEDES_FIJAS = ["Villa del Rosario", "Cúcuta", "Pamplona"];
export const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const VALOR_TODOS_LOS_DIAS = "__todos__";
// ------------------------------------

// --- VISTAS ---
// "lista" es la línea de tiempo; "calendario", el mes. La elección se recuerda en localStorage.
export const VISTAS = ["lista", "calendario"];
// ------------------------------------

// --- ESTADO COMPARTIDO ---
// Un solo objeto para que todos los módulos lean y cambien los mismos datos.
// El rol nunca se guarda en el navegador: se vuelve a leer de "perfiles".
export const estado = {
  activities: [],
  filesData: {},
  currentFilter: "all",
  editingId: null,
  openCards: [],
  currentSession: null,
  currentRole: null,
  authVersion: 0,
  loginReturnFocus: null,
  vista: "lista",
  calMes: null,        // mes que muestra el calendario: { y, m }
  calFoco: null,       // día que recibe el foco con el teclado: { y, m, d }
  calDetalle: null,    // detalle abierto: { tipo: "dia", fecha } o { tipo: "actividad", id }
  calRetornoFoco: null // a dónde vuelve el foco al cerrar el detalle
};

// "activities" sigue disponible en la consola del navegador (lo usan las
// pruebas de supabase/LEEME.md). Solo lectura.
Object.defineProperty(window, 'activities', { get: () => estado.activities, configurable: true });
// ------------------------------------
