import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.join(__dirname, "..", "server.log");
export function fileLog(...args) {
    const ts = new Date().toISOString();
    const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    const line = `[${ts}] ${msg}\n`;
    try {
        fs.appendFileSync(LOG_FILE, line);
    }
    catch { /* ignore */ }
}
