// Uses the same endpoint as Quick Read; credentials stay on the server.
const [repo, ...flags] = process.argv.slice(2);
if (
  !/^[\w.-]+\/[\w.-]+$/.test(repo || "") ||
  flags.some((flag) => flag !== "--regenerate")
) {
  console.error(
    "用法：node scripts/generate-project-trial.mjs owner/repo [--regenerate]",
  );
  process.exit(1);
}
const base = process.env.TRIAL_BASE_URL || "http://127.0.0.1:5173";
async function request(path, options) {
  const response = await fetch(`${base}/api/observatory/trials${path}`, {
    signal: AbortSignal.timeout(15000),
    ...options,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body.data;
}
let status = await request("", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ repo, regenerate: flags.includes("--regenerate") }),
});
let stage = "";
const deadline = Date.now() + 8 * 60_000;
while (status.job?.state === "running") {
  if (status.job.stage !== stage) console.log((stage = status.job.stage));
  if (Date.now() > deadline)
    throw new Error("等待超时；服务端仍可继续，请在项目试用中查看。");
  await new Promise((resolve) => setTimeout(resolve, 3000));
  status = await request(`?repo=${encodeURIComponent(repo)}`);
}
if (status.job?.state === "error") throw new Error(status.job.error);
if (!status.trial) throw new Error("没有取得试用结果。");
console.log(
  JSON.stringify(
    {
      repo: status.trial.repo,
      templateVersion: status.trial.templateVersion || "legacy",
      model: status.trial.model,
      generatedAt: status.trial.generatedAt,
      url: `${base}/#/trial/${repo}`,
      reused: !stage,
    },
    null,
    2,
  ),
);
