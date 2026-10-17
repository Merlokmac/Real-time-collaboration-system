// Mốc màn hình dùng trong JS, phải khớp với các @media trong file CSS (xem variables.css)
export const BREAKPOINTS = {
  mobile: 640,
  tablet: 1024,
} as const;

export const MEDIA = {
  mobile: `(max-width: ${BREAKPOINTS.mobile}px)`,
  tabletDown: `(max-width: ${BREAKPOINTS.tablet}px)`,
} as const;
