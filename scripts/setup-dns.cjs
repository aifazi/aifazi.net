const https = require("https");

const CLOUDFLARE_TOKEN = process.env.CF_API_TOKEN;
const ZONE_ID = process.env.CF_ZONE_ID || "";
const FRONTEND_URL = "aifazi-net-frontend-next.vercel.app";
const BACKEND_URL = "aifazinet-backend-fastapi.vercel.app";

const dnsRecords = [
  { type: "CNAME", name: "aifazi.net", content: "cname.vercel-dns.com", ttl: 600, proxied: false },
  { type: "CNAME", name: "www.aifazi.net", content: "cname.vercel-dns.com", ttl: 600, proxied: false },
  { type: "CNAME", name: "fivem.aifazi.net", content: FRONTEND_URL, ttl: 600, proxied: false },
  { type: "CNAME", name: "cdn.aifazi.net", content: FRONTEND_URL, ttl: 600, proxied: false },
  { type: "CNAME", name: "api.aifazi.net", content: BACKEND_URL, ttl: 600, proxied: false },
];

if (!CLOUDFLARE_TOKEN) {
  console.error("ERROR: Set CF_API_TOKEN env var first.");
  console.error("Create one at: https://dash.cloudflare.com/profile/api-tokens");
  console.error("Permission needed: Zone DNS:Edit");
  process.exit(1);
}
if (!ZONE_ID) {
  console.error("ERROR: Set CF_ZONE_ID env var first.");
  console.error("Find it on the Cloudflare zone overview page.");
  process.exit(1);
}

function callAPI(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "api.cloudflare.com",
      path: "/client/v4/zones/" + ZONE_ID + path,
      method,
      headers: {
        Authorization: "Bearer " + CLOUDFLARE_TOKEN,
        "Content-Type": "application/json",
      },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
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

async function main() {
  console.log("Fetching existing DNS records...");
  const existing = await callAPI("GET", "/dns_records");
  let existingMap = {};
  if (existing.success && existing.result) {
    existing.result.forEach((r) => {
      existingMap[r.type + ":" + r.name] = r;
    });
  }

  console.log("Setting up DNS records for aifazi.net...\n");
  let added = 0;

  for (const rec of dnsRecords) {
    const key = rec.type + ":" + rec.name;
    const existing = existingMap[key];

    if (existing && existing.content === rec.content) {
      console.log("SKIP  " + rec.type + " " + rec.name + " -> " + rec.content + " (already exists)");
      continue;
    }

    // Update an existing record that points at a stale target instead of leaving a duplicate.
    if (existing) {
      try {
        const res = await callAPI("PATCH", "/dns_records/" + existing.id, rec);
        if (res.success) {
          console.log("UPD   " + rec.type + " " + rec.name + " -> " + rec.content);
          added++;
        } else {
          console.log("ERR   " + rec.type + " " + rec.name + ": " + JSON.stringify(res.errors));
        }
      } catch (e) {
        console.log("ERR   " + rec.type + " " + rec.name + ": " + e.message);
      }
      continue;
    }

    try {
      const res = await callAPI("POST", "/dns_records", rec);
      if (res.success) {
        console.log("DONE  " + rec.type + " " + rec.name + " -> " + rec.content);
        added++;
      } else {
        console.log("ERR   " + rec.type + " " + rec.name + ": " + JSON.stringify(res.errors));
      }
    } catch (e) {
      console.log("ERR   " + rec.type + " " + rec.name + ": " + e.message);
    }
  }

  console.log("\n" + added + " record(s) added.");
  console.log("DNS changes may take 1-5 minutes to propagate.");
}

main().catch(console.error);