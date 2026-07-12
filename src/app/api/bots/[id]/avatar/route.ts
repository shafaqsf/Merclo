import { NextRequest, NextResponse } from "next/server";
import { getBot } from "@/lib/db/bots";
import { createServerSupabase } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const bot = await getBot(id);
  if (!bot) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Unsupported image type. Use PNG, JPEG, or WEBP." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 2MB)." },
      { status: 400 }
    );
  }

  const path = `${id}/${crypto.randomUUID()}.${ext}`;
  const supabase = await createServerSupabase();
  const { error } = await supabase.storage
    .from("bot-avatars")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabase.storage.from("bot-avatars").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
