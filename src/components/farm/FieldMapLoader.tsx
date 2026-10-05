"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui";
import type { FieldMapProps } from "./FieldMap";

const FieldMap = dynamic(() => import("./FieldMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

export default function FieldMapLoader(props: FieldMapProps) {
  return <FieldMap {...props} />;
}
