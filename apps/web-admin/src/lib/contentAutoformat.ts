function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isEmptyLine(line: string): boolean {
  return !line || !line.trim();
}

function isBulletLine(line: string): boolean {
  return /^[-•*]\s+/.test(line.trim());
}

function isOrderedLine(line: string): boolean {
  return /^\d+[\.)]\s+/.test(line.trim());
}

function isTitleLine(line: string): boolean {
  const value = line.trim();
  if (!value || value.length > 90) return false;
  if (/[.!?]$/.test(value)) return false;
  const letters = value.replace(/[^A-Za-zÀ-ÿ]/g, "");
  return letters.length >= 6 && letters === letters.toUpperCase();
}

function isHeadingLine(line: string): boolean {
  const value = line.trim();
  if (!value || value.length > 120) return false;
  const letters = value.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 4) return false;
  return letters === letters.toUpperCase() || (/^[A-ZÀ-Ü0-9 ,./()\-–:]+$/.test(value) && value.length <= 60);
}

function isTableBlock(lines: string[]): boolean {
  return lines.length > 1 && lines.every((line) => line.includes("\t") && line.split("\t").filter(Boolean).length >= 2);
}

function tableToHtml(lines: string[]): string {
  const rows = lines.map((line) => line.split("\t").map((cell) => cell.trim()));
  const columnCount = Math.max(...rows.map((row) => row.length));
  const htmlRows = rows
    .map((row) => {
      const cells = Array.from({ length: columnCount }, (_, index) => {
        const value = escapeHtml(row[index] ?? "").replace(/\n/g, "<br>");
        return `<td><p>${value || "<br>"}</p></td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<table><tbody>${htmlRows}</tbody></table>`;
}

function listToHtml(lines: string[], ordered: boolean): string {
  const tag = ordered ? "ol" : "ul";
  const items = lines
    .map((line) => line.trim().replace(ordered ? /^\d+[\.)]\s+/ : /^[-•*]\s+/, ""))
    .filter(Boolean)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  return `<${tag}>${items}</${tag}>`;
}

function paragraphToHtml(lines: string[]): string {
  return `<p>${escapeHtml(lines.join("\n")).replace(/\n/g, "<br>")}</p>`;
}

export function plainTextToStructuredHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "<p></p>";

  const blocks = normalized.split(/\n{2,}/);
  const output: string[] = [];
  let titleConsumed = false;

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trimEnd()).filter((line) => !isEmptyLine(line));
    if (lines.length === 0) continue;

    if (isTableBlock(lines)) {
      output.push(tableToHtml(lines));
      continue;
    }

    if (lines.every(isBulletLine)) {
      output.push(listToHtml(lines, false));
      continue;
    }

    if (lines.every(isOrderedLine)) {
      output.push(listToHtml(lines, true));
      continue;
    }

    if (!titleConsumed && lines.length === 1 && isTitleLine(lines[0])) {
      output.push(`<h1>${escapeHtml(lines[0])}</h1>`);
      titleConsumed = true;
      continue;
    }

    if (lines.length === 1 && isHeadingLine(lines[0])) {
      output.push(`<h2>${escapeHtml(lines[0])}</h2>`);
      continue;
    }

    output.push(paragraphToHtml(lines));
  }

  return output.join("") || "<p></p>";
}

export function autoformatHtml(html: string): string {
  const clean = html.trim();
  if (!clean) return "<p></p>";
  if (!/<(p|div|h[1-6]|ul|ol|table|blockquote|pre|img|figure|section|article)[\s>]/i.test(clean)) {
    return plainTextToStructuredHtml(clean);
  }
  return clean;
}
