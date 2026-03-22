"use client";

import { useState } from "react";
import type { LearningModule } from "@/types/skillsprint";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SkillGap {
  label: string;
  level: number; // 0~100: 현재 보유 수준 (낮을수록 갭이 큼)
}

interface DiagnoseResponse {
  gap_summary: string;
  skills: SkillGap[];
  estimated_weeks: number;
  modules: LearningModule[];     // 커리큘럼 API에 전달할 전체 모듈 객체
  available_minutes: number;     // 주간 학습 가용 시간 (분)
  weekly_hours: number;          // 주간 학습 가용 시간 (시간)
}

interface VideoItem {
  title: string;
  channel: string;
  duration: string;         // 예: "1:42:30"
  thumbnail: string;        // 유튜브 썸네일 URL
  video_url: string;        // 유튜브 영상 링크
  description: string;      // 영상 설명 한 줄
  tag: string;              // 예: "필수" | "핵심" | "실전" | "심화"
}

interface CurriculumResponse {
  videos: VideoItem[];
}

// 최종적으로 결과 화면에 넘기는 합산 데이터 구조
interface ResultData {
  diagnosis: DiagnoseResponse;
  curriculum: CurriculumResponse;
}

// 폼에서 수집하는 유저 입력값
interface FormValues {
  skills: string;
  goal: string;
  time: string;
}

// ─── Conversion Helpers ───────────────────────────────────────────────────────

/**
 * 자유 텍스트 시간 입력 → 주간 시간(number) 변환
 * 예: "하루 2시간" → 14, "주 15시간" → 15, 파싱 불가 → 10 (기본값)
 */
function parseWeeklyHours(timeStr: string): number {
  const daily = timeStr.match(/하루\s*(\d+(?:\.\d+)?)\s*시간/);
  if (daily) return Math.min(168, parseFloat(daily[1]) * 7);

  const weekly = timeStr.match(/주\s*(\d+(?:\.\d+)?)\s*시간/);
  if (weekly) return Math.min(168, parseFloat(weekly[1]));

  const plain = timeStr.match(/(\d+(?:\.\d+)?)\s*시간/);
  if (plain) return Math.min(168, parseFloat(plain[1]));

  return 10; // 파싱 실패 시 기본값
}

/** durationSeconds → "H:MM:SS" 또는 "M:SS" 포맷 */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** difficulty → 한국어 태그 */
const DIFFICULTY_TAG: Record<string, string> = {
  beginner: "필수",
  intermediate: "핵심",
  advanced: "심화",
};

// ─── API Helpers ──────────────────────────────────────────────────────────────

async function fetchDiagnosis(form: FormValues): Promise<DiagnoseResponse> {
  const weeklyHours = parseWeeklyHours(form.time);

  const res = await fetch("/api/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      currentSkills: form.skills,
      targetRole: form.goal,
      weeklyHours,
      additionalContext: form.time, // 원문 그대로 AI에게 전달
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`/api/diagnose 오류 (${res.status}): ${errorBody}`);
  }

  const json = await res.json();
  // 백엔드 응답: { success: true, data: DiagnosisResult }
  if (!json.success) {
    throw new Error(json.error ?? "/api/diagnose 알 수 없는 오류");
  }

  const d = json.data;

  // DiagnosisResult → DiagnoseResponse 변환
  return {
    gap_summary: d.summary,
    skills: (d.skill_gaps ?? []).map((g: any) => ({
      label: g.skill_name,
      // severity(1~10, 높을수록 심각) → level(0~100, 낮을수록 갭이 큼)
      level: Math.max(5, (10 - g.severity) * 10),
    })),
    estimated_weeks: d.estimated_weeks_to_ready,
    modules: d.curriculum ?? [],          // LearningModule[] 그대로 보존
    available_minutes: Math.round(d.weekly_hours_available * 60),
    weekly_hours: d.weekly_hours_available,
  };
}

