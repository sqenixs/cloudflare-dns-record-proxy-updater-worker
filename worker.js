function isValidIP(ip) {
    if (!ip || typeof ip !== 'string') return false;

    // Clean up any extra whitespaces or tabs
    const cleanIp = ip.trim();

    try {
        // Handle IPv6 bracket stripping cleanly if present, otherwise keep as is
        const host = cleanIp.startsWith('[') && cleanIp.endsWith(']') 
            ? cleanIp.slice(1, -1) 
            : cleanIp;

        // Ensure it contains a valid IP structure (chars 0-9, periods, and colons only)
        const validIP = /^[a-f0-9.:]+$/i.test(host) && !/[g-z]{1,}/i.test(host);
        if (!validIP) return false;

        // Evaluate Private Subnets to protect against local routing addresses
        const isPrivate = /^(127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|::1|fe80:|f[cd]00:)/i.test(host);
        return !isPrivate;

    } catch (e){
		console.error("Error checking for valid ip: ", e);
        return false; 
    }
}

export default {
  async fetch(request, env) {
	let timeoutId = null;
	 
	try {  
		const url = new URL(request.url);

		const authHeader = request.headers.get('Authorization');
		if (!authHeader || !authHeader.startsWith('Basic ')) {
		  return new Response('badauth', { status: 401 });
		}

		const base64Token = authHeader.replace(/^Basic\s+/i, '');
		const credentials = atob(base64Token).split(':');
		
		if (credentials[0] !== env.USERNAME || credentials[1] !== env.PASSWORD) {
		  return new Response('badauth', { status: 401 });
		}

		let currentIp = null;
		if (env.USE_REQUEST_IP) {
		   currentIp = request.headers.get('cf-connecting-ip');
		} else {
		   currentIp = url.searchParams.get('myip');
		}
		
		if (!currentIp || !isValidIP(currentIp)) return new Response('badparam', { status: 400 });
		const recordType = currentIp.includes(':') ? 'AAAA' : 'A';
		
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);
			
		const cfResponse = await fetch(`https://api.cloudflare.com/client/v4/zones/${env.ZONE_ID}/dns_records/${env.RECORD_ID}`, {
		  method: 'PUT',
			signal: controller.signal,
			headers: {
			  'Authorization': `Bearer ${env.API_TOKEN}`,
			  'Content-Type': 'application/json'
			},
			body: JSON.stringify({
			  type: recordType,
			  name: env.RECORD_NAME, 
			  content: currentIp,
			  ttl: 120,
			  private_routing: false,
			  proxied: false
			})
		  });
		  
		  clearTimeout(timeoutId);

		  const data = await cfResponse.json();
		  return data.success ? new Response('good', { status: 200 }) : new Response('dnserr', { status: 400 });

    } catch (e) {
	  clearTimeout(timeoutId);
	  console.error("Error in worker: ", e);
	  return new Response('911', { status: 500 });
	}
  }
};
