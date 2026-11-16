// The screen header from the design prototype: a muted context line, then the 32 px title (spec 19.6).
export function PageHeader({
  context,
  title,
  subtitle,
}: {
  context?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-4">
      {context && <p className="text-sm text-muted">{context}</p>}
      <h1 className="text-[32px] leading-[1.1]">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </header>
  );
}
