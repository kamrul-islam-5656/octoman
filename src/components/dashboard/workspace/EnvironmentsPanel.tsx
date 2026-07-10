import { Dispatch, FormEvent, SetStateAction, useMemo } from "react";
import { Clock4, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnvironmentDto, EnvironmentVariable } from "@/types";

interface EnvironmentsPanelProps {
  environments: EnvironmentDto[];
  selectedEnvironmentId: string;
  environmentVariablesDraft: EnvironmentVariable[];
  setEnvironmentVariablesDraft: Dispatch<SetStateAction<EnvironmentVariable[]>>;
  newEnvironmentName: string;
  setNewEnvironmentName: (value: string) => void;
  isReadonly: boolean;
  onSelectEnvironment: (environmentId: string) => void;
  onCreateEnvironment: (event: FormEvent<HTMLFormElement>) => void;
  onSaveEnvironmentVariables: () => void;
  onSetDefaultEnvironment: (environmentId: string) => void;
  isCreatingEnvironment: boolean;
  isSavingEnvironmentVariables: boolean;
  settingDefaultEnvironmentId: string | null;
}

export function EnvironmentsPanel({
  environments,
  selectedEnvironmentId,
  environmentVariablesDraft,
  setEnvironmentVariablesDraft,
  newEnvironmentName,
  setNewEnvironmentName,
  isReadonly,
  onSelectEnvironment,
  onCreateEnvironment,
  onSaveEnvironmentVariables,
  onSetDefaultEnvironment,
  isCreatingEnvironment,
  isSavingEnvironmentVariables,
  settingDefaultEnvironmentId,
}: EnvironmentsPanelProps) {
  const selectedEnvironment = useMemo(
    () => environments.find((env) => env.id === selectedEnvironmentId) ?? null,
    [environments, selectedEnvironmentId],
  );

  return (
    <section className="space-y-4">
      <p className="odl-sidebar-title">
        <Clock4 size={14} />
        Environments
      </p>

      <div className="space-y-2">
        {environments.map((environment) => (
          <div key={environment.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectEnvironment(environment.id)}
              className={`odl-list-item flex-1 ${
                selectedEnvironmentId === environment.id ? "odl-list-item-active" : ""
              }`}
            >
              {environment.name}
              {environment.is_default ? (
                <span className="rounded-full bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  default
                </span>
              ) : null}
            </button>

            {!isReadonly ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Set as default"
                disabled={settingDefaultEnvironmentId === environment.id}
                onClick={() => onSetDefaultEnvironment(environment.id)}
              >
                {settingDefaultEnvironmentId === environment.id ? (
                  <LoaderCircle className="animate-spin" size={14} />
                ) : (
                  <Save size={14} />
                )}
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      {!isReadonly ? (
        <form onSubmit={onCreateEnvironment} className="flex gap-2">
          <Input
            value={newEnvironmentName}
            onChange={(event) => setNewEnvironmentName(event.target.value)}
            className="text-sm"
            placeholder="New environment"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            title="Add environment"
            disabled={isCreatingEnvironment}
          >
            {isCreatingEnvironment ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />}
          </Button>
        </form>
      ) : null}

      {selectedEnvironment ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/70 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Variables ({selectedEnvironment.name})
            </p>
            {!isReadonly ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isSavingEnvironmentVariables}
                onClick={onSaveEnvironmentVariables}
              >
                {isSavingEnvironmentVariables ? (
                  <LoaderCircle className="animate-spin" size={14} />
                ) : (
                  <Save size={14} />
                )}
                Save
              </Button>
            ) : null}
          </div>

          <div className="space-y-2">
            {environmentVariablesDraft.map((variable, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  className="text-xs font-mono"
                  placeholder="base_url"
                  value={variable.key}
                  onChange={(event) =>
                    setEnvironmentVariablesDraft((previous) =>
                      previous.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, key: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Input
                  className="text-xs font-mono"
                  placeholder="https://api.company.com"
                  value={variable.value}
                  onChange={(event) =>
                    setEnvironmentVariablesDraft((previous) =>
                      previous.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, value: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setEnvironmentVariablesDraft((previous) =>
                      previous.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}

            {!isReadonly ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setEnvironmentVariablesDraft((previous) => [...previous, { key: "", value: "" }])
                }
              >
                <Plus size={14} />
                Add Variable
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
