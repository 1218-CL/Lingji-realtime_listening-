#!/usr/bin/env python3
"""Build the LingJi user manual DOCX from the Markdown source."""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
MD_FILE = DOCS / "用户使用说明书.md"
OUT_FILE = DOCS / "聆记LingJi用户使用说明书-v1.2.0.docx"
ASSETS = DOCS / "assets"

FONT = "微软雅黑"
MONO = "Consolas"

TEAL = RGBColor(0x02, 0x77, 0x89)
DARK = RGBColor(0x01, 0x3E, 0x47)
INK = RGBColor(0x1F, 0x2D, 0x2F)
MUTED = RGBColor(0x67, 0x7A, 0x7D)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
MINT = RGBColor(0x8A, 0xE4, 0xDF)
WARM = RGBColor(0xC9, 0x6B, 0x25)
SOFT_CODE = RGBColor(0x03, 0x5A, 0x65)

CONTENT_WIDTH = Cm(16.35)

# ---------------------------------------------------------------- low-level xml


PPR_ORDER = [
    "pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr", "widowControl",
    "numPr", "suppressLineNumbers", "pBdr", "shd", "tabs", "suppressAutoHyphens",
    "kinsoku", "wordWrap", "overflowPunct", "topLinePunct", "autoSpaceDE",
    "autoSpaceDN", "bidi", "adjustRightInd", "snapToGrid", "spacing", "ind",
    "contextualSpacing", "mirrorIndents", "suppressOverlap", "jc", "textDirection",
    "textAlignment", "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr",
    "sectPr", "pPrChange",
]


def _insert_ordered(parent, element, order):
    tag = element.tag.split("}")[-1]
    try:
        index = order.index(tag)
    except ValueError:
        parent.append(element)
        return
    for child in list(parent):
        child_tag = child.tag.split("}")[-1]
        if child_tag in order and order.index(child_tag) > index:
            child.addprevious(element)
            return
    parent.append(element)


TCPR_ORDER = [
    "cnfStyle", "tcW", "gridSpan", "hMerge", "vMerge", "tcBorders", "shd", "noWrap",
    "tcMar", "textDirection", "tcFitText", "vAlign", "hideMark",
]

TRPR_ORDER = [
    "cnfStyle", "divId", "gridBefore", "gridAfter", "wBefore", "wAfter", "cantSplit",
    "trHeight", "tblHeader", "tblCellSpacing", "jc", "hidden",
]

TBLPR_ORDER = [
    "tblStyle", "tblpPr", "tblOverlap", "bidiVisual", "tblStyleRowBandSize",
    "tblStyleColBandSize", "tblW", "jc", "tblCellSpacing", "tblInd", "tblBorders",
    "shd", "tblLayout", "tblCellMar", "tblLook", "tblCaption", "tblDescription",
]


def set_paragraph_border(paragraph, edge="bottom", size=8, color="8AE4DF", space=4):
    p_pr = paragraph._p.get_or_add_pPr()
    p_bdr = p_pr.find(qn("w:pBdr"))
    if p_bdr is None:
        p_bdr = OxmlElement("w:pBdr")
        _insert_ordered(p_pr, p_bdr, PPR_ORDER)
    border = OxmlElement(f"w:{edge}")
    border.set(qn("w:val"), "single")
    border.set(qn("w:sz"), str(size))
    border.set(qn("w:space"), str(space))
    border.set(qn("w:color"), color)
    p_bdr.append(border)


