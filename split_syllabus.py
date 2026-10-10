#!/usr/bin/env python3
"""
B.Tech Autonomous Curriculum Syllabus Splitter
Splits a combined 4-year B.Tech syllabus PDF into standalone, per-subject PDFs
organized by semester folder, with an index CSV and a master ZIP archive.
"""

import os
import sys
import re
import csv
import json
import shutil
import zipfile
import argparse
from pathlib import Path
import fitz  # PyMuPDF
import pdfplumber

ROMAN_MAP = {
    'I': 1, 'II': 2, 'III': 3, 'IV': 4,
    'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8
}

IGNORED_CODES = {
    'PAGE01', 'PAGE02', 'TABLE01', 'ISO9001', 'NBA2022', 'AICTE2020',
    'JNTUK2020', 'GVPCEW01', 'GVPCEW', 'R2020', 'R2024', 'R2022', 'TOTAL',
    'ANNEXURE', 'COURSE'
}

CODE_REGEX = re.compile(
    r'\b(?:[0-9]{2}[A-Z]{2,4}[0-9]{2,4}[A-Z0-9]*|[A-Z]{2,5}[0-9]{3,4}[A-Z0-9]*|[0-9]{2}[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{2}|[0-9]{2}[A-Z]{2}[IVX0-9]{2,4}[A-Z0-9]*|[R|A][0-9]{2}[A-Z0-9_-]{4,10})\b',
    re.IGNORECASE
)

def slugify(text: str) -> str:
    """Convert text into clean title slug for filenames."""
    text = re.sub(r'^[-–:]\s*', '', text)
    text = re.sub(r'\(?(?:Common to|Professional Elective|Open Elective|Mandatory Course|Basic Science|Engineering Science)[^\)]*\)?', '', text, flags=re.IGNORECASE)
    text = re.sub(r'[^a-zA-Z0-9\s_-]', ' ', text)
    words = [w.capitalize() if w.isupper() and len(w) > 1 else w for w in text.split()]
    slug = '_'.join(words)
    return slug[:60] if slug else 'Syllabus'

def clean_course_code(raw: str) -> str:
    """Extract standard clean course code and strip adjacent tokens."""
    code = raw.strip().upper()
    code = re.sub(r'[-_]?L[-–]?T[-–]?P.*$', '', code, flags=re.IGNORECASE)
    
    m10 = re.match(r'^([0-9]{2}[A-Z]{2,4}[0-9]{2}[A-Z]{2}[0-9]{2})', code)
    if m10:
        return m10.group(1).upper()
        
    m8 = re.match(r'^([0-9]{2}[A-Z]{2,4}[0-9]{4})', code)
    if m8:
        return m8.group(1).upper()
        
    if code.endswith('L') and len(code) > 8:
        code = code[:-1]
    return code