async function fetchCurriculum(
  modules: LearningModule[],
  availableMinutes: number,
  weeklyHours?: number
): Promise<CurriculumResponse> {
  const res = await fetch("/api/curriculum", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      search_queries: modules,       // LearningModule[] 전체 전달
      available_minutes: availableMinutes,
      weekly_hours: weeklyHours,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`/api/curriculum 오류 (${res.status}): ${errorBody}`);
  }

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error ?? "/api/curriculum 알 수 없는 오류");
  }

  // 백엔드 응답: { success: true, data: CurriculumItem[], meta }
  // CurriculumItem → VideoItem 변환 (video가 null인 항목은 제외)
  const videos: VideoItem[] = (json.data ?? [])
    .filter((item: any) => !item.video_not_found && item.video)
    .map((item: any) => ({
      title: item.video.title,
      channel: item.video.channelTitle,
      duration: formatDuration(item.video.durationSeconds),
      thumbnail: item.video.thumbnailUrl,
      video_url: item.video.videoUrl,
      description: item.learning_objective,
      tag: DIFFICULTY_TAG[item.difficulty] ?? "핵심",
    }));

  return { videos };
}

// ─── Tag Color Map ────────────────────────────────────────────────────────────
const TAG_COLORS: Record<string, string> = {
  필수: "bg-rose-100 text-rose-700",
  핵심: "bg-amber-100 text-amber-700",
  실전: "bg-sky-100 text-sky-700",
  심화: "bg-emerald-100 text-emerald-700",
};

function tagColor(tag: string): string {
  return TAG_COLORS[tag] ?? "bg-[#1A1A1A]/8 text-[#1A1A1A]/60";
}

// ─── Loading Screen ───────────────────────────────────────────────────────────

function LoadingScreen({ loadingStep }: { loadingStep: number }) {
  const steps = [
    "역량 프로파일 분석 중…",
    "스킬 갭 진단 중…",
    "최적 학습 경로 설계 중…",
    "유튜브 커리큘럼 구성 중…",
  ];

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center px-4">
      <div className="text-center max-w-sm w-full">

        {/* Animated logo mark */}
        <div className="relative w-20 h-20 mx-auto mb-10">
          <div className="absolute inset-0 rounded-full border-4 border-[#1A1A1A]/10" />
          <div
            className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#1A1A1A]"
            style={{ animation: "spin 1s linear infinite" }}
          />
          <div className="absolute inset-3 rounded-full bg-[#1A1A1A] flex items-center justify-center">
            <span
              className="text-[#F5F0E8] text-xl font-bold"
              style={{ fontFamily: "'Georgia', serif" }}
            >
              S
            </span>
          </div>
        </div>

        <h2
          className="text-[#1A1A1A] text-2xl font-semibold mb-2"
          style={{ fontFamily: "'Georgia', serif" }}
        >
          AI가 분석하고 있어요
        </h2>
        <p className="text-[#1A1A1A]/50 text-sm mb-10">
          맞춤 커리큘럼을 설계하는 중입니다
        </p>

        <div className="space-y-3 text-left">
          {steps.map((label, i) => {
            const isDone = i < loadingStep;
            const isActive = i === loadingStep;
            return (
              <div
                key={i}
                className="flex items-center gap-3 transition-opacity duration-500"
                style={{ opacity: i <= loadingStep ? 1 : 0.25 }}
              >
                <div
                  className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center transition-colors duration-300 ${
                    isDone
                      ? "bg-[#1A1A1A]"
                      : isActive
                      ? "border-2 border-[#1A1A1A] bg-transparent"
                      : "border border-[#1A1A1A]/20 bg-transparent"
                  }`}
                >
                  {isDone && (
                    <svg
                      className="w-2.5 h-2.5 text-[#F5F0E8]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                  {isActive && (
                    <div
                      className="w-2 h-2 rounded-full bg-[#1A1A1A]"
                      style={{ animation: "pulse 1s ease-in-out infinite" }}
                    />
                  )}
                </div>
                <span
                  className={`text-sm transition-colors duration-300 ${
                    isDone
                      ? "text-[#1A1A1A]/40 line-through"
                      : isActive
                      ? "text-[#1A1A1A] font-medium"
                      : "text-[#1A1A1A]/30"
                  }`}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(0.6); opacity: 0.5; }
          }
        `}</style>
      </div>
    </div>
  );
}

// ─── Error Screen ─────────────────────────────────────────────────────────────

function ErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center px-4">
      <div className="text-center max-w-sm w-full">
        <span className="text-5xl mb-6 block">⚠️</span>
        <h2
          className="text-[#1A1A1A] text-2xl font-semibold mb-3"
          style={{ fontFamily: "'Georgia', serif" }}
        >
          분석 중 오류가 발생했어요
        </h2>
        <p className="text-[#1A1A1A]/50 text-sm mb-2 leading-relaxed">
          잠시 후 다시 시도해주세요.
        </p>
        {process.env.NODE_ENV === "development" && (
          <p className="text-rose-500/70 text-xs font-mono bg-rose-50 border border-rose-100 rounded-xl p-3 mb-8 text-left break-all">
            {message}
          </p>
        )}
        <button
          onClick={onRetry}
          className="bg-[#1A1A1A] text-[#F5F0E8] px-8 py-3 rounded-full text-sm font-medium hover:bg-[#333] transition-all hover:scale-105 active:scale-95"
        >
          다시 시도하기
        </button>
      </div>
    </div>
  );
}

