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
    async picture(code, id) {
      return fs.readFileSync(path.join(dir, code + "-" + id + ".jpg"));
    },
    change(code, fn) {
      let s = get(code),
        result = fn(s, (id, bytes) =>
          fs.writeFileSync(path.join(dir, code + "-" + id + ".jpg"), bytes),
        );
      fs.writeFileSync(file(code) + ".tmp", JSON.stringify(s), { mode: 0o600 });
      fs.renameSync(file(code) + ".tmp", file(code));
      return result;
    },
  },
  adminKey,
);
const publicFiles = {
  "/participant-cards.js": ["participant-cards.js", "text/javascript"],
  "/press-influence.js": ["press-influence.js", "text/javascript"],
  "/public-card.js": ["public-card.js", "text/javascript"],
  "/vendor/qrcode-generator.js": [
    "vendor/qrcode-generator.js",
    "text/javascript",
  ],
  "/vendor/jsQR.js": ["vendor/jsQR.js", "text/javascript"],
  "/qr-code.js": ["qr-code.js", "text/javascript"],
  "/admin": ["admin.html", "text/html"],
  "/projection-access.js": ["projection-access.js", "text/javascript"],
  "/plenary-desk.js": ["plenary-desk.js", "text/javascript"],
  "/admin.js": ["admin.js", "text/javascript"],
  "/google.js": ["google.js", "text/javascript"],
  "/design/icons.svg": ["design/icons.svg", "image/svg+xml"],
  "/design/hemicycle.svg": ["design/hemicycle.svg", "image/svg+xml"],
  "/design/inter.woff2": ["design/inter.woff2", "font/woff2"],
  "/design/source-serif.woff2": ["design/source-serif.woff2", "font/woff2"],
  "/report.js": ["report.js", "text/javascript"],
  "/": ["index.html", "text/html"],
  "/citizen-ballot.js": ["citizen-ballot.js", "text/javascript"],
  "/influence.js": ["influence.js", "text/javascript"],
  "/app.js": ["app.js", "text/javascript"],
  "/commission-desk.js": ["commission-desk.js", "text/javascript"],
  "/desk-flow.js": ["desk-flow.js", "text/javascript"],
  "/commission-desk.css": ["commission-desk.css", "text/css"],
  "/commission-screen.js": ["commission-screen.js", "text/javascript"],
  "/commission-screen.css": ["commission-screen.css", "text/css"],
  "/editor.js": ["editor.js", "text/javascript"],
  "/app.css": ["app.css", "text/css"],
};
for (const name of fs.readdirSync(path.join(root, "public/design/measures")))
  publicFiles["/design/measures/" + name] = [
    "design/measures/" + name,
    "image/webp",
  ];
http
  .createServer((req, res) => {
    if (req.url.startsWith("/api/")) return app(req, res);
    const pathname = new URL(req.url, "http://localhost").pathname;
    const f = pathname.startsWith("/carte/")
      ? ["card.html", "text/html"]
      : pathname.startsWith("/projection/")
        ? ["projection.html", "text/html"]
        : publicFiles[pathname];
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
