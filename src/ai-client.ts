import { GoogleGenAI } from "@google/genai";
import { Task, Project, GeneratedScopeResult, ReviewerReport } from './types.js';
import { getClientLLMProviders } from './db-client.js';
import { auth } from './firebase.js';

async function getLLMConfig(customConfig?: any) {
  if (customConfig && typeof customConfig === 'object') {
    return customConfig;
  }
  
  const uid = auth.currentUser?.uid;
  if (uid) {
    const list = await getClientLLMProviders(uid);
    if (list.length > 0) {
      return list[0];
    }
  }
  
  // Fall back to env
  const metaEnv = (import.meta as any).env;
  return {
    provider_name: "OpenAI Compatible",
    api_key_encrypted: "sk-idWLIk8WBHJJiwn-Y2oyMNdW0ckjsfIa",
    default_model: "qwen/qwen3.7-max",
    api_endpoint: "https://routerai.ru/api/v1",
    temperature: 0.3
  };
}

async function callLLMJSON(prompt: string, schema: any, customConfig?: any): Promise<string> {
  const config = await getLLMConfig(customConfig);
  const isCustom = config.provider_name === "OpenAI Compatible";
  const apiKey = config.api_key_encrypted;

  if (!apiKey) {
    throw new Error("API ключ не задан. Пожалуйста, укажите валидный API ключ во вкладке 'Настройки AI'.");
  }

  if (isCustom) {
    // OpenAI Compatible endpoint via fetch
    const url = config.api_endpoint.endsWith('/chat/completions') 
      ? config.api_endpoint 
      : `${config.api_endpoint.replace(/\/$/, '')}/chat/completions`;
      
    // Create system prompt that forces JSON output matching schema
    const sysPrompt = "You must respond strictly in JSON format matching this schema: " + JSON.stringify(schema);
    
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: config.default_model || "anthropic/claude-3.5-sonnet",
        messages: [
          { role: "system", "content": sysPrompt },
          { role: "user", content: prompt }
        ],
        temperature: config.temperature || 0.3,
        response_format: { type: "json_object" } // try to force json mode if supported
      })
    });
    
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI Compatible API Error: ${res.status} - ${errText}`);
    }
    
    const data = await res.json();
    let content = data.choices[0].message.content;
    
    // Cleanup markdown formatting if model didn't use strict json mode
    if (content.startsWith("```json")) {
        content = content.replace(/^```json\n?/, '').replace(/```$/, '').trim();
    }
    return content;
  } else {
    // Gemini using GoogleGenAI SDK
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build-browser' } }
    });
    const response = await ai.models.generateContent({
      model: config.default_model || "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: config.temperature || 0.3
      }
    });
    return response.text || '{}';
  }
}

