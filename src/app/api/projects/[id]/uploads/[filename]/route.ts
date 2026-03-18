export async function GET(req: Request, { params }: { params: Promise<{ id: string; filename: string }> }) {
  const { filename } = await params;

  try {
    const pyResp = await fetch(`http://localhost:8000/uploads/${filename}`);
    if (!pyResp.ok) {
      return new Response("File not found", { status: 404 });
    }

    const contentType = pyResp.headers.get("content-type") || "application/octet-stream";

    return new Response(pyResp.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("File not found", { status: 404 });
  }
}
