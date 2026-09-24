import { Editor } from "@tiptap/core";
import { extensions } from "./extensions";

it("preserves Word alignment, spacing, font and partial bold through editor JSON", () => {
  const editor = new Editor({ extensions, content: '<p style="text-align:justify;margin-top:12pt;margin-left:20pt;text-indent:24pt;line-height:1.5"><span style="font-family:Times New Roman;font-size:12pt">I – Exonerar <strong>ISABELE DIAS DUTRA</strong>, matrícula 6003804.</span></p><p style="text-align:center;margin-top:48pt">RESOLVE:</p>' });
  const json = editor.getJSON();
  editor.commands.setContent(json);
  const html = editor.getHTML();
  expect(html).toContain("text-align: justify");
  expect(html).toContain("margin-top: 12pt");
  expect(html).toContain("margin-left: 20pt");
  expect(html).toContain("text-indent: 24pt");
  expect(html).toContain("font-size: 12pt");
  expect(html).toContain("<strong>ISABELE DIAS DUTRA</strong>");
  expect(editor.getText()).toContain("matrícula 6003804");
  editor.destroy();
});
