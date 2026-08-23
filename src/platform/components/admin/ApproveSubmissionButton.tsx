'use client';

type Props = {
  submissionId: string;
  confirmMessage: string | null;
  action: (formData: FormData) => void | Promise<void>;
  label?: string;
};

export function ApproveSubmissionButton({
  submissionId,
  confirmMessage,
  action,
  label = 'Approve',
}: Props) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="submissionId" value={submissionId} />
      <button type="submit" className="plt-btn-primary text-xs py-1">
        {label}
      </button>
    </form>
  );
}
