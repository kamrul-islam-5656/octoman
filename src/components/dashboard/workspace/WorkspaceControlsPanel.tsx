import { RefObject } from "react";
import { Download, FileJson2, LoaderCircle, Settings, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UserRole } from "@/types";

import { canAdmin } from "./utils";

interface WorkspaceControlsPanelProps {
  role: UserRole | undefined;
  isImporting: boolean;
  importInputRef: RefObject<HTMLInputElement | null>;
  onExport: () => void;
  onOpenSettings: () => void;
}

export function WorkspaceControlsPanel({
  role,
  isImporting,
  importInputRef,
  onExport,
  onOpenSettings,
}: WorkspaceControlsPanelProps) {
  return (
    <section className="space-y-3">
      <p className="odl-sidebar-title">
        <FileJson2 size={14} />
        Workspace Controls
      </p>

      {canAdmin(role) ? (
        <>
          <Button type="button" variant="secondary" className="w-full justify-center" onClick={onExport}>
            <Download size={16} />
            Export JSON
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-center"
            onClick={() => importInputRef.current?.click()}
            disabled={isImporting}
          >
            {isImporting ? <LoaderCircle className="animate-spin" size={16} /> : <Upload size={16} />}
            Import JSON
          </Button>
          <Button type="button" variant="secondary" className="w-full justify-center" onClick={onOpenSettings}>
            <Settings size={16} />
            Organization &amp; Users
          </Button>
        </>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          Ask an Admin for import/export workspace actions.
        </p>
      )}
    </section>
  );
}
