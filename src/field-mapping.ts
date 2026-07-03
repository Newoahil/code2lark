export interface TemplateFieldMappingInput {
  key: string;
  name?: string;
}

export function formFieldName(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^([^a-zA-Z_])/, "_$1").slice(0, 40) || "field";
  return `field_${safe}`;
}

export function buildFormFieldMaps(fields: TemplateFieldMappingInput[]): {
  templateKeyToFormField: Record<string, string>;
  formFieldToTemplateKey: Record<string, string>;
} {
  const templateKeyToFormField: Record<string, string> = {};
  const formFieldToTemplateKey: Record<string, string> = {};
  for (const field of fields) {
    const name = uniqueFormFieldName(field.name || formFieldName(field.key), formFieldToTemplateKey);
    templateKeyToFormField[field.key] = name;
    formFieldToTemplateKey[name] = field.key;
  }
  return { templateKeyToFormField, formFieldToTemplateKey };
}

function uniqueFormFieldName(baseName: string, existing: Record<string, string>): string {
  if (!existing[baseName]) return baseName;
  for (let index = 2; ; index += 1) {
    const suffix = `_${index}`;
    const candidate = `${baseName.slice(0, 64 - suffix.length)}${suffix}`;
    if (!existing[candidate]) return candidate;
  }
}
