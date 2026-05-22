import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { Project, GeneratedScopeResult } from "../src/types.js";

export async function buildDocxBuffer(project: Project, scope: GeneratedScopeResult): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // TITLE
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          children: [
            new TextRun({
              text: "SEO Scope of Work (План работ)",
              bold: true,
              size: 36, // 18pt
              color: "1A365D", // Dark navy
              font: "Arial"
            })
          ]
        }),

        // PROJECT METADATA
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: "Проект: ", bold: true, font: "Arial" }),
            new TextRun({ text: `${project.name} (${project.site_url || 'site.ru'})`, font: "Arial" })
          ]
        }),
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: "Тип сайта: ", bold: true, font: "Arial" }),
            new TextRun({ text: `${project.site_type} | Ниша: ${project.niche || 'не указана'}`, font: "Arial" })
          ]
        }),
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: "Месяц продвижения: ", bold: true, font: "Arial" }),
            new TextRun({ text: `Месяц ${scope.month} — ${scope.month_title}`, font: "Arial" })
          ]
        }),
        new Paragraph({
          spacing: { after: 300 },
          children: [
            new TextRun({ text: "Уровень бюджета: ", bold: true, font: "Arial" }),
            new TextRun({ text: `${project.budget_level.toUpperCase()}`, font: "Arial" })
          ]
        }),

        // SUMMARY
        new Paragraph({
          spacing: { after: 400 },
          children: [
            new TextRun({ text: "Общий обзор месяца: ", bold: true, italics: true, font: "Arial" }),
            new TextRun({ text: scope.summary, italics: true, font: "Arial" })
          ]
        }),

        // SECTION HEADER
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 200 },
          children: [
            new TextRun({ text: "1. Детальные блоки работ", bold: true, size: 28, color: "2B6CB0", font: "Arial" })
          ]
        }),

        // BLOCKS Iteration
        ...scope.work_blocks.flatMap((block, index) => {
          const num = index + 1;
          return [
            // Block Title
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 200, after: 100 },
              children: [
                new TextRun({ text: `1.${num}. Блок: ${block.block_title}`, bold: true, size: 24, color: "2D3748", font: "Arial" })
              ]
            }),
            // Process
            new Paragraph({
              indent: { left: 240 },
              spacing: { after: 80 },
              children: [
                new TextRun({ text: "Процесс исполнения: ", bold: true, font: "Arial" }),
                new TextRun({ text: block.process, font: "Arial" })
              ]
            }),
            // Result
            new Paragraph({
              indent: { left: 240 },
              spacing: { after: 80 },
              children: [
                new TextRun({ text: "Результат: ", bold: true, color: "2F855A", font: "Arial" }),
                new TextRun({ text: block.result, font: "Arial" })
              ]
            }),
            // Artifact
            new Paragraph({
              indent: { left: 240 },
              spacing: { after: 80 },
              children: [
                new TextRun({ text: "Артефакт: ", bold: true, font: "Arial" }),
                new TextRun({ text: block.artifact, font: "Arial" })
              ]
            }),
            // Acceptance Criteria
            new Paragraph({
              indent: { left: 240 },
              spacing: { after: 80 },
              children: [
                new TextRun({ text: "Критерий приёмки: ", bold: true, font: "Arial" }),
                new TextRun({ text: block.acceptance_criteria, font: "Arial" })
              ]
            }),
            // Contract translation
            new Paragraph({
              indent: { left: 240 },
              spacing: { after: 80 },
              children: [
                new TextRun({ text: "Формулировка для договора: ", bold: true, italics: true, font: "Arial" }),
                new TextRun({ text: block.contract_text, italics: true, font: "Arial" })
              ]
            }),
            // Client text
            new Paragraph({
              indent: { left: 240 },
              spacing: { after: 80 },
              children: [
                new TextRun({ text: "Для клиента (Простыми словами): ", bold: true, font: "Arial" }),
                new TextRun({ text: block.client_text, font: "Arial" })
              ]
            }),
            // Responsible Role
            new Paragraph({
              indent: { left: 240 },
              spacing: { after: 200 },
              children: [
                new TextRun({ text: "Ответственный исполнитель: ", bold: true, font: "Arial" }),
                new TextRun({ text: `${block.responsible_role || 'SEO-специалист'}`, font: "Arial" })
              ]
            })
          ];
        }),

        // MONTH OUTPUTS
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
          children: [
            new TextRun({ text: "2. Итоговые результаты и артефакты месяца", bold: true, size: 28, color: "2B6CB0", font: "Arial" })
          ]
        }),
        ...scope.month_outputs.map(out => new Paragraph({
          indent: { left: 240 },
          spacing: { after: 80 },
          children: [
            new TextRun({ text: "✔ ", bold: true, color: "38A169", font: "Arial" }),
            new TextRun({ text: out, font: "Arial" })
          ]
        })),

        // INTERNAL TASKS SECTION
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
          children: [
            new TextRun({ text: "3. Внутренний детальный чек-лист исполнителя", bold: true, size: 28, color: "2B6CB0", font: "Arial" })
          ]
        }),
        ...scope.work_blocks.flatMap(block => block.internal_tasks.map(task => new Paragraph({
          indent: { left: 240 },
          spacing: { after: 80 },
          children: [
            new TextRun({ text: "☐ ", bold: true, font: "Arial" }),
            new TextRun({ text: task, font: "Arial" })
          ]
        })))
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}
