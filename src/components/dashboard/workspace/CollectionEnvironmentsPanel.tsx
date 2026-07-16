import { FormEvent, useState } from "react";
import { Check, Globe, LoaderCircle, Plus, Save, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnvironmentDto, EnvironmentVariable } from "@/types";

interface CollectionEnvironmentsPanelProps {
  environments: EnvironmentDto[];
  isReadonly: boolean;
  isCreatingEnvironment: boolean;
  settingActiveEnvironmentId: string | null;
  isSavingEnvironmentVariables: boolean;
  deletingEnvironmentId: string | null;
  onCreateEnvironment: (name: string) => void;
  onSetActiveEnvironment: (environmentId: string) => void;
  onSaveEnvironmentVariables: (environmentId: string, variables: EnvironmentVariable[]) => void;
  onDeleteEnvironment: (environmentId: string) => void;
}

interface EnvironmentVariablesEditorProps {
  environment: EnvironmentDto;
  isReadonly: boolean;
  isSaving: boolean;
  onSave: (variables: EnvironmentVariable[]) => void;
}

function EnvironmentVariablesEditor({ environment, isReadonly, isSaving, onSave }: EnvironmentVariablesEditorProps) {
  const [variablesDraft, setVariablesDraft] = useState<EnvironmentVariable[]>(environment.variables);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  function updateRow(index: number, field: "key" | "value", value: string) {
    setVariablesDraft((previous) => previous.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  }

  function removeRow(index: number) {
    setVariablesDraft((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  }

  function addRow() {
    setVariablesDraft((previous) => [...previous, { key: "", value: "" }]);
  }

  const query = searchQuery.trim().toLowerCase();
  const visibleIndexes = variablesDraft
    .map((_, index) => index)
    .filter((index) => {
      if (!query) return true;
      const variable = variablesDraft[index];
      return variable.key.toLowerCase().includes(query) || variable.value.toLowerCase().includes(query);
    });

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]/70">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Variables ({environment.name})
        </p>
        {!isReadonly ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isSaving}
            onClick={() => onSave(variablesDraft)}
          >
            {isSaving ? <LoaderCircle className="animate-spin" size={14} /> : <Save size={14} />}
            Save
          </Button>
        ) : null}
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="w-1/2 px-3 py-2 text-left text-xs font-medium text-[var(--muted)]">Variable</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-[var(--muted)]">
              <div className="flex items-center justify-between">
                <span>Value</span>
                <button
                  type="button"
                  onClick={() => setShowSearch((previous) => !previous)}
                  className="rounded p-1 text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  title="Search variables"
                >
                  <Search size={13} />
                </button>
              </div>
            </th>
          </tr>
          {showSearch ? (
            <tr className="border-b border-[var(--border)]">
              <td colSpan={2} className="px-3 py-1.5">
                <Input
                  autoFocus
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Filter variables"
                  className="h-7 text-xs"
                />
              </td>
            </tr>
          ) : null}
        </thead>
        <tbody>
          {visibleIndexes.map((index) => {
            const variable = variablesDraft[index];
            return (
              <tr key={index} className="group border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-hover)]/60">
                <td className="p-0">
                  <Input
                    value={variable.key}
                    onChange={(event) => updateRow(index, "key", event.target.value)}
                    placeholder="base_url"
                    disabled={isReadonly}
                    className="h-9 rounded-none border-0 bg-transparent font-mono text-xs focus-visible:ring-1"
                  />
                </td>
                <td className="p-0">
                  <div className="flex items-center">
                    <Input
                      value={variable.value}
                      onChange={(event) => updateRow(index, "value", event.target.value)}
                      placeholder="https://api.company.com"
                      disabled={isReadonly}
                      className="h-9 flex-1 rounded-none border-0 bg-transparent font-mono text-xs focus-visible:ring-1"
                    />
                    {!isReadonly ? (
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        title="Remove variable"
                        className="mr-2 shrink-0 rounded p-1 text-[var(--muted)] opacity-0 transition-opacity hover:bg-[var(--surface-hover)] hover:text-red-500 group-hover:opacity-100"
                      >
                        <Trash2 size={13} />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}

          {visibleIndexes.length === 0 ? (
            <tr>
              <td colSpan={2} className="px-3 py-3 text-center text-xs text-[var(--muted)]">
                {query ? "No variables match your search." : "No variables yet."}
              </td>
            </tr>
          ) : null}

          {!isReadonly ? (
            <tr>
              <td colSpan={2} className="p-0">
                <button
                  type="button"
                  onClick={addRow}
                  className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs text-[var(--muted)] hover:bg-[var(--surface-hover)]/60 hover:text-[var(--text)]"
                >
                  <Plus size={12} />
                  Add variable
                </button>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export function CollectionEnvironmentsPanel({
  environments,
  isReadonly,
  isCreatingEnvironment,
  settingActiveEnvironmentId,
  isSavingEnvironmentVariables,
  deletingEnvironmentId,
  onCreateEnvironment,
  onSetActiveEnvironment,
  onSaveEnvironmentVariables,
  onDeleteEnvironment,
}: CollectionEnvironmentsPanelProps) {
  const [newEnvironmentName, setNewEnvironmentName] = useState("");
  const [selectedEnvironmentIdOverride, setSelectedEnvironmentIdOverride] = useState<string | null>(null);

  const selectedEnvironmentId =
    selectedEnvironmentIdOverride && environments.some((env) => env.id === selectedEnvironmentIdOverride)
      ? selectedEnvironmentIdOverride
      : environments.find((env) => env.is_default)?.id ?? environments[0]?.id ?? "";

  const selectedEnvironment = environments.find((env) => env.id === selectedEnvironmentId) ?? null;

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newEnvironmentName.trim()) return;
    onCreateEnvironment(newEnvironmentName.trim());
    setNewEnvironmentName("");
  }

  return (
    <div className="space-y-4 pt-3">
      <div className="space-y-2">
        {environments.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No environments yet. Create one (e.g. &quot;Dev&quot;, &quot;Staging&quot;) to define variables this
            collection&apos;s requests can use via <code>{"{{variable}}"}</code>.
          </p>
        ) : null}

        {environments.map((environment) => (
          <div key={environment.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedEnvironmentIdOverride(environment.id)}
              className={`odl-list-item flex-1 ${selectedEnvironmentId === environment.id ? "odl-list-item-active" : ""}`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Globe size={12} />
                {environment.name}
              </span>
              {environment.is_default ? (
                <span className="rounded-full bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  active
                </span>
              ) : null}
            </button>

            {!isReadonly && !environment.is_default ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Set as active environment"
                disabled={settingActiveEnvironmentId === environment.id}
                onClick={() => onSetActiveEnvironment(environment.id)}
              >
                {settingActiveEnvironmentId === environment.id ? (
                  <LoaderCircle className="animate-spin" size={14} />
                ) : (
                  <Check size={14} />
                )}
              </Button>
            ) : null}

            {!isReadonly ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Delete environment"
                disabled={deletingEnvironmentId === environment.id}
                onClick={() => onDeleteEnvironment(environment.id)}
              >
                {deletingEnvironmentId === environment.id ? (
                  <LoaderCircle className="animate-spin" size={14} />
                ) : (
                  <Trash2 size={14} />
                )}
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      {!isReadonly ? (
        <form onSubmit={handleCreate} className="flex gap-2">
          <Input
            value={newEnvironmentName}
            onChange={(event) => setNewEnvironmentName(event.target.value)}
            className="text-sm"
            placeholder="New environment (e.g. Dev)"
          />
          <Button type="submit" variant="secondary" disabled={isCreatingEnvironment || !newEnvironmentName.trim()}>
            {isCreatingEnvironment ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />}
            Add
          </Button>
        </form>
      ) : null}

      {selectedEnvironment ? (
        <EnvironmentVariablesEditor
          key={selectedEnvironment.id}
          environment={selectedEnvironment}
          isReadonly={isReadonly}
          isSaving={isSavingEnvironmentVariables}
          onSave={(variables) => onSaveEnvironmentVariables(selectedEnvironment.id, variables)}
        />
      ) : null}
    </div>
  );
}
