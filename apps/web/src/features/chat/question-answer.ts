import type { FormAnswer, FormField, FormInfo } from '@opencodex/contracts';

export function initialAnswers(form: FormInfo): FormAnswer {
  return Object.fromEntries(
    form.fields.flatMap((field) =>
      'default' in field && field.default !== undefined ? [[field.key, field.default]] : [],
    ),
  );
}

export function fieldApplies(field: FormField, answer: FormAnswer) {
  return (
    !('when' in field) ||
    !field.when ||
    field.when.every((condition) =>
      condition.op === 'eq'
        ? answer[condition.key] === condition.value
        : answer[condition.key] !== condition.value,
    )
  );
}

export function answerError(field: FormField, value: FormAnswer[string] | undefined) {
  if (field.type === 'external' || field.hidden) return;
  const empty = value === undefined || value === '' || (Array.isArray(value) && !value.length);
  if (empty) return field.required ? 'Choose or enter an answer to continue.' : undefined;
  if (field.type === 'multiselect') {
    if (!Array.isArray(value)) return 'Choose one or more answers.';
    if (field.minItems !== undefined && value.length < field.minItems)
      return `Choose at least ${field.minItems} answers.`;
    if (field.maxItems !== undefined && value.length > field.maxItems)
      return `Choose no more than ${field.maxItems} answers.`;
  }
  if (field.type === 'string' && typeof value === 'string') {
    if (field.required && !value.trim()) return 'Enter an answer to continue.';
    if (field.minLength !== undefined && value.length < field.minLength)
      return `Use at least ${field.minLength} characters.`;
    if (field.maxLength !== undefined && value.length > field.maxLength)
      return `Use no more than ${field.maxLength} characters.`;
  }
  if (field.type === 'number' || field.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'Enter a number.';
    if (field.type === 'integer' && !Number.isInteger(value)) return 'Enter a whole number.';
    if (typeof field.minimum === 'number' && value < field.minimum)
      return `Enter ${field.minimum} or more.`;
    if (typeof field.maximum === 'number' && value > field.maximum)
      return `Enter ${field.maximum} or less.`;
  }
}
