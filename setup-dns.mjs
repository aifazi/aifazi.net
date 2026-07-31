const https = require("https");

const CLOUDFLARE_TOKEN = process.env.CF_API_TOKEN || "";
const ZONE_ID = "b8348e1c37ee0ae8316b7033854cab89";
const FRONTEND_URL = "aifazi-website-new.vercel.app";
const BACKEND_URL = "aifazi-backend.vercel.app";

const records = [
  { type: "CNAME", name: "aifazi.net", content: "cname.vercel-dns.com", ttl: 1, proxied: false },
  { type: "CNAME", name: "www", content: "cname.vercel-dns.com", ttl: 1, proxied: false },
  { type: "CNAME", name: "fivem", content: FRONTEND_URL, ttl: 1, proxied: false },
  { type: "CNAME", name: "cdn", content: FRONTEND_URL, ttl: 1, proxied: false },
  { type: "CNAME", name: "api", content: BACKEND_URL, ttl: 1, proxied: false },
];

if (!CLOUDFLARE_TOKEN) {
  console.error("Error: Set CF_API_TOKEN environment variable first.");
  console.error("Get it from: https://dash.cloudflare.com/profile/api-tokens");
  console.error("Need: Zone:DNS:Edit permission for aifazi.net");
  process.exit(1);
}

function callCloudflare(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.cloudflare.com",
      path: `/client/v4/zones/${ZONE_ID}${path}`,
      method,
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_TOKEN}`,
        "Content-Type": "application/json",
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function setupDNS() {
  console.log("Setting up DNS records for aifazi.net...\n");
  for (const record of records) {
    try {
      const res = await callCloudflare("POST", "/dns_records", record);
      if (res.success) {
        console.log(`✅ ${record.type} ${record.name}.aifazi.net -> ${record.content}`);
      } else {
        console.log(`❌ ${record.type} ${record.name}.aifazi.net: ${JSON.stringify(res.errors)}`);
      }
    } catch (e) {
      console.error(`❌ ${record.type} ${record.name}.aifazi.net: ${e.message}`);
    }
  }
  console.log("\nDone! DNS changes may take a few minutes to propagate.");
}

setupDNS().catch(console.error);
