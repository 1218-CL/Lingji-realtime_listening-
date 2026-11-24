export interface User {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
  isDemo?: boolean;
}

export interface NoteDiagramItem {
  label: string;
  detail?: string;
  children?: NoteDiagramItem[];
}

export interface NoteDiagram {
  title: string;
  root: NoteDiagramItem;
  branches: NoteDiagramItem[];
  source: "ai" | "local";
  basedOn: string;
  updatedAt: string;
}

export interface NoteSection {
  id: string;
  index: number;
  title: string;
  summary: string;
  points: string[];
  startSec: number;
  endSec: number;
  chars: number;
  createdAt: string;
  diagram?: NoteDiagram | null;
}

export interface LectureNote {
  summary: string;
  keyPoints: string[];
  keywords: string[];
  questions: string[];
  sections?: NoteSection[];
  diagram?: NoteDiagram | null;
  updatedAt: string;
  source: "ai" | "local" | "demo";
}

export interface TranscriptSegment {
  id: string;
  text: string;
  at: number;
}

export interface LectureImage {
  id: string;
  mime: string;
  size: number;
  createdAt: string;
  url: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  source?: "ai" | "local" | "demo";
}

export interface CourseBrief {
  id: string;
  name: string;
  teacher: string;
  color: string;
}

export interface LectureSummary {
  id: string;
  courseId: string;
  courseName: string;
  teacher: string;
  title: string;
  status: "recording" | "completed";
  startedAt: string;
  endedAt: string | null;
  durationSec: number;
  note: LectureNote | null;
  hasAudio: boolean;
  segmentCount: number;
  imageCount: number;
}

export interface SummaryState {
  cursor: number;
  pendingChars: number;
  pendingImages: boolean;
}

export interface LectureDetail extends LectureSummary {
  segments: TranscriptSegment[];
  images: LectureImage[];
  summaryState: SummaryState;
  chat: ChatMessage[];
  course: CourseBrief | null;
}

export interface CourseSummary {
  id: string;
  name: string;
  teacher: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  lectureCount: number;
  totalSeconds: number;
  lastLectureAt: string | null;
  latestLecture: LectureSummary | null;
  keywords: string[];
}

export interface TeacherProfileDimension {
  key: string;
  label: string;
  summary: string;
}

export interface TeacherListeningAdvice {
  before: string[];
  during: string[];
  after: string[];
}

export interface TeacherProfile {
  teacher: string;
  summary: string;
  tags: string[];
  dimensions: TeacherProfileDimension[];
  strengths: string[];
  attentionPoints: string[];
  noteStrategy: string;
  advice: TeacherListeningAdvice;
  evidence: string[];
  source: "ai" | "local" | "demo";
  confidence: "low" | "medium" | "high";
  lectureCount: number;
  segmentCount?: number;
  transcriptChars: number;
  durationSeconds: number;
  updatedAt: string;
}

export interface CourseDetailData {
  course: CourseSummary;
  lectures: LectureSummary[];
  teacherProfile: TeacherProfile | null;
}

export interface TeacherProfileResult {
  profile: TeacherProfile;
  warning?: string;
}

export interface DashboardData {
  courses: CourseSummary[];
  recentLectures: LectureSummary[];
  activeLecture: LectureSummary | null;
  stats: {
    courses: number;
    lectures: number;
    totalSeconds: number;
    totalHours: number;
  };
}

export interface LlmSettings {
  provider: string;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyLast4: string;
  configured: boolean;
}

export interface AsrSettings {
  enabled: boolean;
  baseUrl: string;
  model: string;
  language: string;
  hasApiKey: boolean;
  apiKeyLast4: string;
  configured: boolean;
}

export interface SettingsData {
  llm: LlmSettings;
  asr: AsrSettings;
}

export interface NotesResult {
  note: LectureNote;
  source: "ai" | "local";
  warning?: string;
  skipped?: boolean;
  lecture: LectureDetail;
}

export interface DiagramResult {
  diagram: NoteDiagram;
  source: "ai" | "local";
  warning?: string;
  cached?: boolean;
}

export interface UpdateInfo {
  currentVersion: string;
  configured: boolean;
  updateAvailable: boolean;
  checkedAt: string;
  latestVersion?: string;
  publishedAt?: string | null;
  notes?: string[];
  downloadUrl?: string;
  sha256?: string;
  size?: number | null;
  error?: string | null;
  message?: string;
}

export interface ChatStreamHandlers {
  onStart?: (payload: { userMessageId: string; source: "ai" | "local" }) => void;
  onSource?: (payload: { source: "ai" | "local"; warning?: string }) => void;
  onDelta?: (text: string) => void;
  onDone?: (payload: {
    messageId: string;
    source: "ai" | "local";
    warning?: string;
    content: string;
  }) => void;
  onError?: (message: string) => void;
}
