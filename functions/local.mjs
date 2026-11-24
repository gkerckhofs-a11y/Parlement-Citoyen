import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { api } from "./api.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)),
  dir = path.join(root, ".runtime");
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const keyFile = path.join(dir, "organisateur");
if (!fs.existsSync(keyFile))
  fs.writeFileSync(keyFile, randomBytes(18).toString("base64url"), {
    mode: 0o600,
  });
const adminKey = process.env.ADMIN_KEY || fs.readFileSync(keyFile, "utf8");
const file = (code) => path.join(dir, code + ".json");
const get = (code) => {
  if (!fs.existsSync(file(code))) throw Error("Session introuvable");
  return JSON.parse(fs.readFileSync(file(code)));
};
const app = api(
  {
    create(s) {
      fs.writeFileSync(file(s.code), JSON.stringify(s), {
        flag: "wx",
        mode: 0o600,
      });
    },
    get,
    change(code, fn) {
      let s = get(code),
        result = fn(s);
      fs.writeFileSync(file(code) + ".tmp", JSON.stringify(s), { mode: 0o600 });
      fs.renameSync(file(code) + ".tmp", file(code));
      return result;
    },
  },
  adminKey,
);
const publicFiles = {
  "/admin": ["admin.html", "text/html"],
  "/admin.js": ["admin.js", "text/javascript"],
  "/google.js": ["google.js", "text/javascript"],
  "/design/icons.svg": ["design/icons.svg", "image/svg+xml"],
  "/design/hemicycle.svg": ["design/hemicycle.svg", "image/svg+xml"],
  "/design/inter.woff2": ["design/inter.woff2", "font/woff2"],
  "/design/source-serif.woff2": ["design/source-serif.woff2", "font/woff2"],
  "/report.js": ["report.js", "text/javascript"],
  "/": ["index.html", "text/html"],
  "/app.js": ["app.js", "text/javascript"],
  "/editor.js": ["editor.js", "text/javascript"],
  "/app.css": ["app.css", "text/css"],
};
http
  .createServer((req, res) => {
    if (req.url.startsWith("/api/")) return app(req, res);
    let f = publicFiles[new URL(req.url, "http://localhost").pathname];
    if (!Array.isArray(f)) {
      res.writeHead(404);
      return res.end();
    }
    res.setHeader("Content-Type", f[1] + "; charset=utf-8");
    res.end(fs.readFileSync(path.join(root, "public", f[0])));
  })
  .listen(Number(process.env.PORT || 8080), "127.0.0.1", () =>
    console.log(
      "Parlement citoyen · http://localhost:" +
        (process.env.PORT || 8080) +
        " · clé de création dans .runtime/organisateur",
    ),
  );
