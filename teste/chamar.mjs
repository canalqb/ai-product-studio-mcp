import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const [tool, argsSpec] = process.argv.slice(2);

const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, "..", "server.js")] });
const client = new Client({ name: "teste-cli", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);

if (!tool || tool === "list") {
  const { tools } = await client.listTools();
  console.log(tools.map((t) => `${t.name}: ${t.description}`).join("\n"));
} else {
  let args = {};
  if (argsSpec) {
    args = argsSpec.startsWith("@")
      ? JSON.parse(fs.readFileSync(argsSpec.slice(1), "utf8"))
      : JSON.parse(argsSpec);
  }
  const res = await client.callTool({ name: tool, arguments: args });
  for (const c of res.content || []) if (c.type === "text") console.log(c.text);
  if (res.isError) process.exitCode = 1;
}
await client.close();
process.exit(0);
