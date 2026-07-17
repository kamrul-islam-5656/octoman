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
            <li>Download the extension package below.</li>
            <li>Unzip it to a folder you&apos;ll keep (don&apos;t delete it afterwards).</li>
            <li>
              In Chrome or Edge, open the extensions page, enable Developer mode, and load the unzipped
              folder.
            </li>
            <li>Reload this tab — the extension stays active from then on.</li>
          </ol>

          <p>Without it, Octoman will still try a direct request from the browser, which may fail if the server doesn&apos;t allow it.</p>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onDismiss}>
            Not now
          </Button>
          <Button asChild>
            <a href="/downloads/octoman-local-request-helper.zip" download>
              Download extension
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
