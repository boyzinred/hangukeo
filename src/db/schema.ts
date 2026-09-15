import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  date,
  jsonb,
  pgEnum,
  unique,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["student", "ta", "teacher"]);
export const itemKindEnum = pgEnum("item_kind", ["vocab", "grammar"]);
export const questionFormatEnum = pgEnum("question_format", [
  "ko_to_en_typed",
  "en_to_ko_typed",
  "vocab_choice",
  "grammar_transform",
  "grammar_choice",
  "reading_choice",
]);
export const testStatusEnum = pgEnum("test_status", [
  "draft",
  "review",
  "published",
  "closed",
]);
export const attemptStateEnum = pgEnum("attempt_state", [
  "in_progress",
  "submitted",
  "abandoned",
]);

// --- people -----------------------------------------------------------
//
// One cohort, so role is global rather than per-class. A TA is a promoted
// student; promotion is a column update, not a new row anywhere.

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  birthday: date("birthday"),
  role: roleEnum("role").notNull().default("student"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Signup is invite-only: a magic link is issued only to an address the teacher
 * has listed here. Without this, a publicly reachable deployment lets anyone
 * create an account.
 */
export const allowlist = pgTable("allowlist", {
  email: text("email").primaryKey(),
  displayName: text("display_name"),
  invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimedBy: uuid("claimed_by").references(() => users.id, { onDelete: "set null" }),
});

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  taId: uuid("ta_id").references(() => users.id, { onDelete: "set null" }),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    // A student belongs to exactly one team, so the student is the key.
    studentId: uuid("student_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("team_members_team_idx").on(t.teamId)],
);

// --- class settings ---------------------------------------------------
//
// Single row. Level caps live here rather than in code so adding TOPIK II
// material later is a settings change, not a migration.

export const classSettings = pgTable("class_settings", {
  id: integer("id").primaryKey().default(1),
  termStart: date("term_start").notNull(),
  termEnd: date("term_end").notNull(),
  vocabGoal: integer("vocab_goal").notNull().default(1500),
  grammarGoal: integer("grammar_goal").notNull().default(52),
  vocabPerWeek: integer("vocab_per_week").notNull().default(125),
  grammarPerWeek: integer("grammar_per_week").notNull().default(4),
  maxVocabLevel: integer("max_vocab_level").notNull().default(2),
  maxGrammarLevel: integer("max_grammar_level").notNull().default(3),
  studyDaysPerWeek: integer("study_days_per_week").notNull().default(5),
});

// --- corpus -----------------------------------------------------------
//
// Seeded from src/corpus/data, but held in the database so a teacher can fix
// a bad gloss without a redeploy.

export const corpusVocab = pgTable(
  "corpus_vocab",
  {
    id: text("id").primaryKey(),
    korean: text("korean").notNull(),
    english: text("english").notNull(),
    acceptedAnswers: text("accepted_answers").array().notNull().default([]),
    partOfSpeech: text("part_of_speech"),
    level: integer("level").notNull(),
    topic: text("topic"),
    /** Study-day slot from the TOPIK 2000 list; null for shared-vocab additions. */
    sourceDay: integer("source_day"),
    lessons: text("lessons").array().notNull().default([]),
    retired: boolean("retired").notNull().default(false),
  },
  (t) => [
    index("corpus_vocab_level_idx").on(t.level),
    index("corpus_vocab_korean_idx").on(t.korean),
  ],
);

export const corpusGrammar = pgTable(
  "corpus_grammar",
  {
    id: text("id").primaryKey(),
    form: text("form").notNull(),
    name: text("name").notNull(),
    meaning: text("meaning").notNull(),
    shape: text("shape"),
    level: integer("level").notNull(),
    examples: jsonb("examples").$type<{ ko: string; en: string }[]>().notNull(),
    retired: boolean("retired").notNull().default(false),
  },
  (t) => [index("corpus_grammar_level_idx").on(t.level)],
);

// --- weekly plan ------------------------------------------------------
//
// Assignment is uniform across the cohort, so the plan is class-level and a
// student's "bank" is every plan up to the current week. Per-student
// divergence would mean adding student_id here; nothing else would change.

export const weekPlans = pgTable(
  "week_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weekKey: text("week_key").notNull().unique(),
    weekNumber: integer("week_number").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("week_plans_number_idx").on(t.weekNumber)],
);

export const weekPlanVocab = pgTable(
  "week_plan_vocab",
  {
    weekPlanId: uuid("week_plan_id")
      .notNull()
      .references(() => weekPlans.id, { onDelete: "cascade" }),
    vocabId: text("vocab_id")
      .notNull()
      .references(() => corpusVocab.id, { onDelete: "cascade" }),
    /** 1..studyDaysPerWeek — which day of the week's split this word sits in. */
    studyDay: integer("study_day").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.weekPlanId, t.vocabId] }),
    index("week_plan_vocab_day_idx").on(t.weekPlanId, t.studyDay),
  ],
);

