import { NextRequest, NextResponse } from "next/server";
import { diagnoseSkillGap, type UserInput } from "@/lib/openrouter";

// ─── 요청 바디 타입 ──────────────────────────────────────────────────────────
// UserInput과 동일하지만, HTTP 레이어에서 별도로 선언해
// 요청 검증과 비즈니스 로직의 관심사를 분리합니다.
interface DiagnoseRequestBody {
  currentSkills: string;
  targetRole: string;
  weeklyHours: number;
  additionalContext?: string;
  /** 모델 오버라이드 (선택, 기본값은 openrouter.ts에서 지정) */
  model?: string;
}

// ─── 요청 바디 검증 ──────────────────────────────────────────────────────────
interface ValidationResult {
  ok: boolean;
  error?: string;
}

function validateBody(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "요청 바디가 유효한 JSON 객체가 아닙니다." };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.currentSkills !== "string" || !b.currentSkills.trim()) {
    return { ok: false, error: "currentSkills는 비어 있지 않은 문자열이어야 합니다." };
  }

  if (typeof b.targetRole !== "string" || !b.targetRole.trim()) {
    return { ok: false, error: "targetRole은 비어 있지 않은 문자열이어야 합니다." };
  }

  const hours = Number(b.weeklyHours);
  if (isNaN(hours) || hours <= 0 || hours > 168) {
    return { ok: false, error: "weeklyHours는 1~168 사이의 숫자여야 합니다." };
  }

  if (b.model !== undefined && typeof b.model !== "string") {
    return { ok: false, error: "model은 문자열이어야 합니다." };
  }

  return { ok: true };
}

// ─── POST /api/diagnose ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // ── 1. 환경 변수 사전 확인 ──────────────────────────────────────────────────
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("[/api/diagnose] OPENROUTER_API_KEY 환경 변수가 설정되지 않았습니다.");
    return NextResponse.json(
      { success: false, error: "서버 설정 오류: API 키가 없습니다." },
      { status: 500 }
    );
  }

  // ── 2. 요청 바디 파싱 ──────────────────────────────────────────────────────
  let body: DiagnoseRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "요청 바디를 JSON으로 파싱할 수 없습니다." },
      { status: 400 }
    );
  }

  // ── 3. 입력 검증 ───────────────────────────────────────────────────────────
  const validation = validateBody(body);
  if (!validation.ok) {
    return NextResponse.json(
      { success: false, error: validation.error },
      { status: 422 }
    );
  }

  // ── 4. 진단 실행 ───────────────────────────────────────────────────────────
  const userInput: UserInput = {
    currentSkills: body.currentSkills.trim(),
    targetRole: body.targetRole.trim(),
    weeklyHours: Number(body.weeklyHours),
    additionalContext: body.additionalContext?.trim(),
  };

  try {
    const result = await diagnoseSkillGap(userInput, body.model);

    return NextResponse.json(
      { success: true, data: result },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";

    // 클라이언트 오류(잘못된 입력)와 서버 오류를 구분합니다.
    const isClientError = message.includes("필수 입력값") || message.includes("사이의 값");
    const statusCode = isClientError ? 422 : 502;

    console.error(`[/api/diagnose] 오류 (${statusCode}):`, message);

    return NextResponse.json(
      { success: false, error: message },
      { status: statusCode }
    );
  }
}

// ─── GET /api/diagnose — 헬스 체크 ───────────────────────────────────────────
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      endpoint: "POST /api/diagnose",
      requiredFields: ["currentSkills", "targetRole", "weeklyHours"],
      optionalFields: ["additionalContext", "model"],
    },
    { status: 200 }
  );
}
