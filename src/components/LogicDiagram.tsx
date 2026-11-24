import { useId, useMemo, type RefObject } from "react";
import type { NoteDiagram, NoteDiagramItem } from "../types";

const WIDTH = 1012;
const X_ROOT = 28;
const W_ROOT = 232;
const X_BRANCH = 338;
const W_BRANCH = 298;
const X_CHILD = 714;
const W_CHILD = 272;
const PAD_Y = 32;
const BLOCK_GAP = 24;
const CHILD_GAP = 10;
const MAX_CHILDREN = 4;

const FONT = {
  root: { label: 15, detail: 11.5 },
  branch: { label: 13.5, detail: 11.2 },
  child: { label: 12, detail: 10.8 },
} as const;

type Kind = keyof typeof FONT;

interface NodeBox {
  kind: Kind;
  x: number;
  y: number;
  width: number;
  height: number;
  labelLines: string[];
  detailLines: string[];
  labelSize: number;
  detailSize: number;
  paddingX: number;
  paddingY: number;
  labelX: number;
  lineHeight: number;
  detailLineHeight: number;
}

interface BranchLayout {
  box: NodeBox;
  children: NodeBox[];
  blockHeight: number;
}

interface Layout {
  height: number;
  root: NodeBox;
  branches: BranchLayout[];
}