def shade_cell(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    _insert_ordered(tc_pr, shd, TCPR_ORDER)


def set_cell_margins(cell, top=80, bottom=80, left=160, right=160):
    tc_pr = cell._tc.get_or_add_tcPr()
    margins = OxmlElement("w:tcMar")
    for name, value in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        node = OxmlElement(f"w:{name}")
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")
        margins.append(node)
    _insert_ordered(tc_pr, margins, TCPR_ORDER)


def set_table_borders(table, color="D5E6E8", size=4, inside=True, outside=True, none=False):
    tbl_pr = table._tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        enabled = edge in ("insideH", "insideV")
        element = OxmlElement(f"w:{edge}")
        if none or (enabled and not inside) or (not enabled and not outside):
            # LibreOffice can fall back to visible borders for val="nil"; white
            # hairlines are invisible on paper in both Word and LibreOffice.
            element.set(qn("w:val"), "single")
            element.set(qn("w:sz"), "4")
            element.set(qn("w:space"), "0")
            element.set(qn("w:color"), "FFFFFF")
        else:
            element.set(qn("w:val"), "single")
            element.set(qn("w:sz"), str(size))
            element.set(qn("w:space"), "0")
            element.set(qn("w:color"), color)
        borders.append(element)
    _insert_ordered(tbl_pr, borders, TBLPR_ORDER)


def set_table_fixed(table):
    tbl_pr = table._tbl.tblPr
    if tbl_pr.find(qn("w:tblLayout")) is not None:
        return
    layout = OxmlElement("w:tblLayout")
    layout.set(qn("w:type"), "fixed")
    _insert_ordered(tbl_pr, layout, TBLPR_ORDER)


def set_table_width(table, width):
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), str(int(width.twips)))
    tbl_w.set(qn("w:type"), "dxa")


def repeat_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    header = OxmlElement("w:tblHeader")
    header.set(qn("w:val"), "true")
    _insert_ordered(tr_pr, header, TRPR_ORDER)


def cant_split(row):
    tr_pr = row._tr.get_or_add_trPr()
    node = OxmlElement("w:cantSplit")
    node.set(qn("w:val"), "true")
    _insert_ordered(tr_pr, node, TRPR_ORDER)


def keep_table_together(table):
    for row in table.rows[:-1]:
        for cell in row.cells:
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.keep_with_next = True


def set_row_height(row, height):
    tr_pr = row._tr.get_or_add_trPr()
    node = OxmlElement("w:trHeight")
    node.set(qn("w:val"), str(int(height.twips)))
    node.set(qn("w:hRule"), "atLeast")
    _insert_ordered(tr_pr, node, TRPR_ORDER)


def add_field(paragraph, instruction: str, placeholder: str = "1", size=8.2, color=None):
    color = color or MUTED
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    run._r.append(begin)

    run = paragraph.add_run()
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = f" {instruction} "
    run._r.append(instr)

    run = paragraph.add_run()
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    run._r.append(separate)

    run = paragraph.add_run(placeholder)
    font_run(run, size, False, color)

    run = paragraph.add_run()
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.append(end)
    return run


# ------------------------------------------------------------------- text helpers


def font_run(run, size=10.5, bold=False, color=INK, font=FONT, italic=False):
    run.font.name = font
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    run.font.color.rgb = color
    r_pr = run._element.get_or_add_rPr()
    r_fonts = r_pr.find(qn("w:rFonts"))
    if r_fonts is None:
        r_fonts = OxmlElement("w:rFonts")
        r_pr.insert(0, r_fonts)
    r_fonts.set(qn("w:ascii"), font)
    r_fonts.set(qn("w:hAnsi"), font)
    r_fonts.set(qn("w:eastAsia"), FONT)
    r_fonts.set(qn("w:cs"), font)


INLINE = re.compile(r"(\*\*.+?\*\*|`[^`]+`)")


def add_inline(paragraph, text, size=10.5, color=INK, bold=False):
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") and len(part) > 4:
            run = paragraph.add_run(part[2:-2])
            font_run(run, size, True, color)
        elif part.startswith("`") and part.endswith("`") and len(part) > 2:
            run = paragraph.add_run(part[1:-1])
            font_run(run, size - 0.7, False, SOFT_CODE, MONO)
            r_pr = run._element.get_or_add_rPr()
            shd = OxmlElement("w:shd")
            shd.set(qn("w:val"), "clear")
            shd.set(qn("w:color"), "auto")
            shd.set(qn("w:fill"), "EDF5F6")
            r_pr.append(shd)
        else:
            run = paragraph.add_run(part)
            font_run(run, size, bold, color)


