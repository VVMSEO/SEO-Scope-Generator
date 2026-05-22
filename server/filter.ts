import { Task, Project } from '../src/types.js';

export function filterTasksForProject(
  tasks: Task[],
  project: Project,
  month: number
): Task[] {
  // 1. Fetch tasks of the selected default month
  let results = tasks.filter(t => Number(t.default_month) === Number(month));

  // 2. Filter applicability rules matching projects specifications (e.g. ecommerce, local, migration)
  results = results.filter(task => {
    const app = task.applicability;
    if (!app) return true;

    // Check exclusion flags first
    if (app.exclude_if_no_blog && !project.has_blog) return false;
    if (app.exclude_if_no_ecommerce && !project.has_ecommerce) return false;
    if (app.exclude_if_no_multilingual && !project.has_multilingual) return false;
    if (app.exclude_if_no_local_seo && !project.has_local_seo) return false;

    // If applies to all, it generally passes (unless excluded by the guards above)
    if (app.applies_to_all) return true;

    // Specific inclusion flags
    let isIncluded = false;
    if (app.applies_to_ecommerce && project.has_ecommerce) isIncluded = true;
    if (app.applies_to_services && project.site_type === 'services') isIncluded = true;
    if (app.applies_to_local && project.has_local_seo) isIncluded = true;
    if (app.applies_to_blog && project.has_blog) isIncluded = true;
    if (app.applies_to_ymyl && project.has_ymyl) isIncluded = true;
    if (app.requires_catalog && project.has_catalog) isIncluded = true;
    if (app.requires_filters && project.has_filters) isIncluded = true;
    if (app.requires_multilingual && project.has_multilingual) isIncluded = true;
    if (app.requires_migration && project.has_migration) isIncluded = true;
    if (app.requires_local_business && project.has_local_seo) isIncluded = true;

    return isIncluded;
  });

  // 3. Filter by budget rules
  // 'basic' (базовый), 'standard' (стандарт), 'premium' (расширенный/премиум)
  const budget = (project.budget_level || 'standard').toLowerCase();
  
  results = results.filter(task => {
    const priority = (task.priority || 'optional').toLowerCase();
    
    if (budget === 'basic' || budget === 'базовый') {
      // Basic: Only critical
      return priority === 'critical' || priority === 'критично';
    } else if (budget === 'standard' || budget === 'стандарт') {
      // Standard: critical + important
      return priority === 'critical' || priority === 'критично' || priority === 'important' || priority === 'важно';
    } else {
      // Extended/premium: Include everything (critical + important + optional)
      return true;
    }
  });

  return results;
}