export const weekPlanGrammar = pgTable(
  "week_plan_grammar",
  {
    weekPlanId: uuid("week_plan_id")
      .notNull()
      .references(() => weekPlans.id, { onDelete: "cascade" }),
    grammarId: text("grammar_id")
      .notNull()
      .references(() => corpusGrammar.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.weekPlanId, t.grammarId] })],
);

// --- tests ------------------------------------------------------------

export const tests = pgTable(
  "tests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weekPlanId: uuid("week_plan_id")
      .notNull()
      .references(() => weekPlans.id, { onDelete: "cascade" })
      .unique(),
    title: text("title").notNull(),
    status: testStatusEnum("status").notNull().default("draft"),
    /** Reading passage, shared by the whole cohort. */
    passageKo: text("passage_ko"),
    passageEn: text("passage_en"),
    timeLimitMinutes: integer("time_limit_minutes").notNull().default(30),
    spec: jsonb("spec"),
    opensAt: timestamp("opens_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    testId: uuid("test_id").notNull().references(() => tests.id, { onDelete: "cascade" }),
    kind: itemKindEnum("kind").notNull(),
    /** Exactly one of these is set, depending on kind. */
    vocabId: text("vocab_id").references(() => corpusVocab.id, { onDelete: "set null" }),
    grammarId: text("grammar_id").references(() => corpusGrammar.id, { onDelete: "set null" }),
    format: questionFormatEnum("format").notNull(),
    section: text("section").notNull(),
    position: integer("position").notNull(),
    prompt: text("prompt").notNull(),
    choices: text("choices").array(),
    correctAnswer: text("correct_answer").notNull(),
    acceptedAnswers: text("accepted_answers").array().notNull().default([]),
    points: integer("points").notNull().default(1),
  },
  (t) => [unique("questions_test_position").on(t.testId, t.position)],
);

export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    testId: uuid("test_id").notNull().references(() => tests.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull().default(1),
    state: attemptStateEnum("state").notNull().default("in_progress"),
    /** Server-owned clock: remaining time is derived, never trusted from the client. */
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    score: integer("score"),
    maxScore: integer("max_score"),
    /**
     * A retake is automatic when the previous attempt was never submitted;
     * anything else needs a TA to grant it, recorded here.
     */
    retakeGrantedBy: uuid("retake_granted_by").references(() => users.id),
    retakeReason: text("retake_reason"),
  },
  (t) => [
    unique("attempts_test_student_number").on(t.testId, t.studentId, t.attemptNumber),
    index("attempts_student_idx").on(t.studentId),
  ],
);

export const responses = pgTable(
  "responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // Denormalised so mastery can be computed without joining through questions.
    vocabId: text("vocab_id").references(() => corpusVocab.id, { onDelete: "set null" }),
    grammarId: text("grammar_id").references(() => corpusGrammar.id, { onDelete: "set null" }),
    answer: text("answer"),
    isCorrect: boolean("is_correct"),
    needsReview: boolean("needs_review").notNull().default(false),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("responses_attempt_question").on(t.attemptId, t.questionId),
    index("responses_student_vocab_idx").on(t.studentId, t.vocabId),
    index("responses_student_grammar_idx").on(t.studentId, t.grammarId),
  ],
);

// --- practice (ungraded) ---------------------------------------------
//
// Kept separate from responses so self-directed drilling can never inflate
// the semester mastery count, which is test-score based.

export const practiceRuns = pgTable("practice_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: itemKindEnum("kind").notNull(),
  direction: text("direction").notNull(),
  total: integer("total").notNull(),
  firstTryCorrect: integer("first_try_correct").notNull(),
  scope: jsonb("scope"),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-item practice outcomes.
 *
 * These drive the "studied" count — the soft, self-directed number that tracks
 * the semester vocabulary goal. They deliberately do NOT feed mastery, which
 * stays test-only: practice is unproctored and retryable, so letting it certify
 * words would inflate the figure the teacher reports.
 */
export const practiceResponses = pgTable(
  "practice_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => practiceRuns.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    vocabId: text("vocab_id").references(() => corpusVocab.id, { onDelete: "cascade" }),
    grammarId: text("grammar_id").references(() => corpusGrammar.id, { onDelete: "cascade" }),
    /** False once the learner needed the retry, which is what disqualifies it. */
    firstTry: boolean("first_try").notNull(),
    isCorrect: boolean("is_correct").notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("practice_responses_student_vocab_idx").on(t.studentId, t.vocabId),
    index("practice_responses_student_grammar_idx").on(t.studentId, t.grammarId),
  ],
);

// --- weekly reports ---------------------------------------------------

export const weeklyReports = pgTable(
  "weekly_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    weekKey: text("week_key").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [unique("weekly_reports_student_week").on(t.studentId, t.weekKey)],
);
