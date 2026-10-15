let csrfToken = '';

export class ApiError extends Error {
  constructor(message, status, fields = []) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${import.meta.env.BASE_URL}api${path}`, {
      ...options, credentials: 'same-origin', cache: 'no-store',
      headers: { ...(options.body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken } : {}), ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Connexion interrompue. Vérifiez votre réseau et réessayez ; vos réponses restent affichées.', 0);
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || 'Le service est indisponible. Réessayez dans un instant.', response.status, data.fields);
  if (data.csrfToken) csrfToken = data.csrfToken;
  return data;
}

export const refreshSession = () => api('/session');
