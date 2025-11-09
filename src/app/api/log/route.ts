export async function POST(req: Request) {
  const body = await req.json();
  console.log("🪵 Log from client:", ...body.args);
  return new Response("ok");
}
