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

**Skill Sprint**는 당신의 현재 역량을 진단하고, 부족한 스킬 갭을 메워줄 YouTube 영상 커리큘럼을 자동으로 큐레이션해주는 AI 서비스입니다.

관심 분야를 입력하면 — IT 개발, 기획, 디자인, 마케팅, 금융, 언어 등 **YouTube에 콘텐츠가 존재하는 모든 분야** — AI가 스킬 갭을 분석하고 지금 당장 시작할 수 있는 맞춤형 학습 플레이리스트를 만들어드립니다.

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| 📋 **3단계 폼 입력** | 목표 직무 → 현재 역량 → 학습 선호도를 단계별로 입력 |
| 🧠 **AI 스킬 갭 진단** | OpenRouter(Gemini)가 현재 수준과 목표 사이의 갭을 분석 |
| 🎬 **YouTube 커리큘럼 자동 생성** | YouTube Data API를 활용해 갭에 딱 맞는 영상 리스트 큐레이션 |
| 🌐 **전 분야 지원** | YouTube에 콘텐츠가 있는 모든 분야 학습 가능 |

---

## 🛠 기술 스택

```
Frontend   Next.js 16 (App Router) · TypeScript · Tailwind CSS
AI         OpenRouter API (Gemini 2.0 Flash) · Structured Output (JSON Schema)
Data       YouTube Data API v3
Deploy     Vercel
```

---

## 🏃 로컬 실행 방법

### 1. 저장소 클론

```bash
git clone https://github.com/eun4705/skill-sprint.git
cd skill-sprint
```

### 2. 패키지 설치

```bash
npm install
```

### 3. 환경변수 설정

프로젝트 루트에 `.env.local` 파일을 생성하고 아래 값을 입력하세요.

```env
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=google/gemini-2.0-flash-001
YOUTUBE_API_KEY=your_youtube_data_api_key
```

> 🔑 API 키 발급:
> - OpenRouter: [openrouter.ai](https://openrouter.ai)
> - YouTube Data API: [Google Cloud Console](https://console.cloud.google.com)

### 4. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속

---

## 📁 프로젝트 구조

```
skill-sprint/
├── app/
│   ├── page.tsx              # 메인 페이지 (입력 폼 · 로딩 · 결과 대시보드)
│   └── api/
│       ├── diagnose/         # AI 스킬 갭 진단 엔드포인트
│       └── curriculum/       # YouTube 커리큘럼 생성 엔드포인트
├── lib/
│   ├── openrouter.ts         # OpenRouter LLM 클라이언트
│   ├── youtube.ts            # YouTube API 호출 및 영상 필터링/랭킹
│   ├── system-prompt.md      # AI 시스템 프롬프트
│   └── diagnosis-schema.json # Structured Output JSON Schema
└── types/
    └── skillsprint.ts        # TypeScript 타입 정의
```

---
