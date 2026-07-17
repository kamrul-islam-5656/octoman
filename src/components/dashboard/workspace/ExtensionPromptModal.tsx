import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ExtensionPromptModalProps {
  open: boolean;
  onDismiss: () => void;
}

export function ExtensionPromptModal({ open, onDismiss }: ExtensionPromptModalProps) {
  if (!open) {
    return null;
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onDismiss()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Install Octoman Local Request Helper</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm text-[var(--muted)]">
          <p>
            This request targets localhost or a private network address. Browsers block cross-origin
            requests like this unless the target server sends CORS headers — installing the{" "}
            <strong className="text-[var(--text)]">Octoman Local Request Helper</strong> extension lets
            Octoman reach it directly, with no CORS setup needed.
          </p>

          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Open <code className="rounded bg-[var(--surface-hover)] px-1 py-0.5">chrome://extensions</code> (or{" "}
              <code className="rounded bg-[var(--surface-hover)] px-1 py-0.5">edge://extensions</code> in Edge).
            </li>
            <li>Turn on Developer mode (top-right toggle).</li>
            <li>Click Load unpacked and select this project&apos;s extension folder.</li>
            <li>Reload this tab — the extension stays active from then on.</li>
          </ol>

          <p>Without it, Octoman will still try a direct request from the browser, which may fail if the server doesn&apos;t allow it.</p>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" onClick={onDismiss}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