def body_paragraph(doc, text, size=10.5, space_after=7, align=WD_ALIGN_PARAGRAPH.JUSTIFY):
    p = doc.add_paragraph()
    fmt = p.paragraph_format
    fmt.space_before = Pt(0)
    fmt.space_after = Pt(space_after)
    fmt.line_spacing = 1.55
    fmt.alignment = align
    add_inline(p, text, size)
    return p


def display_len(text: str) -> float:
    total = 0.0
    for ch in text:
        total += 2.0 if unicodedata.east_asian_width(ch) in ("W", "F") else 1.0
    return total


def breakable(text: str) -> str:
    if "://" in text or (len(text) > 26 and " " not in text and "/" in text):
        return text.replace("/", "/\u200b")
    return text


# ------------------------------------------------------------------- md parsing


def parse_blocks(lines):
    blocks = []
    i = 0
    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip("\n")
        stripped = line.strip()
        if not stripped:
            i += 1
            continue
        if stripped.startswith("```"):
            i += 1
            code = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code.append(lines[i].rstrip("\n"))
                i += 1
            i += 1
            blocks.append({"type": "code", "lines": code})
            continue
        if stripped.startswith("# "):
            blocks.append({"type": "h1", "text": stripped[2:].strip()})
            i += 1
            continue
        if stripped.startswith("## "):
            blocks.append({"type": "h2", "text": stripped[3:].strip()})
            i += 1
            continue
        if stripped.startswith("### "):
            blocks.append({"type": "h3", "text": stripped[4:].strip()})
            i += 1
            continue
        image = re.match(r"!\[(.*?)\]\((.*?)\)", stripped)
        if image:
            blocks.append({"type": "image", "alt": image.group(1), "path": image.group(2)})
            i += 1
            continue
        if stripped.startswith("|") and i + 1 < len(lines) and re.match(
            r"^\|[\s:|-]+\|$", lines[i + 1].strip()
        ):
            rows = []
            header = [cell.strip() for cell in stripped.strip("|").split("|")]
            rows.append(header)
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                row = [cell.strip() for cell in lines[i].strip().strip("|").split("|")]
                rows.append(row)
                i += 1
            blocks.append({"type": "table", "rows": rows})
            continue
        if stripped.startswith("- "):
            items = []
            while i < len(lines) and lines[i].strip().startswith("- "):
                items.append(lines[i].strip()[2:].strip())
                i += 1
            blocks.append({"type": "ul", "items": items})
            continue
        if re.match(r"^\d+\.\s+", stripped):
            items = []
            while i < len(lines) and re.match(r"^\d+\.\s+", lines[i].strip()):
                items.append(re.sub(r"^\d+\.\s+", "", lines[i].strip()))
                i += 1
            blocks.append({"type": "ol", "items": items})
            continue
        if stripped in ("注意：", "小提示：", "部署提示：", "补充说明："):
            blocks.append({"type": "label", "text": stripped})
            i += 1
            continue
        blocks.append({"type": "p", "text": stripped})
        i += 1
    return blocks


# ---------------------------------------------------------------- doc components


def setup_document():
    doc = Document()
    section = doc.sections[0]
    section.page_width = Cm(21.0)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.2)
    section.bottom_margin = Cm(1.9)
    section.left_margin = Cm(2.25)
    section.right_margin = Cm(2.25)
    section.header_distance = Cm(1.1)
    section.footer_distance = Cm(1.0)
    section.different_first_page_header_footer = True

    normal = doc.styles["Normal"]
    normal.font.name = FONT
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = INK
    normal.paragraph_format.line_spacing = 1.55
    normal.paragraph_format.space_after = Pt(7)
    r_pr = normal.element.get_or_add_rPr()
    r_fonts = r_pr.find(qn("w:rFonts"))
    if r_fonts is None:
        r_fonts = OxmlElement("w:rFonts")
        r_pr.insert(0, r_fonts)
    r_fonts.set(qn("w:ascii"), FONT)
    r_fonts.set(qn("w:hAnsi"), FONT)
    r_fonts.set(qn("w:eastAsia"), FONT)
    r_fonts.set(qn("w:cs"), FONT)

    for name in ("Heading 1", "Heading 2", "Heading 3", "Title"):
        style = doc.styles[name]
        style.font.name = FONT
        style.font.color.rgb = DARK
        r_pr = style.element.get_or_add_rPr()
        r_fonts = r_pr.find(qn("w:rFonts"))
        if r_fonts is None:
            r_fonts = OxmlElement("w:rFonts")
            r_pr.insert(0, r_fonts)
        r_fonts.set(qn("w:ascii"), FONT)
        r_fonts.set(qn("w:hAnsi"), FONT)
        r_fonts.set(qn("w:eastAsia"), FONT)
    return doc


