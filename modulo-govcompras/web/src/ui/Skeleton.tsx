import clsx from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-lg bg-slate-100", className)} />;
}

export function SkeletonLinhas({ quantidade = 3 }: { quantidade?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: quantidade }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

export function SkeletonCartoes({ quantidade = 4 }: { quantidade?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {Array.from({ length: quantidade }).map((_, i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}