export async function normalizeTaskBatch(
  tasksData: Array<{ id: number; section: string; raw_task: string; priority: string }>,
  customConfig?: any
): Promise<Partial<Task>[]> {
  const prompt = `
Ты — SEO-методолог.
Тебе передан массив пунктов SEO-чек-листа.
Нужно превратить каждый из них в структурированную задачу для базы сервиса SEO Scope Generator.
Верни JSON строго по схеме (массив объектов 'tasks').

Правила:
1. Не меняй ID задач. Для каждой задачи из входа должен быть сгенерирован ответ с тем же ID!
2. Не теряй исходный смысл.
3. Определи подходящий месяц внедрения (от 1 и далее без ограничений) на основе тематики раздела и логики плана.
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
${JSON.stringify(tasksData, null, 2)}
`;

  const schema = {
    type: "OBJECT",
    required: ["tasks"],
    properties: {
      tasks: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          required: [
            "id", "section", "raw_task", "priority", "default_month", "work_block", "work_type",
            "process_text", "result_text", "artifact_type", "contract_text", "client_text",
            "internal_text", "acceptance_criteria", "responsible_role", "repeatability", "applicability"
          ],
          properties: {
            id: { type: "INTEGER" },
            section: { type: "STRING" },
            raw_task: { type: "STRING" },
            priority: { type: "STRING" },
            default_month: { type: "INTEGER", description: "Логический месяц (Например, 1, 2, 7, 12)" },
            work_block: { type: "STRING" },
            work_type: { type: "STRING" },
            process_text: { type: "STRING" },
            result_text: { type: "STRING" },
            artifact_type: { type: "STRING" },
            contract_text: { type: "STRING" },
            client_text: { type: "STRING" },
            internal_text: { type: "STRING" },
            acceptance_criteria: { type: "STRING" },
            responsible_role: { type: "STRING" },
            repeatability: { type: "STRING" },
            applicability: {
              type: "OBJECT",
              required: [
                "applies_to_all", "applies_to_ecommerce", "applies_to_services", "applies_to_local", "applies_to_blog",
                "applies_to_ymyl", "requires_catalog", "requires_filters", "requires_multilingual", "requires_migration"
              ],
              properties: {
                applies_to_all: { type: "BOOLEAN" },
                applies_to_ecommerce: { type: "BOOLEAN" },
                applies_to_services: { type: "BOOLEAN" },
                applies_to_local: { type: "BOOLEAN" },
                applies_to_blog: { type: "BOOLEAN" },
                applies_to_ymyl: { type: "BOOLEAN" },
                requires_catalog: { type: "BOOLEAN" },
                requires_filters: { type: "BOOLEAN" },
                requires_multilingual: { type: "BOOLEAN" },
                requires_migration: { type: "BOOLEAN" }
              }
            }
          }
        }
      }
    }
  };

  let retries = 3;
  while (retries > 0) {
    try {
      const text = await callLLMJSON(prompt, schema, customConfig);
      const parsed = JSON.parse(text);
      return parsed.tasks || [];
    } catch (e: any) {
      retries--;
      if (retries === 0) throw e;
      const waitMs = (3 - retries) * 2000;
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  return [];
}

/**
 * Task Normalizer (Browser-Side)
 */
export async function normalizeTask(
  taskData: { id: number; section: string; raw_task: string; priority: string },
  customConfig?: any
): Promise<Partial<Task>> {
  const prompt = `
Ты — SEO-методолог.
Тебе передан пункт SEO-чек-листа.
Нужно превратить его в структурированную задачу для базы сервиса SEO Scope Generator.
Верни JSON строго по схеме.

Правила:
1. Не меняй ID задачи (должен быть ${taskData.id}).
2. Не теряй исходный смысл.
3. Определи подходящий месяц внедрения (от 1 и далее без ограничений) на основе тематики раздела и логики плана.
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

  const schema = {
    type: "OBJECT",
    required: [
      "id", "section", "raw_task", "priority", "default_month", "work_block", "work_type",
      "process_text", "result_text", "artifact_type", "contract_text", "client_text",
      "internal_text", "acceptance_criteria", "responsible_role", "repeatability", "applicability"
    ],
    properties: {
      id: { type: "INTEGER" },
      section: { type: "STRING" },
      raw_task: { type: "STRING" },
      priority: { type: "STRING" },
      default_month: { type: "INTEGER", description: "Логический месяц (Например, 1, 2, 7, 12)" },
      work_block: { type: "STRING" },
      work_type: { type: "STRING" },
      process_text: { type: "STRING" },
      result_text: { type: "STRING" },
      artifact_type: { type: "STRING" },
      contract_text: { type: "STRING" },
      client_text: { type: "STRING" },
      internal_text: { type: "STRING" },
      acceptance_criteria: { type: "STRING" },
      responsible_role: { type: "STRING" },
      repeatability: { type: "STRING" },
      applicability: {
        type: "OBJECT",
        required: [
          "applies_to_all", "applies_to_ecommerce", "applies_to_services", "applies_to_local", "applies_to_blog",
          "applies_to_ymyl", "requires_catalog", "requires_filters", "requires_multilingual", "requires_migration"
        ],
        properties: {
          applies_to_all: { type: "BOOLEAN" },
          applies_to_ecommerce: { type: "BOOLEAN" },
          applies_to_services: { type: "BOOLEAN" },
          applies_to_local: { type: "BOOLEAN" },
          applies_to_blog: { type: "BOOLEAN" },
          applies_to_ymyl: { type: "BOOLEAN" },
          requires_catalog: { type: "BOOLEAN" },
          requires_filters: { type: "BOOLEAN" },
          requires_multilingual: { type: "BOOLEAN" },
          requires_migration: { type: "BOOLEAN" }
        }
      }
    }
  };

  const text = await callLLMJSON(prompt, schema, customConfig);
  return JSON.parse(text);
}

/**
 * Scope Generator (Browser-Side)
 */
export async function generateMonthlyScope(
  context: {
    project: Project;
    month: number;
    tasks: Task[];
    output_mode: string;
    depth: string; 
    tone: string; 
  },
  customConfig?: any
): Promise<GeneratedScopeResult> {
  const prompt = `
Ты — SEO-методолог и архитектор SOW холстов.
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

Собери упорядоченный список работ на месяц. Сгруппируй мелкие задачи в логичные блоки работ (work_blocks).
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

  const schema = {
    type: "OBJECT",
    required: ["month", "month_title", "summary", "work_blocks", "month_outputs"],
    properties: {
      month: { type: "INTEGER" },
      month_title: { type: "STRING" },
      summary: { type: "STRING", description: "Общая характеристика работ на этот месяц" },
      work_blocks: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          required: [
            "block_title", "process", "result", "artifact", "checklist_ids",
            "contract_text", "client_text", "internal_tasks", "acceptance_criteria", "responsible_role"
          ],
          properties: {
            block_title: { type: "STRING" },
            process: { type: "STRING" },
            result: { type: "STRING" },
            artifact: { type: "STRING" },
            checklist_ids: {
              type: "ARRAY",
              items: { type: "INTEGER" }
            },
            contract_text: { type: "STRING" },
            client_text: { type: "STRING" },
            internal_tasks: {
              type: "ARRAY",
              items: { type: "STRING" }
            },
            acceptance_criteria: { type: "STRING" },
            responsible_role: { type: "STRING" }
          }
        }
      },
      month_outputs: {
        type: "ARRAY",
        items: { type: "STRING" }
      }
    }
  };

  const text = await callLLMJSON(prompt, schema, customConfig);
  return JSON.parse(text);
}

