# Cloudflare Record update Worker Proxy

A highly secure, lightweight Cloudflare Worker that acts as a secure proxy gateway for record updates.  

## What This Project Does

This Worker serves as a firewall and security abstraction layer between the client and the Cloudflare DNS API. 

Instead of deploying your global Cloudflare API keys or widely scoped Zone tokens directly onto an edge client device—where they could be exposed if the device is compromised—this Worker gates the transaction behind custom HTTP Basic Authentication credentials. The client communicates solely with this Worker using a unique username and password. The Worker then securely handles the background API connection to update your specified DNS target record.

### Key Security Benefits
* **No Client Token Exposure:** Your actual Cloudflare API tokens never leave Cloudflare's secure infrastructure.
* **Granular Least-Privilege Scoping:** It locks your Dynamic DNS client down to a singular, specific DNS record identifier. Even if your credentials are lost or leaked, an attacker cannot modify other domains, change DNS settings, or access your wider Cloudflare account.
* **Protocol & Token Insulation:** Gated by highly restricted environment variables hidden away from cleartext view.

---

## Required Environment Secrets

To deploy this Worker, you must generate and bind the following **Secrets** inside your Cloudflare Worker Dashboard:

| Secret Key | Purpose |
| :--- | :--- |
| `API_TOKEN` | A scoped Cloudflare API Token generated with permission to edit **only** the single specific DNS zone required. |
| `ZONE_ID` | The unique alphanumeric identifier for your specific Cloudflare zone (e.g., your root domain name profile). |
| `RECORD_ID` | The specific unique string identifier mapping directly to the individual `A` or `AAAA` DNS record you are automating. |
| `RECORD_NAME` | The exact fully qualified domain name (FQDN) being targeted for the IP change (e.g., `yourdomain.com`). |
| `USERNAME` | A custom username chosen by you that your client must use during the HTTP Basic Auth handshake. |
| `PASSWORD` | A custom high-entropy password of your choosing that your client must pass to authenticate. |

## Optional variables
| `USE_REQUEST_IP` | Set to `true` (string or boolean) if you want the Worker to automatically grab the client's current public IP via incoming connection metadata (`cf-connecting-ip`) rather than relying on a URL query parameter. |

---

## Architecture & Infrastructure Notes

### Custom Domain & Path Routing Strategy
**Configuring infrastructure routing is entirely at the discretion of the developer.** 

To achieve optimal security and limit compute overhead, it is highly recommended to avoid a standard "Custom Domain" catch-all setting on the Worker. Instead:
1. Manually add an edge-facing proxy placeholder record in your main DNS panel (e.g., a dummy proxied `AAAA` record pointing to `100::`).
2. Bind a precise **Custom Route** inside your Worker infrastructure configuration mapping strictly to your specialized update path (e.g., `special.yourdomain.com/myroute`).

This structural sequence ensures that **only** exact URI traffic hits your compute application script. General traffic scanning the root subdomain or guessing random paths will be silently dropped by Cloudflare's global edge infrastructure before it can consume any of your daily free Worker compute allocations.

### Rate Limiting Considerations
**Rate limiting implementations are left to the discretion and architectural needs of the developer.** 

Depending on your Cloudflare subscription plan limits and network configurations, you can choose to handle endpoint protection via multiple methods:
* **Consolidated Free-Tier WAF Engine Rules:** You can choose to optimize your single allowed Cloudflare Free Plan Rate Limiting rule by grouping the `/update` URI path alongside other low-traffic system paths (such as OpenPGP validation keys) using logic paths. Because Cloudflare dynamically segments rate-limiting buckets on an isolated, per-individual client IP address framework, high traffic or attacks hitting other services will not trigger false positives or accidentally lock your client out of its update engine.
* **Custom Rule Expressions:** Alternatively, developers can leverage free Cloudflare WAF Custom Rules using `Block` parameters to filter specific matching requirements or query components prior to passing requests to the internal code evaluation process.

---

## Example Client Usage (cURL)

Once configured, your client or cron daemon triggers updates by hitting your secure custom route with its matching authentication profile:

```bash
curl -X GET "https://yourdomain.com?myip=1.2.3.4" \
     -H "Authorization: Basic \$(echo -n 'YOUR_USER:YOUR_PASSWORD' | base64)"
```

If you are using `USE_REQUEST_IP=true`, the client doesn't even need to provide its own IP explicitly:

```bash
curl -X GET "https://yourdomain.com" \
     -H "Authorization: Basic \$(echo -n 'YOUR_USER:YOUR_PASSWORD' | base64)"
```

### Potential Response Output Codes
* `good`: The API verified credentials, verified structural IP metrics, and successfully pushed the record update to Cloudflare's global DNS ledger.
* `badauth`: Provided credentials failed validation matching parameters.
* `badparam`: The incoming IP request string is empty, failed structural integrity checks, or maps directly to a private, non-routable subnet space (e.g., `192.168.x.x`).
* `dnserr`: The authentication passed, but Cloudflare's backend API rejected the modification query (such as mismatched Zone or Record configuration states).
* `911`: Internal error or service fetch anomaly.