function charUnit(char: string): number {
  if (/[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(char)) return 1;
  if (char === " ") return 0.32;
  if (/[A-Z0-9]/.test(char)) return 0.64;
  return 0.54;
}

function wrapText(text: string, maxUnits: number, maxLines: number): string[] {
  const chars = Array.from(String(text || "").replace(/\s+/g, " ").trim());
  if (!chars.length) return [];

  const lines: string[] = [];
  let line = "";
  let used = 0;
  let truncated = false;

  for (const char of chars) {
    const unit = charUnit(char);
    if (line && used + unit > maxUnits) {
      lines.push(line);
      line = char;
      used = unit;
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
    } else {
      line += char;
      used += unit;
    }
  }

  if (!truncated && line && lines.length < maxLines) lines.push(line);
  if (truncated && lines.length) {
    const last = lines[lines.length - 1].replace(/[，,、；;：:\s]+$/, "");
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

function makeBox(
  item: NoteDiagramItem,
  kind: Kind,
  x: number,
  width: number,
): NodeBox {
  const paddingX = kind === "root" ? 18 : kind === "branch" ? 16 : 14;
  const paddingY = kind === "root" ? 18 : kind === "branch" ? 14 : 12;
  const badgeSpace = kind === "branch" ? 22 : kind === "child" ? 14 : 0;
  const inner = width - paddingX * 2 - badgeSpace;
  const labelSize = FONT[kind].label;
  const detailSize = FONT[kind].detail;
  const lineHeight = kind === "root" ? 22 : 20;
  const detailLineHeight = kind === "root" ? 17 : 16;

  const labelLines = wrapText(item.label, inner / labelSize, 2);
  const detailLines = item.detail
    ? wrapText(item.detail, inner / detailSize, 2)
    : [];
  const height =
    paddingY * 2 +
    Math.max(1, labelLines.length) * lineHeight +
    (detailLines.length ? 4 + detailLines.length * detailLineHeight : 0);

  return {
    kind,
    x,
    y: 0,
    width,
    height,
    labelLines: labelLines.length ? labelLines : [""],
    detailLines,
    labelSize,
    detailSize,
    paddingX,
    paddingY,
    labelX: paddingX + badgeSpace,
    lineHeight,
    detailLineHeight,
  };
}

function buildLayout(diagram: NoteDiagram): Layout {
  const root = makeBox(diagram.root, "root", X_ROOT, W_ROOT);
  const branches: BranchLayout[] = (diagram.branches || []).map((branch) => {
    const box = makeBox(branch, "branch", X_BRANCH, W_BRANCH);
    const children = (branch.children || [])
      .slice(0, MAX_CHILDREN)
      .map((child) => makeBox(child, "child", X_CHILD, W_CHILD));
    const childrenTotal =
      children.reduce((sum, child) => sum + child.height, 0) +
      Math.max(0, children.length - 1) * CHILD_GAP;
    return {
      box,
      children,
      blockHeight: Math.max(box.height, childrenTotal),
    };
  });

  const blocksTotal =
    branches.reduce((sum, branch) => sum + branch.blockHeight, 0) +
    Math.max(0, branches.length - 1) * BLOCK_GAP;
  const height = PAD_Y * 2 + blocksTotal;

  let cursorY = PAD_Y;
  for (const branch of branches) {
    const blockTop = cursorY;
    branch.box.y = blockTop + (branch.blockHeight - branch.box.height) / 2;

    const childrenTotal =
      branch.children.reduce((sum, child) => sum + child.height, 0) +
      Math.max(0, branch.children.length - 1) * CHILD_GAP;
    let childY = blockTop + (branch.blockHeight - childrenTotal) / 2;
    for (const child of branch.children) {
      child.y = childY;
      childY += child.height + CHILD_GAP;
    }
    cursorY += branch.blockHeight + BLOCK_GAP;
  }

  root.y = height / 2 - root.height / 2;
  return { height, root, branches };
}

function edgePath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): string {
  const control = Math.max(32, (toX - fromX) * 0.45);
  return `M ${fromX} ${fromY} C ${fromX + control} ${fromY}, ${toX - control} ${toY}, ${toX} ${toY}`;
}

function labelText(box: NodeBox) {
  const firstY = box.paddingY + box.labelSize;
  return (
    <text className="diagram-label" x={box.labelX} y={firstY}>
      {box.labelLines.map((line, index) => (
        <tspan key={index} x={box.labelX} dy={index === 0 ? 0 : box.lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function detailText(box: NodeBox) {
  if (!box.detailLines.length) return null;
  const firstY =
    box.paddingY + box.labelLines.length * box.lineHeight + 4 + box.detailSize;
  return (
    <text className="diagram-detail" x={box.labelX} y={firstY}>
      {box.detailLines.map((line, index) => (
        <tspan key={index} x={box.labelX} dy={index === 0 ? 0 : box.detailLineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function boxNode(box: NodeBox, index?: number) {
  const isRoot = box.kind === "root";
  const isBranch = box.kind === "branch";
  const isChild = box.kind === "child";
  const radius = isRoot ? 17 : 12;

  return (
    <g
      key={`${box.kind}-${index ?? 0}-${box.labelLines.join("")}`}
      className={`diagram-box diagram-${box.kind}`}
      transform={`translate(${box.x} ${box.y})`}
    >
      <rect
        className="diagram-box-bg"
        width={box.width}
        height={box.height}
        rx={radius}
      />
      {isBranch && (
        <>
          <circle
            className="diagram-badge-bg"
            cx={box.paddingX + 8}
            cy={box.paddingY + 10}
            r={9}
          />
          <text
            className="diagram-badge"
            x={box.paddingX + 8}
            y={box.paddingY + 13.6}
            textAnchor="middle"
          >
            {String((index ?? 0) + 1).padStart(2, "0")}
          </text>
        </>
      )}
      {isChild && (
        <circle
          className="diagram-child-dot"
          cx={box.paddingX + 3}
          cy={box.paddingY + 9}
          r={2.6}
        />
      )}
      {isRoot && <circle className="diagram-root-glow" cx={box.width - 24} cy={24} r={16} />}
      {labelText(box)}
      {detailText(box)}
    </g>
  );
}

function diagramCss(): string {
  return `
    .diagram-label { font-family: "Inter", "PingFang SC", "Microsoft YaHei", sans-serif; font-weight: 700; letter-spacing: 0.01em; }
    .diagram-detail { font-family: "Inter", "PingFang SC", "Microsoft YaHei", sans-serif; font-weight: 400; }
    .diagram-edge { fill: none; stroke: #a9cec9; stroke-width: 1.5; }
    .diagram-edge.inner { stroke: #d3e7e4; stroke-width: 1.35; }
    .diagram-root .diagram-box-bg { fill: #0b4b54; stroke: #0b4b54; }
    .diagram-root .diagram-label { fill: #f2fbfa; font-size: ${FONT.root.label}px; }
    .diagram-root .diagram-detail { fill: #b7dbd7; font-size: ${FONT.root.detail}px; }
    .diagram-root-glow { fill: rgba(138, 228, 223, 0.14); }
    .diagram-branch .diagram-box-bg { fill: #f5fbfa; stroke: #cfe7e3; }
    .diagram-branch .diagram-label { fill: #17454b; font-size: ${FONT.branch.label}px; }
    .diagram-branch .diagram-detail { fill: #5c777a; font-size: ${FONT.branch.detail}px; }
    .diagram-badge-bg { fill: #027789; }
    .diagram-badge { fill: #ffffff; font-family: Consolas, "Cascadia Code", monospace; font-size: 8.5px; font-weight: 600; }
    .diagram-child .diagram-box-bg { fill: #ffffff; stroke: #e4efed; }
    .diagram-child .diagram-label { fill: #3f6065; font-size: ${FONT.child.label}px; }
    .diagram-child .diagram-detail { fill: #71898c; font-size: ${FONT.child.detail}px; }
    .diagram-child-dot { fill: #9fc9c5; }
  `;
}

interface LogicDiagramProps {
  diagram: NoteDiagram;
  svgRef?: RefObject<SVGSVGElement | null>;
}

export function LogicDiagram({ diagram, svgRef }: LogicDiagramProps) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const gridId = `diagram-grid-${uid}`;
  const arrowId = `diagram-arrow-${uid}`;
  const layout = useMemo(() => buildLayout(diagram), [diagram]);

  return (
    <svg
      ref={svgRef}
      className="logic-diagram-svg"
      width={WIDTH}
      height={layout.height}
      viewBox={`0 0 ${WIDTH} ${layout.height}`}
      role="img"
      aria-label={`${diagram.title} 逻辑示意图`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <style>{diagramCss()}</style>
        <pattern id={gridId} width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="1.2" cy="1.2" r="1.1" fill="#e4efed" />
        </pattern>
        <marker
          id={arrowId}
          viewBox="0 0 10 10"
          refX="8.5"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#a9cec9" />
        </marker>
      </defs>

      <rect width={WIDTH} height={layout.height} fill="#fcfefd" />
      <rect width={WIDTH} height={layout.height} fill={`url(#${gridId})`} />

      {layout.branches.map((branch, index) => {
        const rootEdge = edgePath(
          X_ROOT + W_ROOT,
          layout.root.y + layout.root.height / 2,
          X_BRANCH,
          branch.box.y + branch.box.height / 2,
        );
        return (
          <g key={`edges-${index}`}>
            <path
              className="diagram-edge"
              d={rootEdge}
              markerEnd={`url(#${arrowId})`}
            />
            {branch.children.map((child, childIndex) => (
              <path
                key={`child-edge-${childIndex}`}
                className="diagram-edge inner"
                d={edgePath(
                  X_BRANCH + W_BRANCH,
                  branch.box.y + branch.box.height / 2,
                  X_CHILD,
                  child.y + child.height / 2,
                )}
                markerEnd={`url(#${arrowId})`}
              />
            ))}
          </g>
        );
      })}

      {boxNode(layout.root)}
      {layout.branches.map((branch, index) => (
        <g key={`branch-${index}`}>
          {boxNode(branch.box, index)}
          {branch.children.map((child, childIndex) =>
            boxNode(child, childIndex),
          )}
        </g>
      ))}
    </svg>
  );
}
