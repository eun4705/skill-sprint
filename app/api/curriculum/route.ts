/**
 * POST /api/curriculum
 *
 * 프론트엔드에서 전달받은 진단 결과의 search_queries와 available_minutes를 기반으로
 * YouTube 영상을 검색·필터링하고, 각 모듈에 시간을 배분한 최종 커리큘럼을 반환합니다.
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  Request Body                                           │
 * │  {                                                      │
 * │    search_queries:    SearchQueryItem[]   // 필수       │
 * │    available_minutes: number              // 필수       │
 * │    weekly_hours?:     number              // 선택       │
 * │  }                                                      │
 * │                                                         │
 * │  SearchQueryItem {                                      │
 * │    order:               number                          │
 * │    title:               string                          │
 * │    search_query:        string  (영문)                  │
 * │    estimated_minutes:   number                          │
 * │    difficulty:          beginner|intermediate|advanced  │
 * │    skill_gap_addressed: string                          │
 * │    learning_objective:  string                          │
 * │  }                                                      │
 * └─────────────────────────────────────────────────────────┘
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchYouTubeCurriculum, type VideoMetadata } from "@/lib/youtube";
import type { LearningModule } from "@/types/skillsprint";

// ─────────────────────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────────────────────

/** 프론트엔드가 전달하는 검색 쿼리 아이템 (LearningModule과 동일 형태) */
type SearchQueryItem = LearningModule;

interface CurriculumRequestBody {
  /** 진단 API(DiagnosisResult.curriculum)에서 받은 모듈 배열 */
  search_queries: SearchQueryItem[];
  /**
   * 유저의 총 가용 학습 시간 (단위: 분)
   * 예) 주 5시간 → 300
   * 이 값을 기준으로 각 모듈에 시간을 비례 배분합니다.
   */
  available_minutes: number;
  /** 주간 학습 가능 시간 (단위: 시간, 선택). 응답 메타에만 활용 */
  weekly_hours?: number;
}

/** 시간 배분이 완료된 최종 커리큘럼 아이템 */
interface CurriculumItem {
  order: number;
  title: string;
  skill_gap_addressed: string;
  learning_objective: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  search_query: string;
  /**
   * 이 모듈에 배분된 학습 시간 (단위: 분)
   * available_minutes를 각 모듈의 estimated_minutes 비율로 안분합니다.
   */
  allocated_minutes: number;
  video: VideoMetadata | null;
  video_candidates: VideoMetadata[];
  video_not_found: boolean;
}

