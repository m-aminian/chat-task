export function DaySeparator({ label }: { label: string }) {
  return (
    <div className="day-separator" role="separator">
      <span>{label}</span>
    </div>
  );
}
