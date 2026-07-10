interface IconProps {
  size?: number;
}

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function CameraIcon({ size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...base}>
      <path d="M4 7.5h2.6l1.5-2.2c.3-.4.7-.7 1.2-.7h5.4c.5 0 .9.3 1.2.7l1.5 2.2H20a1.6 1.6 0 0 1 1.6 1.6v8.8A1.6 1.6 0 0 1 20 19.5H4a1.6 1.6 0 0 1-1.6-1.6V9.1A1.6 1.6 0 0 1 4 7.5Z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  );
}

export function ListIcon({ size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...base}>
      <path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20" />
      <circle cx="4.4" cy="6.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.4" cy="17.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ChartIcon({ size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...base}>
      <path d="M4 4v16h16" />
      <path d="M8.5 15.5v-4M12.5 15.5V8M16.5 15.5v-6.5" />
    </svg>
  );
}

export function GearIcon({ size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...base}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.2v2.2M12 18.6v2.2M20.8 12h-2.2M5.4 12H3.2M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6M18.2 18.2l-1.6-1.6M7.4 7.4 5.8 5.8" />
    </svg>
  );
}

export function PulseIcon({ size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...base}>
      <path d="M3 12h4l2.2-5.5L13.5 17l2.3-5H21" />
    </svg>
  );
}

export function ChevronLeft({ size = 20 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...base}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
  );
}