def extract_page_text_with_gap_reconstruction(page) -> str:
    """
    Step 1: Extracts page-level text preserving character and word positions.
    Reconstructs real words by grouping characters whose horizontal gap is small,
    and inserting a space when the gap exceeds ~2x typical intra-word character spacing.
    Handles wide letter-spaced headings like 'C A L C U L U S' or 'D A T A  S T R U C T U R E S'.
    """
    try:
        raw_json = json.loads(page.get_text("rawjson"))
    except Exception:
        raw_text = page.get_text("text") or ""
        return re.sub(r'(\b[A-Z])\s+(?=[A-Z]\b)', r'\1', raw_text)

    reconstructed_lines = []
    
    for block in raw_json.get("blocks", []):
        if block.get("type") != 0:  # text block
            continue
            
        for line in block.get("lines", []):
            line_chars = []
            for span in line.get("spans", []):
                for char_info in span.get("chars", []):
                    c = char_info.get("c", "")
                    bbox = char_info.get("bbox", [0, 0, 0, 0])
                    line_chars.append({"char": c, "bbox": bbox, "size": span.get("size", 10)})
            
            if not line_chars:
                continue

            # Calculate horizontal gaps between consecutive non-space characters
            gaps = []
            for i in range(len(line_chars) - 1):
                c1 = line_chars[i]
                c2 = line_chars[i + 1]
                if c1["char"] != " " and c2["char"] != " ":
                    gap = c2["bbox"][0] - c1["bbox"][2]
                    if 0 < gap < 50:
                        gaps.append(gap)
            
            # Typical intra-character gap (median or default ~1.5pt)
            typical_gap = sorted(gaps)[len(gaps) // 2] if gaps else 1.5
            space_threshold = max(typical_gap * 2.2, 3.5)

            # Build line text
            line_str = []
            for i in range(len(line_chars)):
                curr_char = line_chars[i]
                line_str.append(curr_char["char"])
                
                if i < len(line_chars) - 1:
                    next_char = line_chars[i + 1]
                    gap = next_char["bbox"][0] - curr_char["bbox"][2]
                    
                    # Insert space if gap exceeds threshold and current char is not already space
                    if curr_char["char"] != " " and next_char["char"] != " ":
                        if gap >= space_threshold:
                            line_str.append(" ")

            reconstructed_line = "".join(line_str).strip()
            # Collapse spaced-out capital letters e.g. "C A L C U L U S" -> "CALCULUS"
            reconstructed_line = re.sub(r'(\b[A-Z])\s+(?=[A-Z]\b)', r'\1', reconstructed_line)
            if reconstructed_line:
                reconstructed_lines.append(reconstructed_line)

    if not reconstructed_lines:
        raw_text = page.get_text("text") or ""
        return re.sub(r'(\b[A-Z])\s+(?=[A-Z]\b)', r'\1', raw_text)

    return "\n".join(reconstructed_lines)

def is_structure_table_page(page_text: str) -> bool:
    """
    Returns True if the page is a Scheme of Instruction / Course Structure table
    listing multiple subjects in rows rather than a single detailed subject syllabus.
    """
    codes = set(re.findall(CODE_REGEX, page_text))
    valid_codes = {c.upper() for c in codes if c.upper() not in IGNORED_CODES}
    
    has_detailed_units = bool(re.search(r'(?:UNIT\s*[-–:]?\s*(?:I|II|III|IV|V|1|2|3|4|5)\b|Course\s*Outcomes?\s*[:\-–]|Course\s*Objectives?\s*[:\-–])', page_text, re.IGNORECASE))
    
    if len(valid_codes) >= 3 and not has_detailed_units:
        return True
        
    if re.search(r'(?:COURSE\s*STRUCTURE|SCHEME\s*OF\s*INSTRUCTION|CURRICULUM\s*STRUCTURE|SEMESTER\s*SCHEME|INSTRUCTION\s*&\s*EVALUATION)', page_text, re.IGNORECASE) and not has_detailed_units:
        return True
        
    return False

def extract_frontmatter_lookup(pdf_path: str):
    """
    Step 3: Builds clean lookup of course_code -> title -> semester -> category
    from front-matter structure tables using pdfplumber table extraction.
    """
    lookup = {}
    current_year = 1
    current_sem = 1
    current_sem_label = 'I_Year_I_Semester'

    with pdfplumber.open(pdf_path) as plum:
        max_scan = min(len(plum.pages), 30)
        for p_idx in range(max_scan):
            page = plum.pages[p_idx]
            text = page.extract_text() or ''
            
            # Stop front-matter scan if detailed syllabus begins
            if re.search(r'(?:Course\s*Code|COURSE\s*CODE)\s*[:\-–]\s*[A-Za-z0-9_-]{3,20}', text, re.IGNORECASE) and not is_structure_table_page(text):
                break
                
            # Detect semester header
            sem_m = re.search(r'(?:([IVX]+|[1-4])\s*(?:B\.?\s*TECH|YEAR))\s*[-–,\s]+\s*([IVX]+|[1-2])\s*(?:SEMESTER|SEM)', text, re.IGNORECASE)
            if sem_m:
                y = ROMAN_MAP.get(sem_m.group(1).upper()) or int(sem_m.group(1))
                s = ROMAN_MAP.get(sem_m.group(2).upper()) or int(sem_m.group(2))
                current_year = y
                current_sem = (y - 1) * 2 + s
                roman_y = ['I', 'II', 'III', 'IV'][current_year - 1]
                roman_s = ['I', 'II'][(current_sem - 1) % 2]
                current_sem_label = f"{roman_y}_Year_{roman_s}_Semester"

            # Extract tables
            tables = page.extract_tables()
            for tbl in tables:
                for row in tbl:
                    if not row:
                        continue
                    row_text = ' '.join([str(c or '') for c in row])
                    code_m = re.search(CODE_REGEX, row_text)
                    if code_m:
                        code = clean_course_code(code_m.group(0))
                        if code in IGNORED_CODES:
                            continue
                            
                        cat_m = re.search(r'\b(BS|ES|HSS|HS|PC|PE|OE|SC|MC|PR|PROJ|PCC|ESC|BSC|HSMC|OEC|PEC)\b', row_text, re.IGNORECASE)
                        category = cat_m.group(1).upper() if cat_m else 'PC'
                        
                        # Find title from columns
                        title = ''
                        for cell in row:
                            cell_s = str(cell or '').strip()
                            if cell_s and not re.search(CODE_REGEX, cell_s) and len(cell_s) > 3 and not re.match(r'^[0-9\s\.\-–]+$', cell_s):
                                if not re.search(r'\b(INTERNAL|EXTERNAL|TOTAL|CREDITS|CREDIT|MARKS|THEORY|PRACTICAL)\b', cell_s, re.IGNORECASE):
                                    title = cell_s
                                    break
                                    
                        if not title:
                            # fallback: remove code and numbers from row_text
                            title = re.sub(CODE_REGEX, '', row_text)
                            title = re.sub(r'\b(BS|ES|HSS|HS|PC|PE|OE|SC|MC|PR|PROJ|PCC|ESC|BSC|HSMC|OEC|PEC)\b', '', title, flags=re.IGNORECASE)
                            title = re.sub(r'\b\d+(?:\.\d+)?\b', '', title).strip()

                        title = re.sub(r'\s+', ' ', title).strip()
                        if title and code not in lookup:
                            folder = current_sem_label
                            if category in ('PE', 'PEC'):
                                folder = 'Professional_Electives'
                            elif category in ('OE', 'OEC'):
                                folder = 'Open_Electives'
                                
                            lookup[code] = {
                                'course_code': code,
                                'course_title': title,
                                'semester': current_sem_label.replace('_', ' '),
                                'semester_folder': folder,
                                'category': category
                            }
    return lookup

def detect_subject_boundaries(pdf_path: str, lookup: dict):
    """
    Steps 1 & 2: Scans pages, extracts text with letter-spacing normalization,
    and identifies subject start boundaries on pages containing 'Course Code:'.
    Returns list of course objects with start_page, end_page, total_pages.
    """
    doc = fitz.open(pdf_path)
    total_pdf_pages = len(doc)
    courses = []
    current_course = None
    current_pages = []

    print(f"Total Document Pages: {total_pdf_pages}")

    for page_idx in range(total_pdf_pages):
        page = doc[page_idx]
        page_number = page_idx + 1
        
        # Step 1: Text extraction with character spacing & horizontal gap thresholding
        normalized_text = extract_page_text_with_gap_reconstruction(page)

        # Check if page is a multi-course structure table
        if is_structure_table_page(normalized_text):
            continue

        # Step 2: Detect "Course Code:" marker on detailed syllabus page
        code_m = re.search(r'(?:Course\s*Code|COURSE\s*CODE|Course\s*code|COURSE\s*NO|Course\s*No|Sub(?:ject)?\s*Code)\s*[:\-–]?\s*([A-Za-z0-9_-]{3,25})', normalized_text, re.IGNORECASE)
        
        detected_code = None
        if code_m:
            detected_code = clean_course_code(code_m.group(1))
            if detected_code in IGNORED_CODES:
                detected_code = None

        if detected_code and (current_course is None or detected_code != current_course['course_code']):
            if current_course is not None:
                # Finalize previous course
                current_course['end_page'] = page_number - 1
                current_course['end_page_idx'] = page_idx - 1
                current_course['total_pages'] = current_course['end_page'] - current_course['start_page'] + 1
                current_course['pages'] = list(current_pages)
                courses.append(current_course)

                print(f"  [+] Finalized {current_course['course_code']}: Pages {current_course['start_page']}–{current_course['end_page']} ({current_course['total_pages']} pages)")

            # Extract title from detailed page or lookup
            meta = lookup.get(detected_code, {})
            title = meta.get('course_title')
            if not title:
                # Find position of Course Code on page
                code_pos = normalized_text.find(detected_code)
                prefix_text = normalized_text[:code_pos] if code_pos > 0 else normalized_text[:400]
                prefix_lines = [l.strip() for l in prefix_text.split('\n') if len(l.strip()) >= 3]
                
                # Search backwards from Course Code
                for l in reversed(prefix_lines):
                    if re.search(r'^(gayatri\s*vidya|autonomous|approved|permanently|madhurawada|visakhapatnam|annexure|course\s*code|department|b\.?\s*tech|scheme|regulations|curriculum|page\s*\d+|\d+$)', l, re.IGNORECASE):
                        continue
                    if re.match(r'^\(?(?:Open\s*Elective|Professional\s*Elective|Common\s*to|Mandatory|Basic\s*Science|Engineering\s*Science|Humanities|Core)[^\)]*\)?$', l, re.IGNORECASE):
                        continue
                    title = re.sub(r'^[-–:]\s*', '', l).strip()
                    break
                    
                if not title or len(title) < 3:
                    # search lines immediately after code
                    after_lines = [l.strip() for l in normalized_text[code_pos + len(detected_code):].split('\n') if len(l.strip()) >= 3]
                    for l in after_lines[:6]:
                        if re.search(r'^(course\s*)?(code|title|category|l\s*[-:]|p\s*[-:]|credits|hours|marks|l-t-p|unit|course\s*outcomes)', l, re.IGNORECASE):
                            continue
                        if re.search(r'^(gayatri\s*vidya|autonomous|department|annexure)', l, re.IGNORECASE):
                            continue
                        title = re.sub(r'^(course\s*name|title|subject\s*name)\s*[:\-–]?\s*', '', l, flags=re.IGNORECASE).strip()
                        break

            if not title or len(title) < 2:
                title = f"Course {detected_code}"

            title = re.sub(r'\s*\(?(?:Common to|Professional Elective|Open Elective|Mandatory Course).*$', '', title, flags=re.IGNORECASE).strip()

            folder = meta.get('semester_folder', 'I_Year_I_Semester')
            category = meta.get('category', 'PC')
            semester = meta.get('semester', 'I Year I Semester')

            current_course = {
                'course_code': detected_code,
                'course_title': title,
                'semester': semester,
                'semester_folder': folder,
                'category': category,
                'start_page': page_number,
                'start_page_idx': page_idx,
                'end_page': None,
                'end_page_idx': None,
                'total_pages': None,
                'pages': []
            }
            current_pages = [page_number]
            print(f"Page {page_number:03d} -> DETECTED Course Code: {detected_code} | {title}")
        else:
            if current_course is not None:
                current_pages.append(page_number)

    # Finalize final subject
    if current_course is not None:
        current_course['end_page'] = total_pdf_pages
        current_course['end_page_idx'] = total_pdf_pages - 1
        current_course['total_pages'] = current_course['end_page'] - current_course['start_page'] + 1
        current_course['pages'] = list(current_pages)
        courses.append(current_course)
        print(f"  [+] Finalized Final Course {current_course['course_code']}: Pages {current_course['start_page']}–{current_course['end_page']} ({current_course['total_pages']} pages)")

    doc.close()
    return courses

def split_and_export(pdf_path: str, courses: list, output_dir: str):
    """
    Steps 4 & 5: Slices exact page ranges using PyMuPDF page copying,
    saves into semester folders, generates course_index.csv and master ZIP archive.
    """
    out_path = Path(output_dir)
    if out_path.exists():
        shutil.rmtree(out_path)
    out_path.mkdir(parents=True, exist_ok=True)

    src_doc = fitz.open(pdf_path)
    index_rows = []

    print("\n--- Slicing and Exporting Per-Subject PDFs ---")
    for course in courses:
        code = course['course_code']
        title = course['course_title']
        slug = slugify(title)
        folder = course['semester_folder']
        filename = f"{code}_{slug}.pdf"
        
        target_folder = out_path / folder
        target_folder.mkdir(parents=True, exist_ok=True)
        target_file = target_folder / filename
        
        # Slice original PDF pages (pixel-for-pixel preservation)
        sub_doc = fitz.open()
        sub_doc.insert_pdf(src_doc, from_page=course['start_page_idx'], to_page=course['end_page_idx'])
        sub_doc.save(str(target_file))
        sub_doc.close()

        rel_path = f"{folder}/{filename}"
        index_rows.append({
            'course_code': code,
            'course_title': title,
            'semester': course['semester'],
            'category': course['category'],
            'start_page': course['start_page'],
            'end_page': course['end_page'],
            'total_pages': course['total_pages'],
            'file_path': rel_path
        })
        print(f"  Saved: {rel_path} (Pages {course['start_page']}–{course['end_page']})")

    src_doc.close()

    # Emit course_index.csv
    csv_file = out_path / "course_index.csv"
    with open(csv_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=[
            'course_code', 'course_title', 'semester', 'category',
            'start_page', 'end_page', 'total_pages', 'file_path'
        ])
        writer.writeheader()
        writer.writerows(index_rows)
    print(f"\nCreated: {csv_file}")

    # Emit course_index.json
    json_file = out_path / "course_index.json"
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(index_rows, f, indent=2)
    print(f"Created: {json_file}")

    # Sample rasterization of page 1 for visual preview
    preview_dir = out_path / "previews"
    preview_dir.mkdir(parents=True, exist_ok=True)
    sample_courses = courses[:min(3, len(courses))]
    print("\n--- Generating Visual Verification Previews (Page 1) ---")
    for sc in sample_courses:
        sample_file = out_path / sc['semester_folder'] / f"{sc['course_code']}_{slugify(sc['course_title'])}.pdf"
        if sample_file.exists():
            s_doc = fitz.open(str(sample_file))
            if len(s_doc) > 0:
                pix = s_doc[0].get_pixmap(dpi=150)
                preview_png = preview_dir / f"{sc['course_code']}_page1_preview.png"
                pix.save(str(preview_png))
                print(f"  Rasterized preview: {preview_png}")
            s_doc.close()

    # Create ZIP archive
    zip_filename = out_path.with_suffix('.zip')
    with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(out_path):
            for file in files:
                abs_file = Path(root) / file
                arc_name = abs_file.relative_to(out_path.parent)
                zipf.write(abs_file, arc_name)
    print(f"\nCreated Master Archive: {zip_filename} ({os.path.getsize(zip_filename):,} bytes)")

    return zip_filename, index_rows

def sanity_check(courses: list, lookup: dict):
    """
    Step 6: Sanity checks:
    - Page range non-zero and reasonable.
    - Outlier detection (e.g. > 10 pages).
    - Summary validation table.
    """
    print("\n" + "=" * 90)
    print("SANITY CHECK & BOUNDARY VALIDATION SUMMARY")
    print("=" * 90)
    print(f"{'Course Code':<12} | {'Course Title':<38} | {'Start':<6} | {'End':<6} | {'Total':<6} | {'Status'}")
    print("-" * 90)

    warnings = []
    for c in courses:
        status = "OK"
        if c['total_pages'] <= 0:
            status = "ERROR: 0 pages"
            warnings.append(f"{c['course_code']}: 0 pages")
        elif c['total_pages'] > 8:
            status = "FLAG: >8 pages"
            warnings.append(f"{c['course_code']}: {c['total_pages']} pages (Review)")

        print(f"{c['course_code']:<12} | {c['course_title'][:38]:<38} | {c['start_page']:<6} | {c['end_page']:<6} | {c['total_pages']:<6} | {status}")

    print("=" * 90)
    print(f"Total Subjects Extracted: {len(courses)}")
    if lookup:
        print(f"Total Front-Matter Catalog Subjects: {len(lookup)}")
    if warnings:
        print(f"\nFlags for Review ({len(warnings)}):")
        for w in warnings:
            print(f"  * {w}")
    else:
        print("All extracted subjects passed sanity checks with clean boundaries!")

def main():
    parser = argparse.ArgumentParser(description="Split B.Tech 4-Year Curriculum Syllabus into Per-Subject PDFs")
    parser.add_argument("pdf_path", help="Path to the combined syllabus PDF file")
    parser.add_argument("-o", "--output", default="split_syllabus_output", help="Output directory path")
    args = parser.parse_args()

    if not os.path.exists(args.pdf_path):
        print(f"Error: File not found at {args.pdf_path}")
        sys.exit(1)

    print(f"--- Starting Autonomous Syllabus Splitting ---")
    print(f"Input PDF: {args.pdf_path}")
    print(f"Output Directory: {args.output}")

    # 1. Front-matter lookup
    print("\n[Step 3] Extracting Front-Matter Course Structure...")
    lookup = extract_frontmatter_lookup(args.pdf_path)
    print(f"Found {len(lookup)} courses in structure tables.")

    # 2. Page-by-page boundary detection
    print("\n[Steps 1 & 2] Detecting Detailed Subject Boundaries...")
    courses = detect_subject_boundaries(args.pdf_path, lookup)

    if not courses:
        print("Error: No detailed syllabus sections detected.")
        sys.exit(1)

    # 3. Sanity check
    sanity_check(courses, lookup)

    # 4. Slicing & ZIP export
    zip_path, _ = split_and_export(args.pdf_path, courses, args.output)
    print(f"\n Success! All split subject PDFs and course_index.csv generated in: {args.output}")
    print(f" Master ZIP file: {zip_path}")

if __name__ == "__main__":
    main()
