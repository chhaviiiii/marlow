export async function deployClerk() {
  const token = process.env.ASTROPODS_TOKEN;
  const account = process.env.ASTROPODS_ACCOUNT;
  const spec = {
    account: account ?? "field-and-grain",
    name: "marlow-clerk",
    interfaces: ["web"],
  };
  if (!token || !account) {
    return {
      deployed: false,
      note: "Astropods token not set. The blueprint in astropods.yml is what `ast blueprint push` publishes. Deploy is POST /api/v1/deploy.",
      spec,
    };
  }
  const res = await fetch("https://astropods.com/api/v1/deploy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(spec),
  });
  const json = (await res.json().catch(() => ({}))) as { status?: string; name?: string; error?: string };
  return {
    deployed: res.ok,
    note: res.ok
      ? `Astropods ${json.status ?? "accepted"} for ${json.name ?? spec.name}.`
      : json.error || `Astropods returned ${res.status}.`,
    spec,
  };
}
