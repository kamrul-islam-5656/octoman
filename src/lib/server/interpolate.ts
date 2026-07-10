import { KeyValuePair } from "@/types";

const templateRegExp = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

export function variablesToMap(
  variables: { key: string; value: string }[] | undefined,
): Record<string, string> {
  if (!variables) {
    return {};
  }

  return variables.reduce<Record<string, string>>((acc, item) => {
    const key = item.key.trim();
    if (key) {
      acc[key] = item.value;
    }
    return acc;
  }, {});
}

export function interpolateString(
  template: string,
  variableMap: Record<string, string>,
): string {
  return template.replace(templateRegExp, (_match, variableName: string) => {
    if (Object.prototype.hasOwnProperty.call(variableMap, variableName)) {
      return variableMap[variableName];
    }

    return "";
  });
}

export function interpolateHeaders(
  headers: KeyValuePair[],
  variableMap: Record<string, string>,
): KeyValuePair[] {
  return headers.map((header) => ({
    key: interpolateString(header.key, variableMap),
    value: interpolateString(header.value, variableMap),
    enabled: header.enabled ?? true,
  }));
}

export function interpolateKeyValuePairs(
  pairs: KeyValuePair[],
  variableMap: Record<string, string>,
): KeyValuePair[] {
  return pairs.map((pair) => ({
    key: interpolateString(pair.key, variableMap),
    value: interpolateString(pair.value, variableMap),
    enabled: pair.enabled ?? true,
    description: pair.description,
    type: pair.type,
    fileName: pair.fileName,
  }));
}
