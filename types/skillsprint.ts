// types/skillsprint.ts

export interface SkillGap {
  skill_name: string;           // e.g. "REST API Design"
  severity: number;             // 1–10, 10 = most critical
  job_relevance: number;        // 1–10
  estimated_hours: number;      // float, hours to close gap
  reason: string;               // 1–2 sentence rationale
}

export interface LearningModule {
  order: number;                // 1-based sequence
  title: string;                // specific module title
  skill_gap_addressed: string;  // maps to SkillGap.skill_name
  learning_objective: string;   // concrete, measurable outcome
  estimated_minutes: number;    // expected video length range midpoint
  search_query: string;         // YouTube search query (ALWAYS English)
  difficulty: "beginner" | "intermediate" | "advanced";
}

export interface DiagnosisResult {
  summary: string;              // 2–3 sentence overall assessment
  target_role: string;          // normalized role name
  total_estimated_hours: number;
  weekly_hours_available: number;
  estimated_weeks_to_ready: number; // ceil(total / weekly)
  readiness_score: number;      // 0–100, current readiness %
  skill_gaps: SkillGap[];       // 3–5 items
  curriculum: LearningModule[]; // 3–5 items, ordered by priority
  motivational_note: string;    // personalized, 1 sentence
}
