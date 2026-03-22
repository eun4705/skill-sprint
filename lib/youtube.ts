// lib/youtube.ts

import type { LearningModule } from "@/types/skillsprint";

// ─── 타입 정의 ─────────────────────────────────────────────

export interface VideoMetadata {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;         // ISO 8601
  viewCount: number;
  likeCount: number;
  likeRatio: number;           // likeCount / viewCount
  durationSeconds: number;
  thumbnailUrl: string;
  videoUrl: string;
}

export interface CurriculumVideo {
  module: LearningModule;
  video: VideoMetadata | null;  // null = 조건을 만족하는 영상 없음
  videos: VideoMetadata[];      // 상위 3개 후보 (교체용)
  searchQuery: string;
}

// ─── 필터 기준 상수 ────────────────────────────────────────

const FILTER_CONFIG = {
  MAX_AGE_DAYS: 1_095,          // 최근 3년 이내 (니치 분야 커버)
  MIN_LIKE_RATIO: 0.01,         // 좋아요 비율 1% 이상 (전문 분야 완화)
  MIN_VIEW_COUNT: 300,          // 최소 조회수 완화 (전문 분야 커버)
  MAX_DURATION_SECONDS: 3_600,  // 최대 60분
  MIN_DURATION_SECONDS: 300,    // 최소 5분 (shorts 제외)
  SEARCH_RESULTS_PER_QUERY: 20, // 후보군 확대
} as const;

// ─── 유틸리티 ──────────────────────────────────────────────

/** ISO 8601 duration (PT15M33S) → 초 변환 */
function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const [, h = "0", m = "0", s = "0"] = match;
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s);
}

/** 업로드일이 기준일 이내인지 확인 */
function isWithinDays(publishedAt: string, days: number): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return new Date(publishedAt) >= cutoff;
}

/** 좋아요 비율 계산 (viewCount 0 가드 포함) */
function calcLikeRatio(likeCount: number, viewCount: number): number {
  if (viewCount === 0) return 0;
  return likeCount / viewCount;
}

// ─── YouTube API 호출 레이어 ───────────────────────────────

/**
 * YouTube Data API v3 - search.list 호출
 * 반환: videoId 목록
 */
async function searchVideoIds(
  query: string,
  apiKey: string,
  maxResults: number = FILTER_CONFIG.SEARCH_RESULTS_PER_QUERY
): Promise<string[]> {
  // 최근 1년 기준 publishedAfter 계산
  const publishedAfter = new Date();
  publishedAfter.setDate(publishedAfter.getDate() - FILTER_CONFIG.MAX_AGE_DAYS);

  const params = new URLSearchParams({
    part: "id",
    q: query,
    type: "video",
    videoEmbeddable: "true",
    publishedAfter: publishedAfter.toISOString(),
    maxResults: String(maxResults),
    key: apiKey,
  });

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params}`
  );

  if (!res.ok) {
    throw new Error(`YouTube search failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return (data.items ?? []).map((item: any) => item.id.videoId as string);
}

/**
 * YouTube Data API v3 - videos.list 호출
 * 반환: 상세 메타데이터 배열
 */
async function fetchVideoDetails(
  videoIds: string[],
  apiKey: string
): Promise<VideoMetadata[]> {
  if (videoIds.length === 0) return [];

  const params = new URLSearchParams({
    part: "snippet,statistics,contentDetails",
    id: videoIds.join(","),
    key: apiKey,
  });

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?${params}`
  );

  if (!res.ok) {
    throw new Error(`YouTube videos.list failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  return (data.items ?? []).map((item: any): VideoMetadata => {
    const stats = item.statistics ?? {};
    const viewCount = parseInt(stats.viewCount ?? "0");
    const likeCount = parseInt(stats.likeCount ?? "0");

    return {
      videoId:        item.id,
      title:          item.snippet.title,
      channelTitle:   item.snippet.channelTitle,
      publishedAt:    item.snippet.publishedAt,
      viewCount,
      likeCount,
      likeRatio:      calcLikeRatio(likeCount, viewCount),
      durationSeconds: parseDuration(item.contentDetails.duration),
      thumbnailUrl:   item.snippet.thumbnails?.high?.url ?? "",
      videoUrl:       `https://www.youtube.com/watch?v=${item.id}`,
    };
  });
}