def add_header_footer(doc):
    section = doc.sections[0]
    header = section.header
    p = header.paragraphs[0]
    p.style = doc.styles["Normal"]
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.0
    p.paragraph_format.tab_stops.clear_all()
    p.paragraph_format.tab_stops.add_tab_stop(CONTENT_WIDTH, alignment=WD_TAB_ALIGNMENT.RIGHT)
    run = p.add_run("聆记 LingJi · 用户使用说明书")
    font_run(run, 8.2, False, MUTED)
    run = p.add_run("\tv1.2.0")
    font_run(run, 8.2, False, MUTED)
    set_paragraph_border(p, "bottom", size=4, color="D5E6E8", space=4)

    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("第 ")
    font_run(run, 8.2, False, MUTED)
    add_field(p, "PAGE")
    run = p.add_run(" 页 · 共 ")
    font_run(run, 8.2, False, MUTED)
    add_field(p, "NUMPAGES")
    run = p.add_run(" 页")
    font_run(run, 8.2, False, MUTED)


def add_cover(doc):
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(0)
    spacer.paragraph_format.line_spacing = 0.6
    font_run(spacer.add_run(""), 2)

    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_fixed(table)
    set_table_width(table, CONTENT_WIDTH)
    set_table_borders(table, color="013E47", size=4)
    cell = table.rows[0].cells[0]
    cell.width = CONTENT_WIDTH
    set_row_height(table.rows[0], Cm(9.4))
    shade_cell(cell, "013E47")
    set_cell_margins(cell, top=520, bottom=520, left=560, right=560)
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(26)
    run = p.add_run("LINGJI  ·  USER  GUIDE")
    font_run(run, 9, True, MINT)

    p = cell.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.0
    run = p.add_run("聆记 LingJi")
    font_run(run, 15, False, RGBColor(0xCF, 0xEE, 0xED))

    p = cell.add_paragraph()
    p.paragraph_format.space_after = Pt(20)
    p.paragraph_format.line_spacing = 1.06
    run = p.add_run("用户使用说明书")
    font_run(run, 38, True, WHITE)

    p = cell.add_paragraph()
    p.paragraph_format.space_after = Pt(18)
    run = p.add_run("")
    font_run(run, 2)
    set_paragraph_border(p, "bottom", size=12, color="8AE4DF", space=1)

    p = cell.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.35
    run = p.add_run("课堂实时转写 · AI 纪要 · 随堂问答 · 老师画像")
    font_run(run, 12, False, RGBColor(0xD8, 0xF3, 0xF1))

    p = cell.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    run = p.add_run("适用于 1.2.0 版本  /  2026 年 11 月")
    font_run(run, 9.5, False, RGBColor(0x9A, 0xD3, 0xD0))

    # meta block
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(30)
    p.paragraph_format.space_after = Pt(10)
    run = p.add_run("文档信息")
    font_run(run, 9, True, TEAL)

    meta = [
        ("适用版本", "聆记 LingJi 1.2.0"),
        ("适用对象", "听课学生、个人用户、部署与运维管理员"),
        ("适用环境", "Windows 10 / 11；Chrome 或 Edge；网页版需 Node.js 20.19+"),
        ("最后更新", "2026 年 11 月 24 日"),
    ]
    meta_table = doc.add_table(rows=len(meta), cols=2)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_table.autofit = False
    set_table_fixed(meta_table)
    set_table_width(meta_table, CONTENT_WIDTH)
    set_table_borders(meta_table, none=True)
    widths = (Cm(3.4), Cm(12.95))
    for col, width in enumerate(widths):
        meta_table.columns[col].width = width
    for index, (label, value) in enumerate(meta):
        row = meta_table.rows[index]
        cant_split(row)
        for col, text, color, bold in (
            (0, label, MUTED, False),
            (1, value, INK, False),
        ):
            cell = row.cells[col]
            cell.width = widths[col]
            set_cell_margins(cell, top=40, bottom=40, left=0, right=120)
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.55
            run = p.add_run(text)
            font_run(run, 9.5, bold, color)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(44)
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run("把课堂，变成可以追问的知识。")
    font_run(run, 11, True, DARK)

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    run = p.add_run("请仅将课堂录音与转写用于个人学习记录，尊重老师的知识产权。")
    font_run(run, 8.5, False, MUTED)

    doc.add_page_break()


