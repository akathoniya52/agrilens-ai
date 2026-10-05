import { Skeleton } from "@/components/ui";
import { useTranslations } from "next-intl";

export function MessagesSkeleton() {
  const t = useTranslations("common");
  return (
    <div role="status" aria-label={t("loading")} className="space-y-8 py-4">
      <Skeleton className="ml-auto h-11 w-2/5 rounded-3xl rounded-br-lg" />
      <div className="flex gap-3">
        <Skeleton className="h-8 w-8 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2.5 pt-1">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      <Skeleton className="ml-auto h-11 w-1/3 rounded-3xl rounded-br-lg" />
      <div className="flex gap-3">
        <Skeleton className="h-8 w-8 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2.5 pt-1">
          <Skeleton className="h-32 w-full rounded-3xl" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}

export function ChatListSkeleton() {
  return (
    <div aria-hidden className="space-y-1.5 px-2 pt-2">
      <Skeleton className="mb-3 ml-2 h-3 w-16" />
      {["w-4/5", "w-2/3", "w-11/12", "w-1/2", "w-3/4", "w-3/5"].map((width) => (
        <Skeleton key={width} className={`h-10 rounded-xl ${width}`} />
      ))}
    </div>
  );
}
