import { boundedText } from "./storage.mjs";
import { readmeFromHtml } from "./github-public.mjs";

// Anonymous raw access verifies that the document itself is publicly available.
export async function readAnonymousProject(fullName, fetchImpl = fetch) {
  for (const path of ["README.md", "README"]) {
    try {
      const response = await fetchImpl(
        `https://raw.githubusercontent.com/${fullName}/HEAD/${path}`,
        {
          redirect: "error",
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        continue;
      }
      const content = await boundedText(response, 200_000);
      if (content.trim().length < 12) continue;
      const fetchedAt = new Date().toISOString();
      return {
        metadata: {
          data: {
            full_name: fullName,
            private: false,
            default_branch: "HEAD",
            description: "",
          },
          fetchedAt,
          source: "live",
        },
        document: { data: { content, path }, fetchedAt, source: "live" },
      };
    } catch {
      /* Try the next conventional filename; never invent content. */
    }
  }
  try {
    const response = await fetchImpl(`https://github.com/${fullName}`, {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Open-Source-Observatory" },
    });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const html = await boundedText(response, 2_000_000);
    const meta = (name) =>
      html
        .match(new RegExp(`<meta\\b[^>]*name=["']${name}["'][^>]*>`, "i"))?.[0]
        .match(/content=["']([^"']+)["']/i)?.[1];
    if (
      meta("octolytics-dimension-repository_public") !== "true" ||
      meta("octolytics-dimension-repository_nwo")?.toLowerCase() !==
        fullName.toLowerCase()
    )
      return null;
    const content = readmeFromHtml(html);
    if (content.length < 12) return null;
    const fetchedAt = new Date().toISOString();
    return {
      metadata: {
        data: { full_name: fullName, private: false, description: "" },
        fetchedAt,
        source: "live",
      },
      document: { data: { content }, fetchedAt, source: "live" },
    };
  } catch {
    /* No public source could be verified. */
  }
  return null;
}
