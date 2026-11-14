// Small inline icon set. Icons are decorative: every control that uses one also
// has a text label, so they are hidden from assistive tech.

import type { ReactNode, SVGProps } from "react";
import type { Mode } from "@/lib/modes";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 24, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
      className={`shrink-0 ${rest.className ?? ""}`}
    >
      {children}
    </svg>
  );
}

export const EyeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const TextIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5h16M4 10h16M4 15h16M4 20h9" />
  </Icon>
);

export const LabelIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 2.5h12v19l-3-2-3 2-3-2-3 2z" />
    <path d="M9 7.5h6M9 11.5h6M9 15.5h3" />
  </Icon>
);

export const GlobeIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M2.5 12h19M12 2.5c2.6 2.7 3.9 5.9 3.9 9.5s-1.3 6.8-3.9 9.5c-2.6-2.7-3.9-5.9-3.9-9.5s1.3-6.8 3.9-9.5z" />
  </Icon>
);

export const CameraIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.8l1.7-2.5h6l1.7 2.5h2.8A1.5 1.5 0 0 1 21 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
);

export const UploadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 15V3.5M7 8.5l5-5 5 5M4 15v4a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-4" />
  </Icon>
);

export const MicIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="2.5" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
  </Icon>
);

export const ReplayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" />
    <path d="M3.5 3.5v5h5" />
  </Icon>
);

export const StopIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
  </Icon>
);

export const SpeakerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9h3.5L13 4.5v15L7.5 15H4z" />
    <path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" />
  </Icon>
);

export const SpeakerOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9h3.5L13 4.5v15L7.5 15H4z" />
    <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={3}>
    <path d="M4.5 12.5l5 5 10-11" />
  </Icon>
);

export const SendIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 12h15M13.5 6l6 6-6 6" />
  </Icon>
);

export const ImageIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="M21 16l-5-5-9 9" />
  </Icon>
);

/** App mark: an eye with a solid pupil. */
export const LogoMark = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <rect width="32" height="32" rx="8" fill="#000" stroke="var(--accent)" strokeWidth="2" />
    <ellipse cx="16" cy="16" rx="11" ry="6.8" fill="none" stroke="var(--accent)" strokeWidth="2.6" />
    <circle cx="16" cy="16" r="3.6" fill="var(--accent)" />
  </svg>
);

export const MODE_ICONS: Record<Mode, (p: IconProps) => ReactNode> = {
  read: TextIcon,
  describe: EyeIcon,
  menu: LabelIcon,
  translate: GlobeIcon,
};
