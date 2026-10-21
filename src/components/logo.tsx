/* The logo for a placement. Served from /api/brand/<placement>, which falls back to the built-in Fodan Sunday School Academy brand. */
export function Logo({ placement = "header-light", height = 40, alt = "Fodan Sunday School Academy", className }: { placement?: string; height?: number; alt?: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/brand/${placement}`} alt={alt} height={height} style={{ height, width: "auto" }} className={className} />;
}
