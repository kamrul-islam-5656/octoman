import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { DeleteConfirmState } from "./types";

interface DeleteConfirmModalProps {
  deleteConfirm: DeleteConfirmState | null;
  onCancel: () => void;
  onConfirm: () => void;
  isConfirming: boolean;
}

export function DeleteConfirmModal({ deleteConfirm, onCancel, onConfirm, isConfirming }: DeleteConfirmModalProps) {
  if (!deleteConfirm) {
    return null;
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !isConfirming && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{deleteConfirm.title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--muted)]">{deleteConfirm.message}</p>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isConfirming}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? <LoaderCircle className="animate-spin" size={16} /> : null}
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
