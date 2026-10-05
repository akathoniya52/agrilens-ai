"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui";
import type { OutbreakMapProps } from "./OutbreakMap";

const OutbreakMap = dynamic(() => import("./OutbreakMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

export default function OutbreakMapLoader(props: OutbreakMapProps) {
  return <OutbreakMap {...props} />;
}
