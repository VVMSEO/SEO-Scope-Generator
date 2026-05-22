import { Task } from '../src/types.js';

export interface ParsedItem {
  id: number;
  section: string;
  raw_task: string;
  priority: 'critical' | 'important' | 'optional' | string;
  // Optional columns for rich imports (e.g., from 6-month spreadsheet plans)
  default_month?: number;
  work_block?: string;
  work_type?: string;
  process_text?: string;
  result_text?: string;
  artifact_type?: string;
  contract_text?: string;
  client_text?: string;
  internal_text?: string;
  acceptance_criteria?: string;
  responsible_role?: string;
}

export function parseChecklistText(rawText: string): ParsedItem[] {
  if (!rawText) return [];

  // Check if this looks like Tab-Separated Values (TSV) from Excel/Google Sheets
  const lines = rawText.split('\n');
  const hasTabs = lines.some(line => line.includes('\t'));

  if (hasTabs) {
    return parseTSV(rawText);
  }

  const items: ParsedItem[] = [];
  let currentSection = "Общий раздел";
  let autoLocalId = 5000;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Ignore TOC items which usually contain "пунктов"
    if (line.toLowerCase().includes('пункт')) {
        continue;
    }

    // Detect Task item first:
    let id = 0;
    let raw_task = "";
    let rawPriority = "Опционально";
    let isMatch = false;

    // 1. Format: [ID]. [Task name] (with or without bullet/checkbox)
    const taskMatchNum = line.match(/^(?:[☐\[\]\-\*\s]*)\s*(\d+)\.\s*(.+)$/);
    if (taskMatchNum) {
      id = parseInt(taskMatchNum[1], 10);
      raw_task = taskMatchNum[2].trim();
      isMatch = true;
    } else {
      // 2. Format: - [ ] [Task name] or * [Task name] or • [Task name]
      const taskMatchBullet = line.match(/^(?:[\-\*•·○▪]\s+|\s*\[\s*[xX]?\s*\]\s*|☐\s+)(?:\s*\[\s*[xX]?\s*\]\s*)?(.+)$/i);
      if (taskMatchBullet) {
        id = autoLocalId++;
        raw_task = taskMatchBullet[1].trim();
        isMatch = true;
      }
    }

    if (isMatch) {
      // Extract priority from the END of raw_task
      const prioMatch = raw_task.match(/^(.*)\s+(?:—|–|-)\s+(?:🔴|🟡|🟢|🔥|💎)?\s*([^\s].*?)$/);
      if (prioMatch) {
        // Priority is usually short.
        const words = prioMatch[2].split(' ');
        if (words.length <= 5) {
          raw_task = prioMatch[1].trim();
          rawPriority = prioMatch[2].trim();
        }
      }
      // Normalize Priority text
      let priority: 'critical' | 'important' | 'optional' = 'optional';
      if (rawPriority.toLowerCase().includes('критич') || rawPriority.includes('🔴') || rawPriority.toLowerCase().includes('critical') || rawPriority.toLowerCase().includes('high')) {
        priority = 'critical';
      } else if (rawPriority.toLowerCase().includes('важн') || rawPriority.includes('🟡') || rawPriority.toLowerCase().includes('important') || rawPriority.toLowerCase().includes('medium')) {
        priority = 'important';
      } else if (rawPriority.toLowerCase().includes('опцион') || rawPriority.includes('🟢') || rawPriority.toLowerCase().includes('optional')) {
        priority = 'optional';
      }

      items.push({
        id,
        section: currentSection,
        raw_task,
        priority
      });
      continue;
    }

    // Direct section matching: Short lines that are not tasks, omit empty lines, 
    // omit lines with "Итого:", underscores, "Оглавление".
    if (line.length > 2 && line.length < 150 && !line.toLowerCase().includes('пункт') && !line.includes('Итого:') && !/^_+$/.test(line) && line.toLowerCase() !== 'оглавление') {
      currentSection = line.replace(/^\d+\.\s*/, '');
      continue;
    }
  }

  if (items.length === 0) {
    let localId = 9000;
    let sec = "Задачи";
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      if (line.toLowerCase().includes('пункт') || line.includes('Итого:') || /^_+$/.test(line) || line.toLowerCase() === 'оглавление' || line.startsWith('Мастер SEO-чек-лист') || line.startsWith('Формат')) continue;

      if (line.length <= 40 && !line.includes('.') && !line.includes(',') && !line.toLowerCase().includes('задачи')) {
        sec = line;
      } else {
        items.push({
          id: localId++,
          section: sec,
          raw_task: line.replace(/^[•·○▪\-\*\d\.\s]+/, '').trim(),
          priority: 'optional'
        });
      }
    }
  }

  return items;
}

