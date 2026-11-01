import { createObservatory } from "../server/observatory.mjs";
const results = await createObservatory().collect();
for (const result of results) console.log(`Stars snapshots: ${result.status}`);
if (results.some((r) => r.status === "rejected")) process.exitCode = 1;
