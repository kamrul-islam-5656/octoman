import { z } from "zod";

import {
  HttpMethod,
  KeyValuePair,
  RequestAuthConfig,
  RequestBodyMode,
} from "@/types";

export const HTTP_METHOD_VALUES: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

export const REQUEST_BODY_MODE_VALUES: RequestBodyMode[] = [
  "none",
  "raw",
  "form-data",
  "x-www-form-urlencoded",
];

export const keyValueSchema = z.object({
  key: z.string().max(300),
  value: z.string().max(10000),
  enabled: z.boolean().optional(),
});

export const requestAuthSchema = z.object({
  type: z.enum(["inherit", "none", "basic", "bearer", "api-key"]),
  basic: z
    .object({
      username: z.string().max(500),
      password: z.string().max(1000),
    })
    .optional(),
  bearerToken: z.string().max(10000).optional(),
  apiKey: z
    .object({
      key: z.string().max(500),
      value: z.string().max(10000),
      addTo: z.enum(["header", "query"]).default("header"),
    })
    .optional(),
});

export function createDefaultAuthConfig(): RequestAuthConfig {
  return {
    type: "none",
    basic: {
      username: "",
      password: "",
    },
    bearerToken: "",
    apiKey: {
      key: "",
      value: "",
      addTo: "header",
    },
  };
}

export function createInheritAuthConfig(): RequestAuthConfig {
  return {
    type: "inherit",
    basic: {
      username: "",
      password: "",
    },
    bearerToken: "",
    apiKey: {
      key: "",
      value: "",
      addTo: "header",
    },
  };
}

export function normalizeAuthConfig(value: unknown): RequestAuthConfig {
  const parsed = requestAuthSchema.safeParse(value);
  const defaults = createDefaultAuthConfig();

  if (!parsed.success) {
    return defaults;
  }

  return {
    type: parsed.data.type,
    basic: {
      username: parsed.data.basic?.username ?? "",
      password: parsed.data.basic?.password ?? "",
    },
    bearerToken: parsed.data.bearerToken ?? "",
    apiKey: {
      key: parsed.data.apiKey?.key ?? "",
      value: parsed.data.apiKey?.value ?? "",
      addTo: parsed.data.apiKey?.addTo ?? "header",
    },
  };
}

export function isBodyAllowed(method: HttpMethod): boolean {
  return method !== "GET" && method !== "HEAD";
}

export function normalizeBodyMode(
  value: unknown,
  method: HttpMethod,
): RequestBodyMode {
  const mode = z.enum(REQUEST_BODY_MODE_VALUES).safeParse(value);
  const parsedMode = mode.success ? mode.data : "raw";

  if (!isBodyAllowed(method)) {
    return "none";
  }

  return parsedMode;
}

export function normalizeBodyForm(
  value: KeyValuePair[] | undefined,
): KeyValuePair[] {
  return (value ?? [])
    .map((item) => ({
      key: item.key.trim(),
      value: item.value,
      enabled: item.enabled ?? true,
    }))
    .filter((item) => item.key.length > 0);
}
