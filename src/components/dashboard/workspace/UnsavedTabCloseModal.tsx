import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface UnsavedTabCloseModalProps {
  requestName: string;
  isSaving: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

export function UnsavedTabCloseModal({ requestName, isSaving, onCancel, onDiscard, onSave }: UnsavedTabCloseModalProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && !isSaving && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--muted)]">
          {requestName || "This request"} has unsaved changes. Save them before closing this tab?
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onDiscard} disabled={isSaving}>
            Don&apos;t Save
          </Button>
          <Button type="button" onClick={onSave} disabled={isSaving}>
            {isSaving ? <LoaderCircle className="animate-spin" size={16} /> : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
