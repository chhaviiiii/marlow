const url = process.env.MARLOW_URL || "http://localhost:3000";

const res = await fetch(`${url}/api/clerk/sweep`, { method: "POST" });
if (!res.ok) {
  console.error(`Sweep failed: ${res.status}`);
  process.exit(1);
}
const data = await res.json();
console.log(`Sweep complete. Transcript entries added: ${data.added ?? 0}`);
