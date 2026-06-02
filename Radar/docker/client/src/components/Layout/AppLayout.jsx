/**
 * AppLayout — top-level CSS Grid shell.
 *
 * Children are expected in this order:
 *   [header, sidebar, main, bottom]
 *
 * Each child should set its own `className` or inline `gridArea` to match
 * the CSS grid-template-areas defined in AppLayout.css.
 */
export default function AppLayout({ children }) {
  return <div className="app-layout">{children}</div>;
}
