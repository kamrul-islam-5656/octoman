import { TestResult } from "@/types";

export function executeScript(
  script: string,
  context: Record<string, unknown>,
): TestResult[] {
  const results: TestResult[] = [];
  
  if (!script || script.trim().length === 0) {
    return results;
  }

  try {
    // Create a safe execution environment
    const testContext = {
      ...context,
      // Add test helper functions
      test: (name: string, fn: () => boolean | void) => {
        try {
          const result = fn();
          const passed = result === true || result === undefined;
          results.push({
            name,
            passed,
            error: passed ? null : "Test assertion failed",
            durationMs: 0,
          });
        } catch (error) {
          results.push({
            name,
            passed: false,
            error: error instanceof Error ? error.message : "Test execution error",
            durationMs: 0,
          });
        }
      },
      expect: (value: unknown) => ({
        toBe: (expected: unknown) => {
          const passed = value === expected;
          results.push({
            name: `expect(${JSON.stringify(value)}).toBe(${JSON.stringify(expected)})`,
            passed,
            error: passed ? null : `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(value)}`,
            durationMs: 0,
          });
        },
        toEqual: (expected: unknown) => {
          const passed = JSON.stringify(value) === JSON.stringify(expected);
          results.push({
            name: `expect(${JSON.stringify(value)}).toEqual(${JSON.stringify(expected)})`,
            passed,
            error: passed ? null : `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(value)}`,
            durationMs: 0,
          });
        },
        toBeNull: () => {
          const passed = value === null;
          results.push({
            name: `expect(${JSON.stringify(value)}).toBeNull()`,
            passed,
            error: passed ? null : `Expected null but got ${JSON.stringify(value)}`,
            durationMs: 0,
          });
        },
        toBeUndefined: () => {
          const passed = value === undefined;
          results.push({
            name: `expect(${JSON.stringify(value)}).toBeUndefined()`,
            passed,
            error: passed ? null : `Expected undefined but got ${JSON.stringify(value)}`,
            durationMs: 0,
          });
        },
        toBeTruthy: () => {
          const passed = Boolean(value);
          results.push({
            name: `expect(${JSON.stringify(value)}).toBeTruthy()`,
            passed,
            error: passed ? null : `Expected truthy value but got ${JSON.stringify(value)}`,
            durationMs: 0,
          });
        },
        toBeFalsy: () => {
          const passed = !value;
          results.push({
            name: `expect(${JSON.stringify(value)}).toBeFalsy()`,
            passed,
            error: passed ? null : `Expected falsy value but got ${JSON.stringify(value)}`,
            durationMs: 0,
          });
        },
        toContain: (expected: unknown) => {
          const passed = Array.isArray(value) && value.includes(expected);
          results.push({
            name: `expect(${JSON.stringify(value)}).toContain(${JSON.stringify(expected)})`,
            passed,
            error: passed ? null : `Expected array to contain ${JSON.stringify(expected)}`,
            durationMs: 0,
          });
        },
        toHaveLength: (expected: number) => {
          const length = Array.isArray(value) || typeof value === "string" ? value.length : 0;
          const passed = length === expected;
          results.push({
            name: `expect(${JSON.stringify(value)}).toHaveLength(${expected})`,
            passed,
            error: passed ? null : `Expected length ${expected} but got ${length}`,
            durationMs: 0,
          });
        },
      }),
    };

    // Execute the script in a safe context
    const functionBody = `
      "use strict";
      return (function() {
        ${script}
      }).call(testContext);
    `;

    const executeFunction = new Function("testContext", functionBody);
    executeFunction(testContext);

  } catch (error) {
    results.push({
      name: "Script execution",
      passed: false,
      error: error instanceof Error ? error.message : "Script execution failed",
      durationMs: 0,
    });
  }

  return results;
}