interface CurriculumResponseMeta {
  total_modules: number;
  videos_found: number;
  videos_not_found: number;
  available_minutes: number;
  /** 배분된 시간의 합계 (분). 반올림 오차로 available_minutes와 ±1 차이 가능 */
  total_allocated_minutes: number;
  weekly_hours?: number;
  /** 완료까지 예상 주수. weekly_hours가 있을 때만 계산 */
  estimated_weeks?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 입력 검증
// ─────────────────────────────────────────────────────────────────────────────

type ValidationResult =
  | { ok: true; body: CurriculumRequestBody }
  | { ok: false; status: 400 | 422; error: string };

function isValidSearchQueryItem(item: unknown): item is SearchQueryItem {
  if (typeof item !== "object" || item === null) return false;
  const m = item as Record<string, unknown>;
  return (
    typeof m.order === "number" &&
    Number.isFinite(m.order) &&
    typeof m.title === "string" &&
    (m.title as string).trim().length > 0 &&
    typeof m.search_query === "string" &&
    (m.search_query as string).trim().length > 0 &&
    typeof m.estimated_minutes === "number" &&
    (m.estimated_minutes as number) > 0 &&
    typeof m.skill_gap_addressed === "string" &&
    typeof m.learning_objective === "string" &&
    ["beginner", "intermediate", "advanced"].includes(m.difficulty as string)
  );
}

function validateBody(raw: unknown): ValidationResult {
  if (typeof raw !== "object" || raw === null) {
    return {
      ok: false,
      status: 400,
      error: "요청 바디가 유효한 JSON 객체가 아닙니다.",
    };
  }

  const b = raw as Record<string, unknown>;

  // ── search_queries ─────────────────────────────────────────────────────────
  if (!Array.isArray(b.search_queries)) {
    return {
      ok: false,
      status: 422,
      error: "search_queries는 배열이어야 합니다.",
    };
  }
  if (b.search_queries.length === 0) {
    return {
      ok: false,
      status: 422,
      error: "search_queries 배열이 비어 있습니다.",
    };
  }
  if (b.search_queries.length > 10) {
    return {
      ok: false,
      status: 422,
      error: "search_queries는 최대 10개까지 허용됩니다.",
    };
  }
  for (let i = 0; i < b.search_queries.length; i++) {
    if (!isValidSearchQueryItem(b.search_queries[i])) {
      return {
        ok: false,
        status: 422,
        error:
          `search_queries[${i}]의 형식이 잘못되었습니다. ` +
          "필수 필드: order(number), title(string), search_query(string), " +
          "estimated_minutes(number > 0), skill_gap_addressed(string), " +
          "learning_objective(string), difficulty(beginner|intermediate|advanced)",
      };
    }
  }

  // ── available_minutes ──────────────────────────────────────────────────────
  const minutes = Number(b.available_minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return {
      ok: false,
      status: 422,
      error: "available_minutes는 0보다 큰 숫자여야 합니다.",
    };
  }
  // 상한: 52주 × 168시간 × 60분 = 약 1년치
  if (minutes > 524_160) {
    return {
      ok: false,
      status: 422,
      error: "available_minutes가 비현실적으로 큽니다 (최대 524,160분 = 1년).",
    };
  }

  // ── weekly_hours (선택) ────────────────────────────────────────────────────
  if (b.weekly_hours !== undefined) {
    const wh = Number(b.weekly_hours);
    if (!Number.isFinite(wh) || wh <= 0 || wh > 168) {
      return {
        ok: false,
        status: 422,
        error: "weekly_hours는 0초과 168 이하의 숫자여야 합니다.",
      };
    }
  }

  return {
    ok: true,
    body: {
      search_queries:    b.search_queries as SearchQueryItem[],
      available_minutes: minutes,
      weekly_hours:
        b.weekly_hours !== undefined ? Number(b.weekly_hours) : undefined,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 시간 배분 (Largest Remainder Method)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * allocateTime
 *
 * available_minutes를 각 모듈의 estimated_minutes 비율로 안분합니다.
 *
 * - 최소 1분 보장 (비율이 극단적으로 작은 모듈 방어)
 * - 반올림 오차는 소수점 크기 순으로 배분 (Largest Remainder Method)
 *   → 합계가 정확히 available_minutes와 일치
 */
function allocateTime(
  modules: SearchQueryItem[],
  availableMinutes: number
): number[] {
  const totalEstimated = modules.reduce(
    (sum, m) => sum + m.estimated_minutes,
    0
  );

  // estimated_minutes 합계가 0인 극단 케이스: 균등 분배
  if (totalEstimated === 0) {
    const equal = Math.floor(availableMinutes / modules.length);
    const remainder = availableMinutes - equal * modules.length;
    return modules.map((_, i) =>
      i === modules.length - 1 ? equal + remainder : equal
    );
  }

  // 비율 기반 raw 배분
  const rawAllocations = modules.map(
    (m) => (m.estimated_minutes / totalEstimated) * availableMinutes
  );

  // floor + 최솟값 1분 보장
  const floored = rawAllocations.map((v) => Math.max(1, Math.floor(v)));
  const flooredSum = floored.reduce((s, v) => s + v, 0);
  const remainder = availableMinutes - flooredSum;

  // 소수점 내림차순으로 나머지 1분씩 분배
  const withFrac = rawAllocations.map((v, i) => ({
    index: i,
    frac: v - Math.floor(v),
  }));
  withFrac.sort((a, b) => b.frac - a.frac);

  const result = [...floored];
  const toDistribute = Math.max(0, remainder);
  for (let i = 0; i < toDistribute && i < withFrac.length; i++) {
    result[withFrac[i].index] += 1;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/curriculum
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {

  // ── Step 0. 환경 변수 사전 확인 ──────────────────────────────────────────
  if (!process.env.YOUTUBE_API_KEY) {
    console.error("[/api/curriculum] YOUTUBE_API_KEY 환경 변수 누락");
    return NextResponse.json(
      {
        success: false,
        error: "서버 설정 오류: YOUTUBE_API_KEY가 설정되지 않았습니다.",
        code: "MISSING_ENV",
      },
      { status: 500 }
    );
  }

  // ── Step 1. 요청 바디 파싱 ───────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          "요청 바디를 JSON으로 파싱할 수 없습니다. " +
          "Content-Type: application/json 헤더를 확인하세요.",
        code: "INVALID_JSON",
      },
      { status: 400 }
    );
  }

  // ── Step 2. 입력 검증 ────────────────────────────────────────────────────
  const validation = validateBody(rawBody);
  if (!validation.ok) {
    return NextResponse.json(
      { success: false, error: validation.error, code: "VALIDATION_ERROR" },
      { status: validation.status }
    );
  }

  const { search_queries, available_minutes, weekly_hours } = validation.body;

  // ── Step 3. order 기준 정렬 (클라이언트가 순서를 보장하지 않을 수 있음) ─
  const sortedModules = [...search_queries].sort((a, b) => a.order - b.order);

  // ── Step 4. 시간 배분 계산 ───────────────────────────────────────────────
  const allocations = allocateTime(sortedModules, available_minutes);

  // ── Step 5. YouTube 영상 검색 ────────────────────────────────────────────
  let youtubeResults: Awaited<ReturnType<typeof fetchYouTubeCurriculum>>;
  try {
    youtubeResults = await fetchYouTubeCurriculum(
      sortedModules,
      process.env.YOUTUBE_API_KEY
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const lowerMsg = message.toLowerCase();

    // 쿼터 초과 (403)
    if (message.includes("403") || lowerMsg.includes("quota")) {
      console.error("[/api/curriculum] YouTube 쿼터 초과:", message);
      return NextResponse.json(
        {
          success: false,
          error:
            "YouTube API 일일 쿼터를 초과했습니다. " +
            "잠시 후 다시 시도해 주세요.",
          code: "YOUTUBE_QUOTA_EXCEEDED",
        },
        { status: 429 }
      );
    }

    // 인증 오류 (401)
    if (message.includes("401") || lowerMsg.includes("unauthorized")) {
      console.error("[/api/curriculum] YouTube 인증 오류:", message);
      return NextResponse.json(
        {
          success: false,
          error: "YouTube API 인증에 실패했습니다. 서버 관리자에게 문의하세요.",
          code: "YOUTUBE_AUTH_ERROR",
        },
        { status: 502 }
      );
    }

    // 네트워크/타임아웃 등 기타 업스트림 오류
    console.error("[/api/curriculum] YouTube API 호출 실패:", message);
    return NextResponse.json(
      {
        success: false,
        error:
          "YouTube 영상 검색 중 오류가 발생했습니다. " +
          "잠시 후 다시 시도해 주세요.",
        code: "YOUTUBE_FETCH_ERROR",
      },
      { status: 502 }
    );
  }

  // ── Step 6. 시간 배분 + YouTube 결과 병합 ───────────────────────────────
  const curriculum: CurriculumItem[] = youtubeResults.map((result, idx) => ({
    order:               result.module.order,
    title:               result.module.title,
    skill_gap_addressed: result.module.skill_gap_addressed,
    learning_objective:  result.module.learning_objective,
    difficulty:          result.module.difficulty,
    search_query:        result.searchQuery,
    allocated_minutes:   allocations[idx],
    video:               result.video,
    video_candidates:    result.videos ?? [],
    video_not_found:     result.video === null,
  }));

  // ── Step 7. 메타데이터 집계 ──────────────────────────────────────────────
  const videosFound    = curriculum.filter((c) => !c.video_not_found).length;
  const videosNotFound = curriculum.length - videosFound;
  const totalAllocated = curriculum.reduce(
    (s, c) => s + c.allocated_minutes,
    0
  );

  const meta: CurriculumResponseMeta = {
    total_modules:           curriculum.length,
    videos_found:            videosFound,
    videos_not_found:        videosNotFound,
    available_minutes,
    total_allocated_minutes: totalAllocated,
  };

  if (weekly_hours !== undefined) {
    meta.weekly_hours    = weekly_hours;
    meta.estimated_weeks = Math.ceil(available_minutes / (weekly_hours * 60));
  }

  // 영상 미발견 경고 로그 (에러는 아님 — 부분 성공 허용)
  if (videosNotFound > 0) {
    console.warn(
      `[/api/curriculum] ${curriculum.length}개 모듈 중 ${videosNotFound}개 영상 미발견. ` +
        `쿼리: ${curriculum
          .filter((c) => c.video_not_found)
          .map((c) => `"${c.search_query}"`)
          .join(", ")}`
    );
  }

  // ── Step 8. 최종 응답 ────────────────────────────────────────────────────
  return NextResponse.json(
    { success: true, data: curriculum, meta },
    { status: 200 }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/curriculum — 헬스 체크 & API 스펙 문서
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json(
    {
      status:   "ok",
      endpoint: "POST /api/curriculum",
      required_fields: {
        search_queries:
          "SearchQueryItem[]  — 진단 API의 curriculum 배열을 그대로 전달",
        available_minutes:
          "number             — 총 가용 학습 시간 (분 단위, 예: 주 5시간 → 300)",
      },
      optional_fields: {
        weekly_hours:
          "number — 주간 학습 시간 (시간). 입력 시 meta.estimated_weeks 계산",
      },
      search_query_item_shape: {
        order:               "number",
        title:               "string",
        search_query:        "string (영문 권장)",
        estimated_minutes:   "number (> 0)",
        difficulty:          "beginner | intermediate | advanced",
        skill_gap_addressed: "string",
        learning_objective:  "string",
      },
      response_shape: {
        success: "boolean",
        data: "CurriculumItem[]",
        "data[].order":               "number",
        "data[].title":               "string",
        "data[].allocated_minutes":   "number — 비례 배분된 학습 시간 (분)",
        "data[].video":               "VideoMetadata | null",
        "data[].video_not_found":     "boolean",
        meta: {
          total_modules:           "number",
          videos_found:            "number",
          videos_not_found:        "number",
          available_minutes:       "number",
          total_allocated_minutes: "number",
          weekly_hours:            "number? (optional)",
          estimated_weeks:         "number? (optional)",
        },
      },
    },
    { status: 200 }
  );
}
