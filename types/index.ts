// 사용자 입력 - 스킬 진단 요청
export interface DiagnoseRequest {
  currentSkills: string;   // 현재 보유 스킬/경험
  targetRole: string;      // 목표 직무/역할
  timeframe?: string;      // 학습 기간 (선택)
}

// AI가 분석한 스킬 갭 항목
export interface SkillGap {
  skill: string;
  priority: "high" | "medium" | "low";
  reason: string;
}

// AI 진단 결과
export interface DiagnoseResult {
  summary: string;
  skillGaps: SkillGap[];
  recommendedTopics: string[];
}

// YouTube 영상 단일 항목
export interface VideoItem {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
  url: string;
}

// 커리큘럼 주차별 구성
export interface CurriculumWeek {
  week: number;
  topic: string;
  description: string;
  videos: VideoItem[];
}

// 최종 커리큘럼 결과
export interface CurriculumResult {
  targetRole: string;
  totalWeeks: number;
  curriculum: CurriculumWeek[];
}