// ─── Input Form ───────────────────────────────────────────────────────────────

interface InputFormProps {
  onSubmit: (values: FormValues) => void;
}

function InputForm({ onSubmit }: InputFormProps) {
  const [step, setStep] = useState(1);
  const [values, setValues] = useState<FormValues>({
    skills: "",
    goal: "",
    time: "",
  });

  const STEPS = [
    {
      id: "skills" as const,
      label: "현재 보유 역량",
      placeholder: "예: HTML/CSS 기초, 악보 읽기 가능, 영어 중급, 건축 AutoCAD 입문",
      hint: "현재 알고 있는 기술, 지식, 경험을 분야 상관없이 자유롭게 적어주세요",
      icon: "🧠",
    },
    {
      id: "goal" as const,
      label: "목표 직무 / 프로젝트",
      placeholder: "예: 프론트엔드 개발자 취업, 재즈 피아노 연주, JLPT N2 합격, 실내건축 설계",
      hint: "이루고 싶은 목표를 분야 상관없이 구체적으로 적어주세요",
      icon: "🎯",
    },
    {
      id: "time" as const,
      label: "투자 가능한 시간",
      placeholder: "예: 하루 2시간, 주 15시간, 3개월간 집중 투자",
      hint: "현실적으로 학습에 쓸 수 있는 시간을 알려주세요",
      icon: "⏱️",
    },
  ] as const;

  const current = STEPS[step - 1];
  const isLastStep = step === 3;
  const canProceed = values[current.id].trim().length > 0;

  const handleNext = () => {
    if (isLastStep) {
      onSubmit(values);
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canProceed) {
      handleNext();
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex flex-col">

      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between border-b border-[#1A1A1A]/10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#1A1A1A] flex items-center justify-center">
            <span
              className="text-[#F5F0E8] text-xs font-bold"
              style={{ fontFamily: "'Georgia', serif" }}
            >
              S
            </span>
          </div>
          <span
            className="text-[#1A1A1A] font-semibold text-sm tracking-wide"
            style={{ fontFamily: "'Georgia', serif" }}
          >
            SKILL SPRINT
          </span>
        </div>
        <span className="text-[#1A1A1A]/40 text-xs font-mono">{step} / 3</span>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">

          {/* Progress bar */}
          <div className="flex gap-1.5 mb-12">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className="h-1 flex-1 rounded-full transition-all duration-500"
                style={{
                  background:
                    s <= step ? "#1A1A1A" : "rgba(26,26,26,0.12)",
                }}
              />
            ))}
          </div>

          {/* Step content */}
          <span className="text-4xl mb-4 block">{current.icon}</span>
          <h1
            className="text-[#1A1A1A] text-3xl font-bold mb-2"
            style={{ fontFamily: "'Georgia', serif" }}
          >
            {current.label}
          </h1>
          <p className="text-[#1A1A1A]/50 text-sm mb-6">{current.hint}</p>

          <textarea
            key={current.id}
            className="w-full h-36 bg-white/70 border border-[#1A1A1A]/15 rounded-2xl p-4 text-[#1A1A1A] placeholder-[#1A1A1A]/30 text-sm resize-none outline-none focus:border-[#1A1A1A]/40 focus:ring-2 focus:ring-[#1A1A1A]/8 transition-all"
            placeholder={current.placeholder}
            value={values[current.id]}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, [current.id]: e.target.value }))
            }
            onKeyDown={handleKeyDown}
            autoFocus
          />

          <p className="text-[#1A1A1A]/25 text-xs mt-2 text-right">
            {isLastStep ? "⌘ + Enter로 생성" : "⌘ + Enter로 다음 단계"}
          </p>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-5">
            {step > 1 ? (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="text-[#1A1A1A]/50 text-sm hover:text-[#1A1A1A] transition-colors flex items-center gap-1"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                이전
              </button>
            ) : (
              <div />
            )}

            <button
              onClick={handleNext}
              disabled={!canProceed}
              className="bg-[#1A1A1A] text-[#F5F0E8] px-8 py-3 rounded-full text-sm font-medium hover:bg-[#333] disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95"
            >
              {isLastStep ? "🚀 커리큘럼 생성하기" : "다음 →"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Result Dashboard ─────────────────────────────────────────────────────────

interface ResultDashboardProps {
  data: ResultData;
  onReset: () => void;
}

function ResultDashboard({ data, onReset }: ResultDashboardProps) {
  const { diagnosis, curriculum } = data;

  const handleSave = () => {
    const lines = [
      "===== SKILL SPRINT 커리큘럼 =====",
      "",
      "[ AI 진단 요약 ]",
      diagnosis.gap_summary,
      "",
      `예상 완성 기간: 약 ${diagnosis.estimated_weeks}주`,
      "",
      "[ 보충 필요 역량 ]",
      ...diagnosis.skills.map((s) => `• ${s.label} (현재 수준 ${s.level}%)`),
      "",
      "[ 추천 커리큘럼 ]",
      ...curriculum.videos.map(
        (v, i) =>
          `Step ${i + 1}. ${v.title}\n   채널: ${v.channel} | 길이: ${v.duration} | 태그: ${v.tag}\n   ${v.video_url}`
      ),
      "",
      "SKILL SPRINT · AI 기반 맞춤 학습 설계",
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "skill-sprint-curriculum.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8]">

      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between border-b border-[#1A1A1A]/10 sticky top-0 bg-[#F5F0E8]/90 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#1A1A1A] flex items-center justify-center">
            <span
              className="text-[#F5F0E8] text-xs font-bold"
              style={{ fontFamily: "'Georgia', serif" }}
            >
              S
            </span>
          </div>
          <span
            className="text-[#1A1A1A] font-semibold text-sm tracking-wide"
            style={{ fontFamily: "'Georgia', serif" }}
          >
            SKILL SPRINT
          </span>
        </div>
        <button
          onClick={onReset}
          className="text-[#1A1A1A]/50 text-xs hover:text-[#1A1A1A] transition-colors border border-[#1A1A1A]/20 px-3 py-1.5 rounded-full"
        >
          다시 분석하기
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">

        {/* Hero */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 bg-[#1A1A1A] text-[#F5F0E8] text-xs px-3 py-1.5 rounded-full mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            분석 완료
          </div>
          <h1
            className="text-[#1A1A1A] text-4xl md:text-5xl font-bold leading-tight"
            style={{ fontFamily: "'Georgia', serif" }}
          >
            당신의 스킬 갭
            <br />
            <span className="text-[#1A1A1A]/40">진단 결과입니다</span>
          </h1>
        </div>

        {/* ── Diagnosis Card ── */}
        <div className="bg-white/60 border border-[#1A1A1A]/8 rounded-3xl p-6 md:p-8 mb-4">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-[#1A1A1A] flex items-center justify-center flex-shrink-0">
              <span className="text-lg">🔍</span>
            </div>
            <div>
              <h2
                className="text-[#1A1A1A] font-bold text-lg mb-1"
                style={{ fontFamily: "'Georgia', serif" }}
              >
                AI 스킬 갭 진단
              </h2>
              <p className="text-[#1A1A1A]/60 text-sm leading-relaxed">
                {diagnosis.gap_summary}
              </p>
            </div>
          </div>

          {diagnosis.skills.length > 0 && (
            <div className="space-y-3">
              <p className="text-[#1A1A1A]/40 text-xs font-mono uppercase tracking-widest mb-4">
                보충 필요 역량
              </p>
              {diagnosis.skills.map((s) => (
                <div key={s.label}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[#1A1A1A] text-sm font-medium">
                      {s.label}
                    </span>
                    <span className="text-[#1A1A1A]/40 text-xs font-mono">
                      {s.level}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#1A1A1A]/8 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#1A1A1A] rounded-full transition-all duration-700"
                      style={{ width: `${s.level}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-[#1A1A1A]/8 flex items-center gap-3">
            <span className="text-2xl">📅</span>
            <p className="text-[#1A1A1A]/60 text-sm">
              투자 시간 기준으로{" "}
              <strong className="text-[#1A1A1A]">
                약 {diagnosis.estimated_weeks}주
              </strong>{" "}
              내 목표 달성이 가능합니다
            </p>
          </div>
        </div>

        {/* ── Curriculum Section ── */}
        <div className="flex items-center justify-between px-1 mt-10 mb-5">
          <h2
            className="text-[#1A1A1A] font-bold text-xl"
            style={{ fontFamily: "'Georgia', serif" }}
          >
            추천 커리큘럼
          </h2>
          <span className="text-[#1A1A1A]/40 text-xs font-mono">
            {curriculum.videos.length}개의 강의
          </span>
        </div>

        <div className="relative">
          <div className="absolute left-[22px] top-8 bottom-8 w-px bg-[#1A1A1A]/10 hidden md:block" />

          <div className="space-y-4">
            {curriculum.videos.map((video, i) => (
              <a
                key={i}
                href={video.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-4 group no-underline"
                style={{
                  animation: "fadeUp 0.5s ease forwards",
                  animationDelay: `${i * 0.08}s`,
                  opacity: 0,
                }}
              >
                <div className="flex-shrink-0 w-11 h-11 rounded-full bg-[#1A1A1A] text-[#F5F0E8] flex items-center justify-center text-sm font-bold z-10 relative hidden md:flex">
                  {i + 1}
                </div>

                <div className="flex-1 bg-white/60 hover:bg-white/90 border border-[#1A1A1A]/8 hover:border-[#1A1A1A]/20 rounded-2xl overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1A1A1A]/8">
                  <div className="flex">

                    {/* Thumbnail */}
                    <div className="w-32 md:w-44 flex-shrink-0 relative bg-[#1A1A1A]/5 aspect-video">
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='176' height='99' viewBox='0 0 176 99'%3E%3Crect fill='%231A1A1A' opacity='0.08' width='176' height='99'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%231A1A1A' opacity='0.3' font-size='28'%3E%E2%96%B6%3C/text%3E%3C/svg%3E";
                        }}
                      />
                      <div className="absolute inset-0 bg-[#1A1A1A]/0 group-hover:bg-[#1A1A1A]/20 transition-all flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100">
                          <svg
                            className="w-3 h-3 text-[#1A1A1A] ml-0.5"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                      <div className="absolute bottom-1.5 right-1.5 bg-[#1A1A1A]/80 text-[#F5F0E8] text-xs px-1.5 py-0.5 rounded font-mono">
                        {video.duration}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-4">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-[#1A1A1A]/30 text-xs font-mono hidden md:inline">
                          Step {i + 1}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${tagColor(
                            video.tag
                          )}`}
                        >
                          {video.tag}
                        </span>
                      </div>

                      <h3
                        className="text-[#1A1A1A] font-semibold text-sm md:text-base leading-snug mb-1.5"
                        style={{ fontFamily: "'Georgia', serif" }}
                      >
                        {video.title}
                      </h3>
                      <p className="text-[#1A1A1A]/50 text-xs leading-relaxed mb-3 hidden md:block">
                        {video.description}
                      </p>

                      <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full bg-rose-500 flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-2.5 h-2.5 text-white"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                          </svg>
                        </div>
                        <span className="text-[#1A1A1A]/40 text-xs">
                          {video.channel}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* CTA Block */}
        <div className="mt-12 bg-[#1A1A1A] rounded-3xl p-8 text-center">
          <span className="text-4xl mb-4 block">🏁</span>
          <h3
            className="text-[#F5F0E8] text-xl font-bold mb-2"
            style={{ fontFamily: "'Georgia', serif" }}
          >
            커리큘럼이 준비됐어요
          </h3>
          <p className="text-[#F5F0E8]/50 text-sm mb-6">
            지금 바로 학습을 시작하거나, 커리큘럼을 저장해두세요
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={handleSave}
              className="bg-[#F5F0E8] text-[#1A1A1A] px-6 py-3 rounded-full text-sm font-medium hover:bg-white transition-all hover:scale-105"
            >
              📋 커리큘럼 저장하기
            </button>
            <button
              onClick={onReset}
              className="border border-[#F5F0E8]/20 text-[#F5F0E8]/70 px-6 py-3 rounded-full text-sm hover:border-[#F5F0E8]/40 hover:text-[#F5F0E8] transition-all"
            >
              다시 분석하기
            </button>
          </div>
        </div>

        <p className="text-center text-[#1A1A1A]/25 text-xs mt-8 pb-8">
          SKILL SPRINT · AI 기반 맞춤 학습 설계
        </p>
      </main>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Screen = "form" | "loading" | "result" | "error";

export default function SkillSprintPage() {
  const [screen, setScreen] = useState<Screen>("form");
  const [loadingStep, setLoadingStep] = useState(0);
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const handleFormSubmit = async (formValues: FormValues) => {
    setScreen("loading");
    setLoadingStep(0);

    try {
      // Step 0~1: 역량 프로파일 분석 + 스킬 갭 진단
      setLoadingStep(0);
      const diagnosis = await fetchDiagnosis(formValues);

      // Step 2: 최적 학습 경로 설계
      setLoadingStep(2);
      const curriculum = await fetchCurriculum(
        diagnosis.modules,
        diagnosis.available_minutes,
        diagnosis.weekly_hours
      );

      // Step 3: 유튜브 커리큘럼 구성 완료
      setLoadingStep(3);

      await new Promise((resolve) => setTimeout(resolve, 400));

      setResultData({ diagnosis, curriculum });
      setScreen("result");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
      setErrorMessage(message);
      setScreen("error");
    }
  };

  const handleReset = () => {
    setScreen("form");
    setResultData(null);
    setErrorMessage("");
    setLoadingStep(0);
  };

  if (screen === "loading") return <LoadingScreen loadingStep={loadingStep} />;
  if (screen === "error") return <ErrorScreen message={errorMessage} onRetry={handleReset} />;
  if (screen === "result" && resultData) return <ResultDashboard data={resultData} onReset={handleReset} />;

  return <InputForm onSubmit={handleFormSubmit} />;
}
