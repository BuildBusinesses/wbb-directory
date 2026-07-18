// api/image.js
// Proxies private Jotform upload URLs (headshots, business logos) so the
// JOTFORM_API_KEY is attached server-side and never exposed to the browser.

const JOTFORM_UPLOADS_PREFIX = 'https://www.jotform.com/uploads/';

export default async function handler(req, res) {
  const { url } = req.query;

  if (typeof url !== 'string' || !url.startsWith(JOTFORM_UPLOADS_PREFIX)) {
    res.status(400).json({ error: 'Invalid url' });
    return;
  }

  try {
    const jotformApiKey = process.env.JOTFORM_API_KEY;
    const upstreamResponse = await fetch(`${url}?apiKey=${jotformApiKey}`);

    if (!upstreamResponse.ok) {
      res.status(upstreamResponse.status).end();
      return;
    }

    const contentType = upstreamResponse.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await upstreamResponse.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(buffer);

  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
