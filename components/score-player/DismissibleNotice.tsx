import { Button } from '../ui/Button';

/** A pill at the bottom of the player with a message and a Dismiss link (a page or note-highlight problem). */
export default function DismissibleNotice({
  children,
  onDismiss,
}: {
  children: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="sticky bottom-2 mx-auto mt-2 flex w-fit items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-900"
      role="status"
    >
      <span>{children}</span>
      <Button variant="link" size="text" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}
