/** Receives Apple's form_post (usePopup: false) and forwards tokens to the SPA completion route. */
export const handler = async (event) => {
  const completeUrl = 'https://rnkx.netlify.app/auth/apple/complete';

  if (event.httpMethod === 'GET') {
    return {
      statusCode: 302,
      headers: { Location: '/auth' },
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const params = new URLSearchParams(event.body || '');
  const query = new URLSearchParams();

  for (const key of ['id_token', 'code', 'state', 'user', 'error']) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }

  return {
    statusCode: 302,
    headers: {
      Location: `${completeUrl}?${query.toString()}`,
    },
  };
};
