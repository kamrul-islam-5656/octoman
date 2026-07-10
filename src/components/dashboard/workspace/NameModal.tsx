import { FormEvent } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { NameModalState } from "./types";

interface NameModalProps {
  nameModal: NameModalState | null;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  isSubmitting: boolean;
}

export function NameModal({
  nameModal,
  value,
  onValueChange,
  onSubmit,
  onClose,
  isSubmitting,
}: NameModalProps) {
  if (!nameModal) {
    return null;
  }

  const title =
    nameModal.mode === "create-collection"
      ? "New Collection"
      : nameModal.mode === "create-folder"
        ? "New Folder"
        : nameModal.mode === "rename-collection"
          ? "Rename Collection"
          : nameModal.mode === "rename-folder"
            ? "Rename Folder"
            : "Rename Request";

  return (
    <Dialog open onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            autoFocus
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder="Name"
            disabled={isSubmitting}
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <LoaderCircle className="animate-spin" size={16} /> : null}
              {nameModal.mode.startsWith("create") ? "Create" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
