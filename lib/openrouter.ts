import OpenAI from "openai";
import fs from "fs";
import path from "path";
import type { DiagnosisResult } from "@/types/skillsprint";

// ─── 싱글턴 클라이언트 ───────────────────────────────────────────────────────
// OpenAI SDK의 baseURL만 교체해 OpenRouter를 호출합니다.
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    // OpenRouter 권장 헤더 — 사이트 URL과 앱 이름을 채워주세요.
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    "X-Title": "SkillSprint",
  },
});

// ─── 정적 애셋 로딩 (서버 부팅 시 1회만 읽음) ────────────────────────────────
function loadAsset(relativePath: string): string {
  const absPath = path.join(process.cwd(), relativePath);
  try {
    return fs.readFileSync(absPath, "utf-8");
  } catch (err) {
    throw new Error(
      `[openrouter] 파일 로드 실패: ${absPath}\n원인: ${String(err)}`
    );
  }
}

// lib/ 디렉토리 기준 경로
const SYSTEM_PROMPT = loadAsset("lib/system-prompt.md");
const DIAGNOSIS_SCHEMA = JSON.parse(loadAsset("lib/diagnosis-schema.json"));

// ─── 유저 입력 타입 ──────────────────────────────────────────────────────────
export interface UserInput {
  /** 현재 보유 스킬 목록 (쉼표 또는 줄바꿈 구분) */
  currentSkills: string;
  /** 목표 직무 / 역할 */
  targetRole: string;
  /** 주당 가용 학습 시간 (단위: 시간) */
  weeklyHours: number;
  /** 추가 컨텍스트 (선택, 예: "대학교 3학년", "인턴 준비 중") */
  additionalContext?: string;
}

// ─── 유저 메시지 빌더 ────────────────────────────────────────────────────────
function buildUserMessage(input: UserInput): string {
  const lines = [
    `## 현재 보유 스킬`,
    input.currentSkills.trim(),
    ``,
    `## 목표 직무`,
    input.targetRole.trim(),
    ``,
    `## 주당 가용 학습 시간`,
    `${input.weeklyHours}시간`,
  ];

  if (input.additionalContext?.trim()) {
    lines.push(``, `## 추가 컨텍스트`, input.additionalContext.trim());
  }

  return lines.join("\n");
}

// ─── JSON 안전 파싱 ──────────────────────────────────────────────────────────
// LLM이 응답에 ```json 펜스를 포함하는 경우를 방어합니다.
function safeParseJSON(raw: string): unknown {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(stripped);
  } catch {
    // 파싱 실패 시 원문을 포함한 에러를 던져 디버깅을 돕습니다.
    throw new Error(
      `[openrouter] JSON 파싱 실패.\n--- 원문 (첫 500자) ---\n${raw.slice(0, 500)}`
    );
  }
}

// ─── 간이 런타임 검증 ────────────────────────────────────────────────────────
// 전체 JSON Schema 검증 라이브러리 없이 필수 필드만 확인합니다.
// 프로덕션에서는 zod 또는 ajv를 추가하는 것을 권장합니다.
function assertDiagnosisResult(data: unknown): asserts data is DiagnosisResult {
  if (typeof data !== "object" || data === null) {
    throw new Error("[openrouter] 응답이 객체가 아닙니다.");
  }

  const d = data as Record<string, unknown>;
  const required: Array<keyof DiagnosisResult> = [
    "summary",
    "target_role",
    "total_estimated_hours",
    "weekly_hours_available",
    "estimated_weeks_to_ready",
    "readiness_score",
    "skill_gaps",
    "curriculum",
    "motivational_note",
  ];

  for (const key of required) {
    if (!(key in d)) {
      throw new Error(`[openrouter] 응답에 필수 필드 누락: "${key}"`);
    }
  }

  if (!Array.isArray(d.skill_gaps) || d.skill_gaps.length < 1) {
    throw new Error("[openrouter] skill_gaps 배열이 비어 있습니다.");
  }

  if (!Array.isArray(d.curriculum) || d.curriculum.length < 1) {
    throw new Error("[openrouter] curriculum 배열이 비어 있습니다.");
  }
}

// ─── 메인 함수 ───────────────────────────────────────────────────────────────

/**
 * diagnoseSkillGap
 *
 * 유저 입력 → OpenRouter(LLM) → DiagnosisResult(JSON) 반환
 *
 * @param input   사용자 역량/목표/시간 정보
 * @param model   사용할 모델 (기본값: google/gemini-flash-1.5)
 * @returns       검증된 DiagnosisResult 객체
 * @throws        API 오류, JSON 파싱 오류, 필드 검증 오류
 */
export async function diagnoseSkillGap(
  input: UserInput,
  model: string = process.env.OPENROUTER_MODEL ?? "google/gemini-2.0-flash-001"
): Promise<DiagnosisResult> {
  // ── 1. 입력 기본 검증 ──────────────────────────────────────────────────────
  if (!input.currentSkills.trim()) {
    throw new Error("currentSkills는 필수 입력값입니다.");
  }
  if (!input.targetRole.trim()) {
    throw new Error("targetRole은 필수 입력값입니다.");
  }
  if (input.weeklyHours <= 0 || input.weeklyHours > 168) {
    throw new Error("weeklyHours는 1~168 사이의 값이어야 합니다.");
  }

  // ── 2. 스키마를 시스템 프롬프트에 인라인 삽입 ─────────────────────────────
  // LLM이 스키마를 context window 안에서 바로 참조하도록 합니다.
  const systemWithSchema = [
    SYSTEM_PROMPT,
    "",
    "## REQUIRED JSON SCHEMA",
    "You MUST respond with a single JSON object that strictly conforms to the schema below.",
    "```json",
    JSON.stringify(DIAGNOSIS_SCHEMA, null, 2),
    "```",
  ].join("\n");

  // ── 3. OpenRouter API 호출 ─────────────────────────────────────────────────
  let rawContent: string;
  try {
    const response = await openrouter.chat.completions.create({
      model,
      // temperature를 낮춰 구조화된 출력의 일관성을 높입니다.
      temperature: 0.3,
      max_tokens: 2048,
      response_format: { type: "json_object" }, // JSON mode 활성화
      messages: [
        { role: "system", content: systemWithSchema },
        { role: "user", content: buildUserMessage(input) },
      ],
    });

    rawContent = response.choices[0]?.message?.content ?? "";

    if (!rawContent) {
      throw new Error("LLM이 빈 응답을 반환했습니다.");
    }
  } catch (err: unknown) {
    // OpenAI SDK 에러 (네트워크, 인증, 레이트 리밋 등)
    if (err instanceof OpenAI.APIError) {
      throw new Error(
        `[openrouter] API 오류 ${err.status}: ${err.message}`
      );
    }
    throw err;
  }

  // ── 4. JSON 파싱 및 검증 ───────────────────────────────────────────────────
  const parsed = safeParseJSON(rawContent);
  assertDiagnosisResult(parsed);

  return parsed;
}
