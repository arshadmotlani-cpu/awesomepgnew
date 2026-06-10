export async function GET() {
  return Response.json({
    ok: true,
    message: "health route working"
  });
}
