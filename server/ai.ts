import { GoogleGenAI, Type } from "@google/genai";
import { Task, Project, GeneratedScopeResult, ReviewerReport } from '../src/types.js';

function getAIClient(customKey?: string) {
  // Use custom key if provided manually, otherwise use standard process.env.GEMINI_API_KEY
  let apiKey = process.env.GEMINI_API_KEY || '';
  if (customKey && customKey !== 'AUTO_ENV_KEY' && customKey.trim() !== '') {
    apiKey = customKey;
  }

  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

/**
 * Task Normalizer AI Role
 * Turns a single raw task into structured JSON matching the tasks table.
 */
export async function normalizeTask(
  taskData: { id: number; section: string; raw_task: string; priority: string },
  customKey?: string
): Promise<Partial<Task>> {
  const ai = getAIClient(customKey);
  const prompt = `
Ты — SEO-методолог.
Тебе передан пункт SEO-чек-листа.
Нужно превратить его в структурированную задачу для базы сервиса SEO Scope Generator.
Верни JSON строго по схеме.

Правила:
1. Не меняй ID задачи (должен быть ${taskData.id}).
2. Не теряй исходный смысл.
3. Определи подходящий месяц по умолчанию от 1 до 6 на основе тематики раздела.
4. Определи блок работ (например: "Технический аудит", "Семантика", "Локальное SEO", "Аналитика", "On-page").
5. Сформулируй процесс (process_text) как действие или цепочку действий с использованием стрелочек "→".
6. Сформулируй результат (result_text) как конкретный артефакт.
7. Не обещай рост позиций, трафика или заявок.
8. Для договора (contract_text) пиши кратко и юридически нейтрально.
9. Для клиента (client_text) пиши понятно и дружелюбно в формате "Мы сделаем... чтобы...".
10. Для внутренней работы (internal_text) пиши детально в формате "Что нужно сделать: 1... 2...".
11. Укажи критерий приёмки (acceptance_criteria).
12. Определи применимость задачи в объекте applicability.

Входные данные:
ID: ${taskData.id}
Раздел: ${taskData.section}
Задача: ${taskData.raw_task}
Приоритет: ${taskData.priority}
`;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: [
          "id", "section", "raw_task", "priority", "default_month", "work_block", "work_type",
          "process_text", "result_text", "artifact_type", "contract_text", "client_text",
          "internal_text", "acceptance_criteria", "responsible_role", "repeatability", "applicability"
        ],
        properties: {
          id: { type: Type.INTEGER },
          section: { type: Type.STRING },
          raw_task: { type: Type.STRING },
          priority: { type: Type.STRING },
          default_month: { type: Type.INTEGER, description: "Месяц от 1 до 6" },
          work_block: { type: Type.STRING },
          work_type: { type: Type.STRING },
          process_text: { type: Type.STRING },
          result_text: { type: Type.STRING },
          artifact_type: { type: Type.STRING },
          contract_text: { type: Type.STRING },
          client_text: { type: Type.STRING },
          internal_text: { type: Type.STRING },
          acceptance_criteria: { type: Type.STRING },
          responsible_role: { type: Type.STRING },
          repeatability: { type: Type.STRING },
          applicability: {
            type: Type.OBJECT,
            required: [
              "applies_to_all", "applies_to_ecommerce", "applies_to_services", "applies_to_local", "applies_to_blog",
              "applies_to_ymyl", "requires_catalog", "requires_filters", "requires_multilingual", "requires_migration"
            ],
            properties: {
              applies_to_all: { type: Type.BOOLEAN },
              applies_to_ecommerce: { type: Type.BOOLEAN },
              applies_to_services: { type: Type.BOOLEAN },
              applies_to_local: { type: Type.BOOLEAN },
              applies_to_blog: { type: Type.BOOLEAN },
              applies_to_ymyl: { type: Type.BOOLEAN },
              requires_catalog: { type: Type.BOOLEAN },
              requires_filters: { type: Type.BOOLEAN },
              requires_multilingual: { type: Type.BOOLEAN },
              requires_migration: { type: Type.BOOLEAN }
            }
          }
        }
      }
    }
  });

  const text = response.text || '{}';
  return JSON.parse(text);
}

/**
 * Scope Generator AI Role
 * Assembles a structured Monthly list of works based on selected context tasks.
 */
