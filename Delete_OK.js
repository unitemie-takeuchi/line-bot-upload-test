import fetch from "node-fetch";

await fetch("http://192.168.1.194:8080", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ command: "MakeReport" }),
});