def add_doc_info_and_toc(doc):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(6)
    run = p.add_run("阅读指南")
    font_run(run, 19, True, DARK)
    set_paragraph_border(p, "bottom", size=10, color="8AE4DF", space=6)

    body_paragraph(
        doc,
        "本手册按实际使用顺序组织：先完成安装、登录和第一堂课，再按需接入大模型与转写服务。"
        "第一次使用建议读完第三章；只关心模型配置的读者可以直接跳到第四章，"
        "需要绕开浏览器语音云或自建转写服务的读者看第五章。",
        space_after=8,
    )
    body_paragraph(
        doc,
        "阅读约定：带 `反引号` 的文字表示界面按钮、菜单项或需要输入的配置值；"
        "表格用于对照参数与排查问题；截图取自 1.2.0 版本，实际界面可能随版本略有调整。",
        size=9.8,
        space_after=16,
    )

    rows = [
        ("第一章", "认识聆记", "产品定位、能力边界、三种使用形态与界面地图"),
        ("第二章", "安装、启动与登录", "安装版、便携版、网页版、注册与启动问题"),
        ("第三章", "基础功能", "录音、转写、纪要、问答、图片、回顾与老师画像"),
        ("第四章", "配置大模型 API", "以 DeepSeek 为例的完整配置、服务商对照与排错"),
        ("第五章", "接入服务端转写模型", "协议要求、云服务、自建 faster-whisper、验收与排错"),
        ("第六章", "数据、隐私与备份", "数据目录、数据流向、备份迁移与删除"),
        ("第七章", "常见问题", "14 个高频问题的直接答案"),
        ("第八章", "附录", "状态速查、术语表、配置速查、版本记录与上线检查清单"),
    ]

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(6)
    run = p.add_run("目录")
    font_run(run, 12.5, True, TEAL)

    table = doc.add_table(rows=len(rows) + 1, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_fixed(table)
    set_table_width(table, CONTENT_WIDTH)
    set_table_borders(table, color="D5E6E8", size=4)
    widths = (Cm(2.0), Cm(4.6), Cm(9.75))
    for col, width in enumerate(widths):
        table.columns[col].width = width
    header = ("章节", "标题", "你会在这里找到")
    for col, text in enumerate(header):
        cell = table.rows[0].cells[col]
        cell.width = widths[col]
        shade_cell(cell, "027789")
        set_cell_margins(cell, top=90, bottom=90)
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.line_spacing = 1.2
        run = p.add_run(text)
        font_run(run, 9, True, WHITE)
    repeat_header(table.rows[0])
    cant_split(table.rows[0])

    for index, (chapter, title, desc) in enumerate(rows, start=1):
        row = table.rows[index]
        cant_split(row)
        for col, text in enumerate((chapter, title, desc)):
            cell = row.cells[col]
            cell.width = widths[col]
            set_cell_margins(cell, top=70, bottom=70)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            if index % 2 == 0:
                shade_cell(cell, "F5FBFC")
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.25
            run = p.add_run(text)
            if col == 0:
                font_run(run, 8.8, True, TEAL)
            elif col == 1:
                font_run(run, 9.4, True, DARK)
            else:
                font_run(run, 9.0, False, MUTED)

    body_paragraph(
        doc,
        "提示：手册中的地址均为示例。实际填写时请替换为你自己的服务商地址、模型名与密钥；"
        "密钥只保存在你运行聆记的机器上。",
        size=9,
        space_after=0,
    )

    add_quick_start(doc)
    # Chapter 1 starts on a new page via its page_break_before setting.


def add_quick_start(doc):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after = Pt(6)
    run = p.add_run("三步开始")
    font_run(run, 12.5, True, TEAL)

    steps = [
        ("01", "安装并登录", "双击安装包并注册本地账户；也可以先用示例课堂体验。"),
        ("02", "开始第一堂课", "首页点麦克风，允许权限后录音与后台转写自动开始。"),
        ("03", "按需接入模型", "在设置中填 DeepSeek API；识别不稳时再启用服务端转写。"),
    ]
    table = doc.add_table(rows=1, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_fixed(table)
    set_table_width(table, CONTENT_WIDTH)
    set_table_borders(table, none=True)
    widths = (Cm(5.45), Cm(5.45), Cm(5.45))
    for col, width in enumerate(widths):
        table.columns[col].width = width

    for col, (number, title, desc) in enumerate(steps):
        cell = table.rows[0].cells[col]
        cell.width = widths[col]
        shade_cell(cell, "F1FAF9")
        set_cell_margins(cell, top=120, bottom=120, left=200, right=160)
        cell.vertical_alignment = WD_ALIGN_VERTICAL.TOP

        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.line_spacing = 1.0
        run = p.add_run(number)
        font_run(run, 15, True, MINT)

        p = cell.add_paragraph()
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.line_spacing = 1.25
        run = p.add_run(title)
        font_run(run, 10, True, DARK)

        p = cell.add_paragraph()
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.line_spacing = 1.4
        run = p.add_run(desc)
        font_run(run, 8.4, False, MUTED)


def set_outline(paragraph, level):
    p_pr = paragraph._p.get_or_add_pPr()
    outline = OxmlElement("w:outlineLvl")
    outline.set(qn("w:val"), str(level))
    _insert_ordered(p_pr, outline, PPR_ORDER)


def add_h1(doc, text):
    p = doc.add_paragraph()
    fmt = p.paragraph_format
    fmt.page_break_before = True
    fmt.space_before = Pt(0)
    fmt.space_after = Pt(16)
    fmt.keep_with_next = True
    run = p.add_run(text)
    font_run(run, 21, True, DARK)
    set_paragraph_border(p, "bottom", size=9, color="8AE4DF", space=7)
    set_outline(p, 0)
    return p


def add_h2(doc, text):
    p = doc.add_paragraph()
    fmt = p.paragraph_format
    fmt.space_before = Pt(15)
    fmt.space_after = Pt(7)
    fmt.keep_with_next = True
    fmt.left_indent = Cm(0.28)
    run = p.add_run(text)
    font_run(run, 13.2, True, TEAL)
    set_paragraph_border(p, "left", size=18, color="8AE4DF", space=7)
    set_outline(p, 1)
    return p


def add_h3(doc, text):
    p = doc.add_paragraph()
    fmt = p.paragraph_format
    fmt.space_before = Pt(9)
    fmt.space_after = Pt(4)
    fmt.keep_with_next = True
    run = p.add_run(text)
    font_run(run, 11, True, DARK)
    set_outline(p, 2)
    return p


def add_bullets(doc, items, numbered=False):
    for index, item in enumerate(items, start=1):
        p = doc.add_paragraph()
        fmt = p.paragraph_format
        fmt.left_indent = Cm(0.78)
        fmt.first_line_indent = Cm(-0.62)
        fmt.space_before = Pt(0)
        fmt.space_after = Pt(3.5)
        fmt.line_spacing = 1.5
        fmt.tab_stops.add_tab_stop(Cm(0.78))
        marker = f"{index}.\t" if numbered else "•\t"
        run = p.add_run(marker)
        font_run(run, 10.5, True, TEAL if not numbered else TEAL)
        add_inline(p, item)


def add_code(doc, lines):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_fixed(table)
    set_table_width(table, CONTENT_WIDTH)
    set_table_borders(table, color="DCE8E9", size=4)
    cant_split(table.rows[0])
    cell = table.rows[0].cells[0]
    cell.width = CONTENT_WIDTH
    shade_cell(cell, "F4F8F8")
    set_cell_margins(cell, top=140, bottom=140, left=220, right=180)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1.12
    for index, line in enumerate(lines):
        if index:
            p.add_run().add_break()
        run = p.add_run(line if line else " ")
        font_run(run, 8.3, False, RGBColor(0x1B, 0x3A, 0x3F), MONO)

    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_before = Pt(0)
    spacer.paragraph_format.space_after = Pt(3)
    spacer.paragraph_format.line_spacing = 0.5
    font_run(spacer.add_run(""), 4)


def add_image(doc, source: Path, alt: str):
    if not source.exists():
        body_paragraph(doc, f"[缺少图片：{source.name}]", size=9, align=WD_ALIGN_PARAGRAPH.LEFT)
        return
    ASSETS.mkdir(parents=True, exist_ok=True)
    target = ASSETS / (source.stem + ".jpg")
    with Image.open(source) as image:
        image = image.convert("RGB")
        max_width = 1400
        if image.width > max_width:
            ratio = max_width / image.width
            image = image.resize((max_width, int(image.height * ratio)), Image.LANCZOS)
        image.save(target, "JPEG", quality=88, optimize=True)
        pixel_w, pixel_h = image.size

    width = 13.2
    height = width * pixel_h / pixel_w
    if height > 9.6:
        height = 9.6
        width = height * pixel_w / pixel_h

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.keep_with_next = True
    p.add_run().add_picture(str(target), width=Cm(width))

    caption = doc.add_paragraph()
    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption.paragraph_format.space_after = Pt(13)
    caption.paragraph_format.line_spacing = 1.25
    run = caption.add_run(alt)
    font_run(run, 8.6, False, MUTED)


def add_callout(doc, label: str, items):
    warm = label == "注意："
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_fixed(table)
    set_table_width(table, CONTENT_WIDTH)
    set_table_borders(table, none=True)
    cell = table.rows[0].cells[0]
    cell.width = CONTENT_WIDTH
    shade_cell(cell, "FFF7EF" if warm else "F1FAF9")
    set_cell_margins(cell, top=150, bottom=150, left=260, right=240)

    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.3
    run = p.add_run(label if warm else label)
    font_run(run, 9.5, True, WARM if warm else TEAL)

    for item in items:
        p = cell.add_paragraph()
        p.paragraph_format.left_indent = Cm(0.42)
        p.paragraph_format.first_line_indent = Cm(-0.42)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.line_spacing = 1.45
        run = p.add_run("· ")
        font_run(run, 9.4, True, WARM if warm else TEAL)
        add_inline(p, item, 9.4)


def add_label(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.left_indent = Cm(0.28)
    run = p.add_run(text)
    font_run(run, 10, True, TEAL)
    set_paragraph_border(p, "left", size=18, color="8AE4DF", space=6)


# ------------------------------------------------------------------- table render


def compute_widths(rows):
    cols = len(rows[0])
    scores = []
    for col in range(cols):
        longest = 0.0
        total = 0.0
        for row in rows:
            if col >= len(row):
                continue
            text = re.sub(r"\*\*|`", "", row[col])
            length = display_len(text)
            longest = max(longest, length)
            total += length
        average = total / max(1, len(rows))
        score = 0.68 * longest + 0.32 * average
        scores.append(max(score, 5.5))

    # Convert character units to approximate cm (CJK ~0.34cm, ASCII ~0.17cm).
    cm_scores = [score * 0.19 + 0.45 for score in scores]
    total_cm = sum(cm_scores)
    available = 16.35
    widths = [max(1.7, value / total_cm * available) for value in cm_scores]

    if cols >= 2 and widths[0] > available * 0.55:
        widths[0] = available * 0.45
    scale = available / sum(widths)
    widths = [value * scale for value in widths]

    # Avoid awkward wrapping of short labels such as "DeepSeek" or "API 地址".
    if cols >= 3 and widths[0] < 2.15:
        deficit = 2.15 - widths[0]
        widths[0] = 2.15
        widest = max(range(1, cols), key=lambda i: widths[i])
        widths[widest] = max(1.7, widths[widest] - deficit)

    return [Cm(round(value, 2)) for value in widths]


def add_table(doc, rows):
    cols = len(rows[0])
    rows = [row + [""] * (cols - len(row)) for row in rows]
    widths = compute_widths(rows)

    table = doc.add_table(rows=len(rows), cols=cols)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_fixed(table)
    set_table_width(table, CONTENT_WIDTH)
    set_table_borders(table, color="D5E6E8", size=4)
    for col, width in enumerate(widths):
        table.columns[col].width = width

    body_size = 9.1 if cols >= 4 else 9.3

    for row_index, row in enumerate(rows):
        tr = table.rows[row_index]
        cant_split(tr)
        for col, raw in enumerate(row):
            cell = tr.cells[col]
            cell.width = widths[col]
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            is_header = row_index == 0
            if is_header:
                shade_cell(cell, "027789")
                set_cell_margins(cell, top=70, bottom=70, left=150, right=130)
            else:
                if row_index % 2 == 0:
                    shade_cell(cell, "F5FBFC")
                set_cell_margins(cell, top=60, bottom=60, left=150, right=130)
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.25
            text = breakable(raw)
            if is_header:
                run = p.add_run(text)
                font_run(run, 8.9, True, WHITE)
                repeat_header(tr)
            elif col == 0:
                add_inline(p, text, 9.2, DARK, True)
            else:
                add_inline(p, text, body_size, INK)

    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_before = Pt(0)
    spacer.paragraph_format.space_after = Pt(0)
    spacer.paragraph_format.line_spacing = 0.5
    font_run(spacer.add_run(""), 4)


# ----------------------------------------------------------------------- build


def build():
    text = MD_FILE.read_text(encoding="utf-8")
    blocks = parse_blocks(text.splitlines())

    doc = setup_document()
    add_header_footer(doc)
    add_cover(doc)
    add_doc_info_and_toc(doc)

    for index, block in enumerate(blocks):
        kind = block["type"]
        if kind == "h1":
            add_h1(doc, block["text"])
        elif kind == "h2":
            add_h2(doc, block["text"])
        elif kind == "h3":
            add_h3(doc, block["text"])
        elif kind == "p":
            paragraph = body_paragraph(doc, block["text"])
            following_block = blocks[index + 1] if index + 1 < len(blocks) else None
            if (
                block["text"].rstrip().endswith(("：", ":"))
                and following_block
                and following_block["type"] in ("ul", "ol", "table")
            ):
                paragraph.paragraph_format.keep_with_next = True
        elif kind == "ul":
            if index > 0 and blocks[index - 1]["type"] == "label":
                continue
            add_bullets(doc, block["items"], numbered=False)
        elif kind == "ol":
            add_bullets(doc, block["items"], numbered=True)
        elif kind == "label":
            following = blocks[index + 1] if index + 1 < len(blocks) else None
            if following and following["type"] == "ul":
                add_callout(doc, block["text"], following["items"])
            else:
                add_label(doc, block["text"])
        elif kind == "code":
            add_code(doc, block["lines"])
        elif kind == "image":
            add_image(doc, (MD_FILE.parent / block["path"]).resolve(), block["alt"])
        elif kind == "table":
            add_table(doc, block["rows"])

    doc.core_properties.title = "聆记 LingJi 用户使用说明书"
    doc.core_properties.subject = "实时听课、后台转写、AI 纪要、随堂问答与服务端转写配置"
    doc.core_properties.author = "聆记 LingJi"
    doc.core_properties.keywords = "聆记, 用户手册, DeepSeek, API, 转写, ASR"
    doc.core_properties.comments = "基于聆记 1.2.0 编写"

    # Update fields (page numbers) when the document is opened in Word.
    settings = doc.settings.element
    update = settings.find(qn("w:updateFields"))
    if update is None:
        update = OxmlElement("w:updateFields")
        settings.append(update)
    update.set(qn("w:val"), "true")

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT_FILE)
    print(f"saved: {OUT_FILE}")
    print(f"blocks: {len(blocks)}")


if __name__ == "__main__":
    build()
