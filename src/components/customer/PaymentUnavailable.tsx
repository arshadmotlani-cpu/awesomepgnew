export function PaymentUnavailable({ message }: { message?: string }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-semibold">Online payment unavailable</p>
      <p className="mt-1">
        {message ??
          'Payment processing is temporarily unavailable. Please try again later or contact support.'}
      </p>
    </div>
  );
}
