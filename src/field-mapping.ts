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
    const name = field.name || formFieldName(field.key);
    templateKeyToFormField[field.key] = name;
    formFieldToTemplateKey[name] = field.key;
  }
  return { templateKeyToFormField, formFieldToTemplateKey };
}