/**
 * AI Reviewer (Browser-Side)
 */
export async function runAIReviewer(
  context: {
    project: Project;
    month: number;
    tasks: Task[];
    generatedScope: GeneratedScopeResult;
  },
  customConfig?: any
): Promise<ReviewerReport> {
  const prompt = `
Ты — критичный SEO-аудитор и редактор SOW чек-листов.
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

  const schema = {
    type: "OBJECT",
    required: ["errors", "missing_tasks_idsOrTitles", "extra_tasks_idsOrTitles", "revised_scope"],
    properties: {
      errors: {
        type: "ARRAY",
        items: { type: "STRING" }
      },
      missing_tasks_idsOrTitles: {
        type: "ARRAY",
        items: { type: "STRING" }
      },
      extra_tasks_idsOrTitles: {
        type: "ARRAY",
        items: { type: "STRING" }
      },
      revised_scope: {
        type: "OBJECT",
        required: ["month", "month_title", "summary", "work_blocks", "month_outputs"],
        properties: {
          month: { type: "INTEGER" },
          month_title: { type: "STRING" },
          summary: { type: "STRING" },
          work_blocks: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              required: [
                "block_title", "process", "result", "artifact", "checklist_ids",
                "contract_text", "client_text", "internal_tasks", "acceptance_criteria", "responsible_role"
              ],
              properties: {
                block_title: { type: "STRING" },
                process: { type: "STRING" },
                result: { type: "STRING" },
                artifact: { type: "STRING" },
                checklist_ids: {
                  type: "ARRAY",
                  items: { type: "INTEGER" }
                },
                contract_text: { type: "STRING" },
                client_text: { type: "STRING" },
                internal_tasks: {
                  type: "ARRAY",
                  items: { type: "STRING" }
                },
                acceptance_criteria: { type: "STRING" },
                responsible_role: { type: "STRING" }
              }
            }
          },
          month_outputs: {
            type: "ARRAY",
            items: { type: "STRING" }
          }
        }
      }
    }
  };

  const text = await callLLMJSON(prompt, schema, customConfig);
  return JSON.parse(text);
}

/**
 * Test Connection
 */
export async function testLLMConnection(customConfig?: any): Promise<boolean> {
  try {
    const config = await getLLMConfig(customConfig);
    const isCustom = config.provider_name === "OpenAI Compatible";
    const apiKey = config.api_key_encrypted;
    
    if (!apiKey) return false;

    if (isCustom) {
      const url = config.api_endpoint.endsWith('/models')
        ? config.api_endpoint
        : `${config.api_endpoint.replace(/\/$/, '').replace(/\/chat\/completions$/, '')}/models`;
        
      try {
          // just try hitting standard completions to test auth
          const testUrl = config.api_endpoint.endsWith('/chat/completions') 
          ? config.api_endpoint 
          : `${config.api_endpoint.replace(/\/$/, '')}/chat/completions`;
          
          const res = await fetch(testUrl, {
              method: "POST",
              headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                  model: config.default_model || "anthropic/claude-3.5-sonnet",
                  messages: [{ role: "user", content: "Say OK" }],
                  max_tokens: 5
              })
          });
          return res.ok;
      } catch (err) {
          console.error(err);
          return false;
      }
    } else {
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build-browser' } }
      });
      const response = await ai.models.generateContent({
        model: config.default_model || "gemini-2.5-flash",
        contents: "Respond only with: OK"
      });
      return (response.text || '').toLowerCase().includes('ok');
    }
  } catch (err) {
    console.error("Test LLM Connection Failed:", err);
    return false;
  }
}

