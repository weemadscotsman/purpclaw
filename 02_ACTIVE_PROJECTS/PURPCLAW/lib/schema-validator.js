'use strict';

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value === 'number' && Number.isInteger(value) ? 'integer' : typeof value;
}

function validate(value, schema = {}, path = '$') {
  const errors = [];
  if (!schema || typeof schema !== 'object') return { ok: true, errors };
  const allowed = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const actual = typeOf(value);
  if (allowed.length && !allowed.includes(actual) && !(actual === 'integer' && allowed.includes('number'))) {
    errors.push(`${path}: expected ${allowed.join('|')}, got ${actual}`);
    return { ok: false, errors };
  }
  if (schema.enum && !schema.enum.some(item => JSON.stringify(item) === JSON.stringify(value))) errors.push(`${path}: value is not in enum`);
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) errors.push(`${path}: shorter than minLength`);
    if (schema.maxLength != null && value.length > schema.maxLength) errors.push(`${path}: longer than maxLength`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match pattern`);
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) errors.push(`${path}: below minimum`);
    if (schema.maximum != null && value > schema.maximum) errors.push(`${path}: above maximum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${path}: fewer than minItems`);
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${path}: more than maxItems`);
    if (schema.items) value.forEach((item, index) => errors.push(...validate(item, schema.items, `${path}[${index}]`).errors));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${path}.${key}: required`);
    for (const [key, child] of Object.entries(schema.properties || {})) if (key in value) errors.push(...validate(value[key], child, `${path}.${key}`).errors);
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!(key in (schema.properties || {}))) errors.push(`${path}.${key}: additional property`);
  }
  return { ok: errors.length === 0, errors };
}

function parseAndValidate(content, schema) {
  let value = content;
  if (typeof content === 'string') {
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    try { value = JSON.parse(cleaned); } catch (error) { return { ok: false, errors: [`$: invalid JSON (${error.message})`], value: null }; }
  }
  return { ...validate(value, schema), value };
}

module.exports = { validate, parseAndValidate };
