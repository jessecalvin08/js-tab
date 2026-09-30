const KEY_STORAGE = 'js-tab-gemini-key';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// "-latest" aliases follow Google's current Flash / Pro models, so the names
// don't go stale when a new generation ships.
export const GEMINI_MODELS = {
  fast: 'gemini-flash-latest',
  pro: 'gemini-pro-latest',
  image: 'gemini-2.5-flash-image'
};

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

const TEXT_EXTENSIONS = /\.(txt|md|markdown|csv|json|js|jsx|ts|tsx|css|html|xml|py|java|c|cpp|log)$/i;
const NATIVE_TYPES = /^(image\/(png|jpeg|webp|heic|heif)|application\/pdf|text\/(plain|html|css|csv|xml|rtf|markdown|md)|audio\/|video\/)/i;

export function getGeminiKey() {
  try {
    return window.localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function saveGeminiKey(key) {
  try {
    window.localStorage.setItem(KEY_STORAGE, key.trim());
  } catch {
    // key simply isn't remembered
  }
}

export function clearGeminiKey() {
  try {
    window.localStorage.removeItem(KEY_STORAGE);
  } catch {
    // nothing to clear
  }
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function fileToPart(file) {
  let mimeType = file.type;
  if (!NATIVE_TYPES.test(mimeType)) {
    if (!mimeType || TEXT_EXTENSIONS.test(file.name) || mimeType.startsWith('text/') || mimeType === 'application/json') {
      mimeType = 'text/plain';
    } else {
      throw new Error(`${file.name}: this file type isn't supported. Try a PDF, image or text file.`);
    }
  }
  return { inlineData: { mimeType, data: await toBase64(file) } };
}

// `history` is an array of { role: 'user' | 'model', parts }; the new user turn is appended.
export async function askGemini({ key, mode, model, history, parts, signal }) {
  const modelId = mode === 'image' ? GEMINI_MODELS.image : GEMINI_MODELS[model] ?? GEMINI_MODELS.fast;
  const body = {
    contents: [...history, { role: 'user', parts }],
    ...(mode === 'image' && { generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } })
  };

  const response = await fetch(`${ENDPOINT}/${modelId}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
    signal
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Gemini request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }

  const candidate = data?.candidates?.[0];
  const out = candidate?.content?.parts ?? [];
  const text = out.filter((part) => part.text).map((part) => part.text).join('');
  const images = out.filter((part) => part.inlineData).map((part) => part.inlineData);

  if (!text && !images.length) {
    throw new Error(data?.promptFeedback?.blockReason
      ? `Gemini blocked this request (${data.promptFeedback.blockReason}).`
      : 'Gemini returned an empty answer.');
  }
  return { text, images };
}
