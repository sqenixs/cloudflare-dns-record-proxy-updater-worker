function isValidIP(ip) {
    if (!ip || typeof ip !== 'string') return false;

    let cleanIp;

    try {
        // 1. Let the native URL engine parse and automatically clean the string
        const url = new URL(`https://[${ip.trim()}]`);
        
        // 2. Extract the pristine hostname, stripping brackets, semicolons, or paths
        cleanIp = url.hostname.replace(/[\[\]]/g, '');

        // 3. Ensure it is a valid IP structure and not a standard domain name
        const validIP = /^[a-f0-9.:]+$/i.test(cleanIp) && !/[g-z]{1,}/i.test(cleanIp);
        if (!validIP) return false;
    } catch {
        return false; 
    }

    // 4. Evaluate Private Subnets using the completely pristine cleanIp string
    const isPrivate = /^(127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|::1|fe80:|f[cd]00:)/i.test(cleanIp);
    
    return !isPrivate;
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
	  return new Response('911', { status: 500 });
	}
  }
};
