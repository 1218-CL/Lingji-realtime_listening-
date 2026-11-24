import type {
  ChatMessage,
  ChatStreamHandlers,
  CourseDetailData,
  CourseSummary,
  DashboardData,
  DiagramResult,
  LectureDetail,
  LectureNote,
  NotesResult,
  SettingsData,
  TeacherProfileResult,
  TranscriptSegment,
  User,
} from "../types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data?.error === "string") return data.error;
    if (typeof data?.message === "string") return data.message;
  } catch {
    // ignore non-JSON errors
  }
  return `请求失败（${response.status}）`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof Blob) && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("网络连接失败，请检查服务是否在运行。");
  }
  if (!response.ok) {
    const message = await parseError(response);
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function jsonBody(value: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(value) };
}

export const api = {
  publicConfig: () => request<{ demoAvailable: boolean }>("/api/config"),

  update: (force = false) =>
    request<import("../types").UpdateInfo>(
      `/api/update${force ? "?refresh=1" : ""}`,
    ),

  me: () => request<{ user: User | null }>("/api/auth/me"),

  login: (username: string, password: string) =>
    request<{ user: User }>("/api/auth/login", jsonBody({ username, password })),

  register: (username: string, password: string, displayName: string) =>
    request<{ user: User }>(
      "/api/auth/register",
      jsonBody({ username, password, displayName }),
    ),

  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  updateProfile: (displayName: string) =>
    request<{ user: User }>("/api/me", {
      method: "PATCH",
      body: JSON.stringify({ displayName }),
    }),

  dashboard: () => request<DashboardData>("/api/dashboard"),

  courses: () => request<{ courses: CourseSummary[] }>("/api/courses"),

  createCourse: (name: string, teacher: string) =>
    request<{ course: CourseSummary; created: boolean }>(
      "/api/courses",
      jsonBody({ name, teacher }),
    ),

  course: (id: string) => request<CourseDetailData>(`/api/courses/${id}`),

  generateTeacherProfile: (id: string) =>
    request<TeacherProfileResult>(`/api/courses/${id}/teacher-profile`, {
      method: "POST",
    }),

  updateCourse: (id: string, patch: { name?: string; teacher?: string }) =>
    request<{ course: CourseSummary }>(`/api/courses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteCourse: (id: string) =>
    request<{ ok: true }>(`/api/courses/${id}`, { method: "DELETE" }),

  createLecture: (payload: {
    courseId?: string;
    courseName?: string;
    teacher?: string;
    title?: string;
    language?: string;
  }) => request<{ lecture: LectureDetail }>("/api/lectures", jsonBody(payload)),

  lecture: (id: string) => request<{ lecture: LectureDetail }>(`/api/lectures/${id}`),

  updateLecture: (
    id: string,
    patch: { status?: "completed"; durationSec?: number; title?: string },
  ) =>
    request<{ lecture: LectureDetail }>(`/api/lectures/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteLecture: (id: string) =>
    request<{ ok: true }>(`/api/lectures/${id}`, { method: "DELETE" }),

  syncTranscript: (id: string, segments: TranscriptSegment[]) =>
    request<{ count: number; chars: number }>(`/api/lectures/${id}/transcript`, {
      method: "PUT",
      body: JSON.stringify({ segments }),
    }),



  notes: (
    id: string,
    text: string,
    signal?: AbortSignal,
    forceImages = false,
    force = false,
  ) =>
    request<NotesResult>(`/api/lectures/${id}/notes`, {
      method: "POST",
      body: JSON.stringify({ text, forceImages, force }),
      signal,
    }),

  diagram: (
    id: string,
    payload: {
      scope: "overall" | "section";
      sectionId?: string;
      refresh?: boolean;
    },
  ) =>
    request<DiagramResult>(`/api/lectures/${id}/diagram`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  uploadAudio: (id: string, blob: Blob, mime: string) =>
    request<{ ok: true; size: number; mime: string }>(`/api/lectures/${id}/audio`, {
      method: "POST",
      headers: { "Content-Type": mime },
      body: blob,
    }),

  uploadImage: (id: string, blob: Blob, mime: string) =>
    request<{ image: import("../types").LectureImage }>(
      `/api/lectures/${id}/images`,
      {
        method: "POST",
        headers: { "Content-Type": mime },
        body: blob,
      },
    ),

  deleteImage: (id: string, imageId: string) =>
    request<{ ok: true }>(`/api/lectures/${id}/images/${imageId}`, {
      method: "DELETE",
    }),

  audioUrl: (id: string) => `/api/lectures/${id}/audio`,

  settings: () => request<SettingsData>("/api/settings"),

  saveSettings: (payload: {
    provider: string;
    baseUrl: string;
    model: string;
    apiKey?: string;
    clearApiKey?: boolean;
    asr?: {
      enabled: boolean;
      baseUrl: string;
      model: string;
      language: string;
      apiKey?: string;
      clearApiKey?: boolean;
    };
  }) =>
    request<SettingsData & { message: string }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  testConnection: () =>
    request<{ ok: boolean; message: string }>("/api/settings/test", { method: "POST" }),

  transcribeChunk: (id: string, blob: Blob, mime: string) =>
    request<{ text: string }>(`/api/lectures/${id}/asr`, {
      method: "POST",
      headers: { "Content-Type": mime },
      body: blob,
    }),

  async chatStream(
    lectureId: string,
    content: string,
    transcript: string,
    handlers: ChatStreamHandlers,
    signal?: AbortSignal,
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`/api/lectures/${lectureId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, text: transcript }),
        credentials: "same-origin",
        signal,
      });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      throw new ApiError("网络连接失败，请稍后重试。");
    }
    if (!response.ok) {
      throw new ApiError(await parseError(response), response.status);
    }
    if (!response.body) throw new ApiError("浏览器不支持流式回答。");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;
    let failed = false;

    const dispatch = (block: string) => {
      let event = "message";
      const dataLines: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) return;
      let payload: unknown = {};
      try {
        payload = JSON.parse(dataLines.join("\n"));
      } catch {
        return;
      }
      const data = payload as Record<string, unknown>;
      if (event === "start") {
        handlers.onStart?.(data as { userMessageId: string; source: "ai" | "local" });
      } else if (event === "delta" && typeof data.text === "string") {
        handlers.onDelta?.(data.text);
      } else if (event === "source") {
        handlers.onSource?.(data as { source: "ai" | "local"; warning?: string });
      } else if (event === "done") {
        finished = true;
        handlers.onDone?.(
          data as {
            messageId: string;
            source: "ai" | "local";
            warning?: string;
            content: string;
          },
        );
      } else if (event === "error") {
        failed = true;
        handlers.onError?.(String(data.message || "回答失败，请重试。"));
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || "";
      for (const block of blocks) dispatch(block);
    }
    buffer += decoder.decode();
    if (buffer.trim()) dispatch(buffer);
    if (!finished && !failed) handlers.onError?.("回答意外中断，请重试。");
  },
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "发生未知错误，请重试。";
}

export function appendChat(
  messages: ChatMessage[],
  message: ChatMessage,
): ChatMessage[] {
  return [...messages, message];
}

export type { LectureNote };
