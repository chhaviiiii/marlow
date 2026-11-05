export function PieceMark({ id }: { id: string }) {
  const common = { fill: "none", stroke: "#001435", strokeWidth: 1.4, strokeLinecap: "round" as const };
  return (
    <svg className="drawing" viewBox="0 0 84 64" aria-hidden>
      {id === "desk-walnut" && (
        <>
          <path d="M8 28h68M14 28v22M70 28v22M18 50h48" {...common} />
          <path d="M22 28v-6h18v6" {...common} />
        </>
      )}
      {id === "stool-oak" && (
        <>
          <ellipse cx="42" cy="24" rx="18" ry="7" {...common} />
          <path d="M28 28l-8 22M56 28l8 22M42 30v20" {...common} />
        </>
      )}
      {id === "table-walnut" && (
        <>
          <path d="M6 26h72M16 26v24M68 26v24M12 50h60" {...common} />
        </>
      )}
      {id === "chair-leather" && (
        <>
          <path d="M24 18h28v20H24zM28 38l-6 14M48 38l6 14M30 18V10h16v8" {...common} />
        </>
      )}
      {id === "bedside-oak" && <path d="M26 14h32v36H26zM26 30h32M34 22h8M34 38h8" {...common} />}
      {id === "bench-elm" && <path d="M8 28h68M18 28v18M66 28v18" {...common} />}
      {id === "shelf-walnut" && <path d="M14 18h56M14 32h56M14 46h56M18 14v36M66 14v36" {...common} />}
      {id === "daybed-oak" && <path d="M10 36h64M16 36V20h10v16M18 36v12M64 36v12" {...common} />}
    </svg>
  );
}