export async function generateMonthlyScope(
  context: {
    project: Project;
    month: number;
    tasks: Task[];
    output_mode: string;
    depth: string; // "basic" | "standard" | "premium"
    tone: string; // "business" | "detailed" | "short"
  },
  customKey?: string
): Promise<GeneratedScopeResult> {
  const ai = getAIClient(customKey);
  const prompt = `
Ты — SEO-методолог и архитектор scope of work.
Тебе переданы:
1. профиль проекта: ${JSON.stringify(context.project, null, 2)}
2. номер месяца: ${context.month}
3. глубина проработки: ${context.depth}
4. тон повествования: ${context.tone}
5. список релевантных задач из базы: ${JSON.stringify(context.tasks.map(t => ({
    id: t.id,
    section: t.section,
    raw_task: t.raw_task,
    priority: t.priority,
    work_block: t.work_block,
    process_text: t.process_text,
    result_text: t.result_text,
    artifact_type: t.artifact_type,
    contract_text: t.contract_text,
    client_text: t.client_text,
    internal_text: t.internal_text,
    acceptance_criteria: t.acceptance_criteria,
    responsible_role: t.responsible_role
  })), null, 2)}

Собери список работ на месяц. Сгруппируй мелкие задачи в логичные блоки работ (work_blocks).
Формат каждого блока строго по схеме JSON.

Правила:
1. Не добавляй новые задачи с ID, которых нет во входном списке.
2. Не включай задачи, не применимые к проекту (ориентируйся на профиль проекта).
3. Не обещай рост позиций, трафика или заявок.
4. Соблюдай фреймворк «Процесс → Результат» для каждого блока.
5. Для договора пиши кратко и нейтрально.
6. Для клиента пиши понятно, избегая излишнего сленга.
7. Для внутреннего чек-листа пиши подробно.
8. Сформируй итоговые результаты месяца в виде массива "month_outputs".
`;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: ["month", "month_title", "summary", "work_blocks", "month_outputs"],
        properties: {
          month: { type: Type.INTEGER },
          month_title: { type: Type.STRING },
          summary: { type: Type.STRING, description: "Общая характеристика работ на этот месяц" },
          work_blocks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: [
                "block_title", "process", "result", "artifact", "checklist_ids",
                "contract_text", "client_text", "internal_tasks", "acceptance_criteria", "responsible_role"
              ],
              properties: {
                block_title: { type: Type.STRING, description: "Название блока, например 'Технический аудит'" },
                process: { type: Type.STRING, description: "Сбор доступов → Проверка → Настройка" },
                result: { type: Type.STRING },
                artifact: { type: Type.STRING, description: "Таблица / Отчет" },
                checklist_ids: {
                  type: Type.ARRAY,
                  items: { type: Type.INTEGER },
                  description: "Массив исходных ID задач, сгруппированных в этот блок"
                },
                contract_text: { type: Type.STRING },
                client_text: { type: Type.STRING },
                internal_tasks: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Детализированные шаги для внутреннего чек-листа"
                },
                acceptance_criteria: { type: Type.STRING },
                responsible_role: { type: Type.STRING }
              }
            }
          },
          month_outputs: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Ключевые артефакты на выходе (3-5 пунктов)"
          }
        }
      }
    }
  });

  const text = response.text || '{}';
  return JSON.parse(text);
}

/**
 * AI Reviewer Role
 * Verifies generated SOW, flags inconsistencies, and outputs revised results.
 */
export async function runAIReviewer(
  context: {
    project: Project;
    month: number;
    tasks: Task[];
    generatedScope: GeneratedScopeResult;
  },
  customKey?: string
): Promise<ReviewerReport> {
  const ai = getAIClient(customKey);
  const prompt = `
Ты — строигий SEO-аудитор и редактор scope of work.
Тебе передан сгенерированный список работ на месяц ${context.month} для проекта "${context.project.name}".
Твоя задача — проверить документ и вернуть детальный отчет по качеству и исправленную версию.

Входной сгенерированный список:
${JSON.stringify(context.generatedScope, null, 2)}

Список допустимых задач:
${JSON.stringify(context.tasks.map(t => ({ id: t.id, title: t.raw_task, priority: t.priority })), null, 2)}

Проверь следующие критерии:
1. Все ли критичные задачи из входного списка учтены. Если пропущены — добавь их в исправленную версию.
2. Нет ли задач, которых не было во входном списке (галлюцинаций). Если есть — удали из исправленной версии.
3. Нет ли задач, не применимых к проекту (например, e-commerce фиды для сайта услуг).
4. У всех ли блоков есть конкретный результат и артефакт.
5. Не закрались ли обещания роста позиций, трафика или заявок.
6. Поднимается ли детализация от версии к версии (Договор < Клиент < Внутренний).

Верни JSON строго по схеме ReviewerReport.
`;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: ["errors", "missing_tasks_idsOrTitles", "extra_tasks_idsOrTitles", "revised_scope"],
        properties: {
          errors: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Список обнаруженных ошибок"
          },
          missing_tasks_idsOrTitles: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Пропущенные обязательные задачи"
          },
          extra_tasks_idsOrTitles: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Лишние или некорректно добавленные задачи"
          },
          revised_scope: {
            type: Type.OBJECT,
            description: "Скорректированная и исправленная версия GeneratedScopeResult",
            required: ["month", "month_title", "summary", "work_blocks", "month_outputs"],
            properties: {
              month: { type: Type.INTEGER },
              month_title: { type: Type.STRING },
              summary: { type: Type.STRING },
              work_blocks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  required: [
                    "block_title", "process", "result", "artifact", "checklist_ids",
                    "contract_text", "client_text", "internal_tasks", "acceptance_criteria", "responsible_role"
                  ],
                  properties: {
                    block_title: { type: Type.STRING },
                    process: { type: Type.STRING },
                    result: { type: Type.STRING },
                    artifact: { type: Type.STRING },
                    checklist_ids: {
                      type: Type.ARRAY,
                      items: { type: Type.INTEGER }
                    },
                    contract_text: { type: Type.STRING },
                    client_text: { type: Type.STRING },
                    internal_tasks: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    },
                    acceptance_criteria: { type: Type.STRING },
                    responsible_role: { type: Type.STRING }
                  }
                }
              },
              month_outputs: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            }
          }
        }
      }
    }
  });

  const text = response.text || '{}';
  return JSON.parse(text);
}

/**
 * Test LLM Connection
 */
export async function testLLMConnection(customKey?: string): Promise<boolean> {
  try {
    const ai = getAIClient(customKey);
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: "Respond only with: OK"
    });
    return (response.text || '').toLowerCase().includes('ok');
  } catch (err) {
    console.error("Test connection failed: ", err);
    return false;
  }
}
