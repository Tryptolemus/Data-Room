export const config = {
  api: {
    responseLimit: '20mb',
  },
};

export default async function handler(req: any, res: any) {
  // Extract URL from query
  const targetUrl = req.query.url as string;

  if (!targetUrl) {
    res.status(400).send('Missing URL parameter');
    return;
  }

  console.log(`[Vercel-Proxy] Fetching URL: ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/pdf, */*'
      }
    });

    if (!response.ok) {
      console.error(`[Vercel-Proxy] Failed to fetch: ${response.status} ${response.statusText}`);
      res.status(response.status).send(`Failed to fetch PDF: ${response.statusText}`);
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(buffer);
  } catch (error) {
    console.error('[Vercel-Proxy] Error:', error);
    res.status(500).send('Failed to proxy PDF');
  }
}
