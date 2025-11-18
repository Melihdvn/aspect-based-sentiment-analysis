import sys
import json
from pathlib import Path
from docx import Document


def replace_in_paragraph(paragraph, replacements):
    for key, val in replacements.items():
        if key in paragraph.text:
            inline = paragraph.runs
            for i in range(len(inline)):
                inline[i].text = inline[i].text.replace(key, val)


def replace_in_table(table, replacements):
    for row in table.rows:
        for cell in row.cells:
            for p in cell.paragraphs:
                replace_in_paragraph(p, replacements)


def replace_all(doc, replacements):
    for p in doc.paragraphs:
        replace_in_paragraph(p, replacements)
    for t in doc.tables:
        replace_in_table(t, replacements)


def main():
    if len(sys.argv) < 4:
        print("Kullanım: python fill_template.py <template.docx> <config.json> <output.docx>")
        sys.exit(1)

    template_path = Path(sys.argv[1])
    config_path = Path(sys.argv[2])
    output_path = Path(sys.argv[3])

    if not template_path.exists():
        print(f"Şablon bulunamadı: {template_path}")
        sys.exit(2)
    if not config_path.exists():
        print(f"Config bulunamadı: {config_path}")
        sys.exit(3)

    with config_path.open('r', encoding='utf-8') as f:
        cfg = json.load(f)

    # Replacements should be like {"{{PROJECT_TITLE}}": "..."}
    replacements = {str(k): str(v) for k, v in cfg.items()}

    doc = Document(str(template_path))
    replace_all(doc, replacements)
    doc.save(str(output_path))
    print(f"Oluşturuldu: {output_path}")


if __name__ == '__main__':
    main()