/**
 * 메타데이터 기반 필터링 + 스코어링
 *
 * 점수 공식: (likeRatio × 50) + (log10(viewCount) × 10) - recencyPenalty
 * → 좋아요 비율 가중치 최대, 조회수는 로그 스케일, 오래된 영상은 소폭 감점
 */
function filterAndRankVideos(videos: VideoMetadata[]): VideoMetadata[] {
  const now = Date.now();

  return videos
    .filter((v) => {
      const ageOk    = isWithinDays(v.publishedAt, FILTER_CONFIG.MAX_AGE_DAYS);
      const ratioOk  = v.likeRatio >= FILTER_CONFIG.MIN_LIKE_RATIO;
      const viewsOk  = v.viewCount >= FILTER_CONFIG.MIN_VIEW_COUNT;
      const durOk    =
        v.durationSeconds >= FILTER_CONFIG.MIN_DURATION_SECONDS &&
        v.durationSeconds <= FILTER_CONFIG.MAX_DURATION_SECONDS;
      return ageOk && ratioOk && viewsOk && durOk;
    })
    .sort((a, b) => {
      const score = (v: VideoMetadata) => {
        const ageDays = (now - new Date(v.publishedAt).getTime()) / 86_400_000;
        const recencyPenalty = (ageDays / FILTER_CONFIG.MAX_AGE_DAYS) * 5;
        return (
          v.likeRatio * 50 +
          Math.log10(Math.max(v.viewCount, 1)) * 10 -
          recencyPenalty
        );
      };
      return score(b) - score(a);
    });
}

// ─── 툴 핸들러용 단일 쿼리 함수 ────────────────────────────

/**
 * searchYouTubeForTool
 *
 * Function Calling 툴 핸들러에서 호출하는 단일 쿼리 함수.
 * 검색 → 상세조회 → 필터/랭킹 파이프라인을 실행하고 상위 3개를 반환합니다.
 */
export async function searchYouTubeForTool(
  query: string,
  apiKey: string
): Promise<VideoMetadata[]> {
  const videoIds = await searchVideoIds(query, apiKey);
  const rawVideos = await fetchVideoDetails(videoIds, apiKey);
  return filterAndRankVideos(rawVideos).slice(0, 3);
}

// ─── 메인 함수 ─────────────────────────────────────────────

/**
 * fetchYouTubeCurriculum
 *
 * LLM이 생성한 커리큘럼 모듈 배열을 받아,
 * 각 모듈에 대해 YouTube에서 최적의 영상을 찾아 반환합니다.
 *
 * @param modules  DiagnosisResult.curriculum
 * @param apiKey   YouTube Data API v3 키
 * @returns        모듈-영상 매핑 배열
 */
export async function fetchYouTubeCurriculum(
  modules: LearningModule[],
  apiKey: string
): Promise<CurriculumVideo[]> {
  // 모든 모듈을 병렬 처리 (API quota 절약을 위해 순차 처리도 가능)
  const results = await Promise.allSettled(
    modules.map(async (module): Promise<CurriculumVideo> => {
      // 1단계: 검색 (videoId 목록)
      const videoIds = await searchVideoIds(module.search_query, apiKey);

      // 2단계: 상세 메타데이터 fetch
      const rawVideos = await fetchVideoDetails(videoIds, apiKey);

      // 3단계: 필터링 + 랭킹
      const ranked = filterAndRankVideos(rawVideos);

      return {
        module,
        video:       ranked[0] ?? null, // 최상위 영상 or null
        videos:      ranked.slice(0, 3), // 상위 3개 후보
        searchQuery: module.search_query,
      };
    })
  );

  // fulfilled / rejected 분리 처리
  return results.map((result, idx): CurriculumVideo => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    // 실패 시 fallback: 영상 없이 모듈 정보만 반환
    console.error(
      `[SkillSprint] Module "${modules[idx].title}" video fetch failed:`,
      result.reason
    );
    return {
      module:      modules[idx],
      video:       null,
      videos:      [],
      searchQuery: modules[idx].search_query,
    };
  });
}