export function parseTSV(rawText: string): ParsedItem[] {
  const lines = rawText.split('\n');
  const items: ParsedItem[] = [];
  let currentSection = "Общий список из таблицы";

  // Check headers row
  let headers: string[] = [];
  let headerIndex = -1;

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split('\t');
    if (parts.length > 1) {
      const isHeader = parts.some(p => 
        p.toLowerCase().includes('название') || 
        p.toLowerCase().includes('задач') || 
        p.toLowerCase().includes('тема') ||
        p.toLowerCase().includes('работы') ||
        p.toLowerCase().includes('task') || 
        p.toLowerCase().includes('title')
      );
      if (isHeader) {
        headers = parts.map(h => h.toLowerCase().trim());
        headerIndex = i;
        break;
      }
    }
  }

  // Column mapping variables
  let titleCol = -1;
  let idCol = -1;
  let priorityCol = -1;
  let sectionCol = -1;
  let monthCol = -1;
  let processCol = -1;
  let resultCol = -1;
  let blockCol = -1;
  let roleCol = -1;
  let artifactCol = -1;
  let criteriaCol = -1;

  if (headers.length > 0) {
    for (let col = 0; col < headers.length; col++) {
      const h = headers[col];
      if (h.includes('номер') || h.includes('id') || h === '№') idCol = col;
      else if (h.includes('название') || h.includes('задач') || h.includes('тема') || h.includes('работы') || h === 'task' || h === 'title') titleCol = col;
      else if (h.includes('важность') || h.includes('приоритет') || h.includes('priority')) priorityCol = col;
      else if (h.includes('раздел') || h.includes('категория') || h.includes('section') || h.includes('category')) sectionCol = col;
      else if (h.includes('месяц') || h.includes('month') || h.includes('срок')) monthCol = col;
      else if (h.includes('процесс') || h.includes('исполнение') || h.includes('process') || h.includes('как делать')) processCol = col;
      else if (h.includes('результат') || h.includes('ожидаем') || h.includes('result')) resultCol = col;
      else if (h.includes('блок') || h.includes('направление') || h.includes('групп')) blockCol = col;
      else if (h.includes('роль') || h.includes('исполнитель') || h.includes('role') || h.includes('кто делает')) roleCol = col;
      else if (h.includes('артефакт') || h.includes('artifact')) artifactCol = col;
      else if (h.includes('критерий') || h.includes('приемк') || h.includes('criteria')) criteriaCol = col;
    }
  }

  const startRow = headerIndex !== -1 ? headerIndex + 1 : 0;
  let autoId = 2000;

  for (let i = startRow; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;
    const parts = rawLine.split('\t');
    if (parts.length < 2) continue; // Skip non-tabular lines

    let id = autoId++;
    let raw_task = "";
    let priority = "optional";
    let section = currentSection;

    let default_month = 1;
    let work_block = "";
    let process_text = "";
    let result_text = "";
    let artifact_type = "";
    let acceptance_criteria = "";
    let responsible_role = "";

    if (headers.length > 0) {
      // 1. Parse ID
      if (idCol !== -1 && parts[idCol]) {
        const parsedVal = parts[idCol].replace(/[^\d]/g, '');
        const parsed = parseInt(parsedVal, 10);
        if (!isNaN(parsed) && parsed > 0) id = parsed;
      }

      // 2. Parse Task Name
      if (titleCol !== -1 && parts[titleCol]) {
        raw_task = parts[titleCol].trim();
      } else {
        // Fallback guess
        raw_task = parts.find((p, idx) => idx !== idCol && p.trim().length > 12) || parts[0] || "";
      }

      // 3. Parse Section
      if (sectionCol !== -1 && parts[sectionCol]) {
        section = parts[sectionCol].trim();
      }

      // 4. Parse Priority
      if (priorityCol !== -1 && parts[priorityCol]) {
        const pStr = parts[priorityCol].toLowerCase();
        if (pStr.includes('критич') || pStr.includes('high') || pStr.includes('🔴') || pStr.includes('1')) {
          priority = 'critical';
        } else if (pStr.includes('важн') || pStr.includes('medium') || pStr.includes('🟡') || pStr.includes('2')) {
          priority = 'important';
        }
      }

      // 5. Parse Month
      if (monthCol !== -1 && parts[monthCol]) {
        const mStr = parts[monthCol].replace(/[^\d]/g, '');
        const m = parseInt(mStr, 10);
        if (!isNaN(m) && m >= 1 && m <= 12) default_month = m;
      }

      // 6. Direct Fields
      if (blockCol !== -1 && parts[blockCol]) work_block = parts[blockCol].trim();
      if (processCol !== -1 && parts[processCol]) process_text = parts[processCol].trim();
      if (resultCol !== -1 && parts[resultCol]) result_text = parts[resultCol].trim();
      if (artifactCol !== -1 && parts[artifactCol]) artifact_type = parts[artifactCol].trim();
      if (criteriaCol !== -1 && parts[criteriaCol]) acceptance_criteria = parts[criteriaCol].trim();
      if (roleCol !== -1 && parts[roleCol]) responsible_role = parts[roleCol].trim();

    } else {
      // Guess columns fallback
      const firstIsId = /^\d+$/.test(parts[0].trim());
      if (firstIsId) {
        id = parseInt(parts[0].trim(), 10);
        raw_task = parts[1]?.trim() || "";
        if (parts[2]) {
          const val = parts[2].toLowerCase();
          if (val.includes('критич') || val.includes('🔴')) priority = 'critical';
          else if (val.includes('важн') || val.includes('🟡')) priority = 'important';
        }
        if (parts[3] && /^\d+$/.test(parts[3].trim())) {
          default_month = parseInt(parts[3].trim(), 10);
        }
      } else {
        raw_task = parts[0]?.trim() || "";
        if (parts[1]) {
          const val = parts[1].toLowerCase();
          if (val.includes('критич') || val.includes('🔴')) priority = 'critical';
          else if (val.includes('важн') || val.includes('🟡')) priority = 'important';
        }
      }
    }

    if (!raw_task) continue;

    // Default clean-ups
    if (section === "Общий список из таблицы" && work_block) {
      section = work_block; // Group by work block if section is omitted
    }

    items.push({
      id,
      section: section || "Списковые задачи",
      raw_task,
      priority,
      default_month,
      work_block: work_block || section || "Общие работы",
      process_text: process_text || raw_task,
      result_text: result_text || "Пункт успешно выполнен и внедрен на сайте",
      artifact_type: artifact_type || "Инструкция / Отчет",
      acceptance_criteria: acceptance_criteria || "Работы соответствуют рекомендациям поисковых систем",
      responsible_role: responsible_role || "SEO-специалист"
    });
  }

  return items;
}
