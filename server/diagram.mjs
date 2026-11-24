import crypto from "node:crypto";
import { splitSentences } from "./analyzer.mjs";

const MAX_BRANCHES = 6;
const MAX_CHILDREN = 4;

function clean(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(value, max) {
  const text = clean(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

/**
 * A short, stable signature used to decide whether a cached diagram still
 * matches the summary it was built from.
 */
export function summarySignature(text, points = []) {
  return crypto
    .createHash("sha1")
    .update(`${clean(text)}\n${(Array.isArray(points) ? points : []).map(clean).join("\n")}`)
    .digest("hex")
    .slice(0, 20);
}

function normalizeItem(raw, { maxLabel, maxDetail, allowChildren = false } = {}) {
  if (typeof raw === "string") {
    const label = clip(raw, maxLabel);
    return label ? { label, detail: "", children: [] } : null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const label = clip(raw.label ?? raw.title ?? raw.text, maxLabel);
  if (!label) return null;

  const item = {
    label,
    detail: clip(raw.detail ?? raw.description ?? "", maxDetail),
    children: [],
  };

  if (allowChildren && Array.isArray(raw.children)) {
    const seen = new Set();
    for (const child of raw.children) {
      const normalized = normalizeItem(child, {
        maxLabel: 36,
        maxDetail: 80,
      });
      if (!normalized || seen.has(normalized.label)) continue;
      seen.add(normalized.label);
      item.children.push(normalized);
      if (item.children.length >= MAX_CHILDREN) break;
    }
  }

  return item;
}

/**
 * Validate model-provided diagram JSON. Returns null when there is not enough
 * structure, so callers can fall back to the local outline.
 */
export function normalizeDiagram(raw, fallbackTitle = "课堂逻辑") {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const title = clip(raw.title, 40) || clip(fallbackTitle, 28) || "课堂逻辑";
  const root =
    normalizeItem(raw.root ?? title, {
      maxLabel: 32,
      maxDetail: 120,
    }) || { label: title, detail: "", children: [] };

  const branchesRaw = Array.isArray(raw.branches)
    ? raw.branches
    : Array.isArray(raw.nodes)
      ? raw.nodes
      : [];
  const branches = [];
  const seen = new Set();
  for (const branch of branchesRaw) {
    const normalized = normalizeItem(branch, {
      maxLabel: 38,
      maxDetail: 120,
      allowChildren: true,
    });
    if (!normalized || seen.has(normalized.label)) continue;
    seen.add(normalized.label);
    branches.push(normalized);
    if (branches.length >= MAX_BRANCHES) break;
  }

  if (branches.length < 2) return null;
  return { title, root, branches };
}

function shortRoot(title) {
  const cleanTitle = clean(title);
  const cut = cleanTitle.search(/[：:]/);
  if (cut >= 4 && cut <= 18) return cleanTitle.slice(0, cut);
  if (cleanTitle.length > 22) return clip(cleanTitle, 20);
  return cleanTitle;
}

/**
 * Extractive fallback: turn the key points (or summary sentences) into a
 * readable outline. It never invents content, so it works without a model.
 */
export function localDiagram({ title, summary, points = [], keywords = [] } = {}) {
  const cleanTitle = clip(title, 28) || "课堂逻辑";
  const cleanPoints = (Array.isArray(points) ? points : [])
    .map((point) => clean(point))
    .filter(Boolean)
    .slice(0, 5);
  const cleanKeywords = (Array.isArray(keywords) ? keywords : [])
    .map((keyword) => clean(keyword))
    .filter(Boolean)
    .slice(0, MAX_CHILDREN);

  const branches = cleanPoints.map((point) => {
    const cut = point.search(/[，,；;：:]/);
    if (cut >= 6 && cut <= 24 && point.length > cut + 2) {
      return {
        label: point.slice(0, cut),
        detail: clip(point.slice(cut + 1), 76),
        children: [],
      };
    }
    return {
      label: clip(point, 30),
      detail: point.length > 30 ? clip(point, 76) : "",
      children: [],
    };
  });

  if (!branches.length) {
    const sentences = splitSentences(summary)
      .filter((sentence) => sentence.length >= 8)
      .slice(0, 4);
    for (const sentence of sentences) {
      branches.push({
        label: clip(sentence, 30),
        detail: clip(sentence, 90),
        children: [],
      });
    }
  }

  if (cleanKeywords.length) {
    branches.push({
      label: "核心概念",
      detail: "",
      children: cleanKeywords.map((keyword) => ({
        label: keyword,
        detail: "",
        children: [],
      })),
    });
  }

  if (!branches.length) {
    branches.push({
      label: "内容梳理",
      detail: clip(summary, 90),
      children: [],
    });
  }

  const firstSentence = splitSentences(summary)[0] || "";
  return {
    title: cleanTitle,
    root: {
      label: shortRoot(cleanTitle),
      detail: clip(firstSentence, 90),
      children: [],
    },
    branches: branches.slice(0, MAX_BRANCHES),
    source: "local",
  };
}
