export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ flex: "none" }}>
      <circle cx="32" cy="32" r="18" fill="none" stroke="#DCE6FB" strokeWidth="3.5" />
      <circle cx="32" cy="32" r="8.5" fill="#FF9F0A" />
      <circle cx="32" cy="14" r="5" fill="#5E5CE6" />
      <circle cx="47.6" cy="41" r="5" fill="#30B0C7" />
      <circle cx="16.4" cy="41" r="5" fill="#0071E3" />
    </svg>
  );
}
