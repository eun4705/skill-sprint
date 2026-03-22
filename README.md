# ⚡ Skill Sprint

> **AI 기반 실무 역량 진단 및 맞춤형 YouTube 마이크로러닝 큐레이션 서비스**

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://skillssprint.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com/)

---

## 🚀 Live Demo

**👉 [Skill Sprint 바로가기](https://skillssprint.vercel.app)**

---

## 💡 About

**Skill Sprint**는 현재 역량과 목표를 입력하면 AI가 스킬 갭을 진단하고, YouTube 영상 커리큘럼을 자동으로 큐레이션해주는 AI 서비스입니다.

IT 개발, 디자인, 마케팅, 금융, 언어, 건축 등 **YouTube에 콘텐츠가 존재하는 모든 분야**를 지원합니다. AI가 직접 YouTube 검색 툴을 호출해 영상을 찾는 **Function Calling** 구조로 동작합니다.

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| 📋 **3단계 폼 입력** | 현재 역량 → 목표 직무/분야 → 가용 시간을 단계별 입력 |
| 🧠 **AI 스킬 갭 진단** | Gemini가 현재 수준과 목표 사이의 갭을 3~5개 항목으로 분석 |
| 🔧 **Function Calling 영상 검색** | AI가 `search_youtube` 툴을 직접 호출해 모듈별 최적 영상을 능동적으로 탐색 |
| 🔄 **영상 교체** | 마음에 안 드는 영상은 후보 영상으로 즉시 교체 (카드당 최대 3개 후보) |
| 📚 **분석 기록 보관** | 이전 분석 결과를 브라우저에 자동 저장, 클릭 한 번으로 복원 |
| 💾 **커리큘럼 저장** | 결과를 `.txt` 파일로 다운로드 |

---

## 🛠 기술 스택

```
Frontend   Next.js 16 (App Router) · TypeScript · Tailwind CSS
AI         OpenRouter API (Gemini 2.0 Flash) · Function Calling · Structured Output (JSON Schema)
Data       YouTube Data API v3 · 좋아요비율/조회수/최신성 기반 랭킹
Deploy     Vercel (maxDuration 60s)
```

---

## 🔧 Function Calling 동작 방식

```
사용자 입력
    ↓
[Phase 1 — Function Calling]
AI: "모듈 1에 대해 search_youtube('React hooks tutorial 2025') 호출"
서버: YouTube API 실행 → 영상 필터/랭킹 → 상위 3개 반환
AI: "모듈 2에 대해 search_youtube('TypeScript generics explained 2025') 호출"
서버: ...반복...
    ↓
[Phase 2 — Structured Output]
AI: 진단 결과 JSON 반환 (schema 준수)
서버: Phase 1 영상 데이터 병합
    ↓
클라이언트: 단일 API 응답으로 진단 + 커리큘럼 동시 수신
```

