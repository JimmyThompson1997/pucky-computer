import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = 4173;
const rootDir = path.dirname(fileURLToPath(new URL("../index.html", import.meta.url)));

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".png", "image/png"],
  [".ico", "image/x-icon"]
]);

function assetCacheHeader(extension, pathname) {
  if (pathname === "/" || extension === ".html") {
    return "no-store";
  }
  if ([".avif", ".webp", ".svg", ".css", ".js", ".json"].includes(extension)) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=3600";
}

async function resolvePath(pathname) {
  const safePath = path
    .normalize(decodeURIComponent(pathname))
    .replace(/^[/\\]+/, "")
    .replace(/^(\.\.[/\\])+/, "");
  const joined = path.join(rootDir, safePath);

  if (pathname === "/") {
    return path.join(rootDir, "index.html");
  }

  if (path.extname(joined)) {
    return joined;
  }

  const htmlPath = `${joined}.html`;
  try {
    await fs.access(htmlPath);
    return htmlPath;
  } catch {}

  const directoryIndex = path.join(joined, "index.html");
  try {
    await fs.access(directoryIndex);
    return directoryIndex;
  } catch {}

  return joined;
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${host}:${port}`);
    const filePath = await resolvePath(requestUrl.pathname);
    const file = await fs.readFile(filePath);
    const extension = path.extname(filePath);
    const mimeType = mimeTypes.get(extension) || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": mimeType,
      "Cache-Control": assetCacheHeader(extension, requestUrl.pathname)
    });
    res.end(file);
  } catch {
    res.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`Static preview ready at http://${host}:${port}`);
});
